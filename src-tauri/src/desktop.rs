use crate::{
    discovery::{self, Entry, Source},
    documents::{Documents, Edit, Snapshot},
    error::{CommandError, Error},
    open_requests::OpenRequests,
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{Emitter, Manager, State};

#[derive(Clone, Default)]
struct AppState {
    documents: Arc<Mutex<Documents>>,
    startup: Arc<Mutex<OpenRequests>>,
}

async fn work<T: Send + 'static>(
    action: impl FnOnce() -> crate::error::Result<T> + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(action)
        .await
        .map_err(|error| CommandError::from(Error::Invalid(error.to_string())))?
        .map_err(Into::into)
}

#[tauri::command]
async fn open_file(
    state: State<'_, AppState>,
    path: Option<String>,
) -> Result<Option<Snapshot>, CommandError> {
    let documents = state.documents.clone();
    work(move || {
        let path = path.map(PathBuf::from).or_else(|| {
            rfd::FileDialog::new()
                .add_filter("JSON Lines", discovery::DATA_EXTENSIONS)
                .pick_file()
        });
        path.map(|path| {
            documents
                .lock()
                .map_err(|e| Error::Invalid(e.to_string()))?
                .open(&path)
        })
        .transpose()
    })
    .await
}
#[tauri::command]
async fn load_more(
    state: State<'_, AppState>,
    id: String,
    revision: u64,
) -> Result<Snapshot, CommandError> {
    let documents = state.documents.clone();
    work(move || {
        documents
            .lock()
            .map_err(|e| Error::Invalid(e.to_string()))?
            .page(&id, revision)
    })
    .await
}
#[tauri::command]
async fn refresh_file(
    state: State<'_, AppState>,
    id: String,
    revision: u64,
) -> Result<Snapshot, CommandError> {
    let documents = state.documents.clone();
    work(move || {
        documents
            .lock()
            .map_err(|e| Error::Invalid(e.to_string()))?
            .refresh(&id, revision)
    })
    .await
}
#[tauri::command]
async fn save_file(
    state: State<'_, AppState>,
    id: String,
    revision: u64,
    edits: Vec<Edit>,
    save_as: bool,
) -> Result<Option<Snapshot>, CommandError> {
    let documents = state.documents.clone();
    work(move || {
        let destination = if save_as {
            rfd::FileDialog::new()
                .add_filter("JSON Lines", &["jsonl", "ndjson"])
                .set_file_name("edited.jsonl")
                .save_file()
        } else {
            None
        };
        if save_as && destination.is_none() {
            return Ok(None);
        }
        let snapshot = documents
            .lock()
            .map_err(|e| Error::Invalid(e.to_string()))?
            .save(&id, revision, edits, destination.as_deref())?;
        Ok(Some(snapshot))
    })
    .await
}
#[tauri::command]
fn close_file(state: State<'_, AppState>, id: String) -> Result<(), CommandError> {
    state
        .documents
        .lock()
        .map_err(|e| CommandError::from(Error::Invalid(e.to_string())))?
        .close(&id);
    Ok(())
}
#[tauri::command]
async fn choose_folder() -> Result<Option<String>, CommandError> {
    work(|| {
        Ok(rfd::FileDialog::new()
            .pick_folder()
            .map(|p| p.to_string_lossy().into()))
    })
    .await
}
#[tauri::command]
async fn list_dir(path: String) -> Result<Vec<Entry>, CommandError> {
    work(move || discovery::list(&PathBuf::from(path))).await
}
#[tauri::command]
async fn trace_sources() -> Result<Vec<Source>, CommandError> {
    work(|| {
        let home = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .ok_or(Error::HomeUnavailable)?;
        discovery::sources(&PathBuf::from(home))
    })
    .await
}
#[tauri::command]
fn startup_files(state: State<'_, AppState>) -> Result<Vec<String>, CommandError> {
    Ok(state
        .startup
        .lock()
        .map_err(|e| CommandError::from(Error::Invalid(e.to_string())))?
        .start())
}

fn receive_paths(app: &tauri::AppHandle, paths: Vec<String>) {
    let state = app.state::<AppState>();
    if let Ok(mut requests) = state.startup.lock() {
        let ready = requests.receive(paths);
        if !ready.is_empty() {
            let _ = app.emit("open-paths", ready);
        }
    };
}

fn paths(args: impl IntoIterator<Item = String>) -> Vec<String> {
    args.into_iter()
        .filter(|arg| !arg.starts_with('-') && PathBuf::from(arg).is_file())
        .collect()
}

#[tauri::command]
fn set_locale(app: tauri::AppHandle, locale: String) -> Result<(), CommandError> {
    crate::menus::set_locale(&app, &locale)
        .map_err(|error| CommandError::from(Error::Invalid(error.to_string())))
}

pub fn run() {
    let state = AppState::default();
    state
        .startup
        .lock()
        .expect("startup state")
        .receive(paths(std::env::args().skip(1)));
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            receive_paths(app, paths(args.into_iter().skip(1)));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            open_file,
            load_more,
            refresh_file,
            save_file,
            close_file,
            choose_folder,
            list_dir,
            trace_sources,
            startup_files,
            set_locale
        ])
        .setup(|app| {
            crate::menus::install(app.handle())?;
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                window.set_decorations(false)?;
            }
            let handle = app.handle().clone();
            let documents = app.state::<AppState>().documents.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(650));
                let Ok(mut docs) = documents.lock() else {
                    break;
                };
                for id in docs.changed() {
                    let _ = handle.emit("document-changed", id);
                }
            });
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("menu-action", event.id().as_ref());
        })
        .build(tauri::generate_context!())
        .expect("failed to build JSONL Viewer")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                receive_paths(
                    app,
                    paths(urls.into_iter().filter_map(|url| {
                        url.to_file_path()
                            .ok()
                            .map(|path| path.to_string_lossy().into_owned())
                    })),
                );
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
