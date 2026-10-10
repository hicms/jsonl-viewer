use crate::{
    error::Result,
    reader::{self, Cursor},
    traces,
};
use serde::Serialize;
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

pub const DATA_EXTENSIONS: &[&str] = &["jsonl", "ndjson", "json", "log", "txt"];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
    pub trace: Option<Value>,
}

fn entry(path: &Path, probe: bool) -> Result<Entry> {
    let metadata = fs::metadata(path)?;
    let trace = if probe && metadata.is_file() {
        let page = reader::read_page(path, Cursor::default(), 8)?;
        traces::identity(&page.lines, &path.to_string_lossy())
    } else {
        None
    };
    Ok(Entry {
        path: path.to_string_lossy().into(),
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        is_dir: metadata.is_dir(),
        size: metadata.len(),
        modified: metadata
            .modified()?
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        trace,
    })
}

pub fn list(path: &Path) -> Result<Vec<Entry>> {
    let mut entries = Vec::new();
    for result in fs::read_dir(path)? {
        let item = result?;
        let file_type = item.file_type()?;
        if file_type.is_symlink() {
            continue;
        }
        let path = item.path();
        if file_type.is_dir() || is_data(&path) {
            entries.push(entry(&path, true)?);
        }
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

fn is_data(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| DATA_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub key: String,
    pub label: String,
    pub path: String,
    pub exists: bool,
    pub files: Vec<Entry>,
}

pub fn sources(home: &Path) -> Result<Vec<Source>> {
    let definitions = [
        ("codex", "Codex", ".codex/sessions"),
        ("claude", "Claude Code", ".claude/projects"),
        ("pi", "Pi", ".pi/agent/sessions"),
        ("hermes", "Hermes", ".hermes/session-exports/traces"),
    ];
    definitions
        .into_iter()
        .map(|(key, label, relative)| {
            let mut path = home.join(relative);
            if key == "hermes" && !path.exists() {
                path = home.join(".hermes/sessions");
            }
            let mut files = Vec::new();
            if path.is_dir() {
                scan(&path, 0, &mut files)?;
            }
            files.sort_by(|a, b| b.modified.cmp(&a.modified));
            files.truncate(20);
            // Only recent files need format probing; scanning avoids parsing every session.
            for file in &mut files {
                file.trace = entry(Path::new(&file.path), true)?.trace;
            }
            Ok(Source {
                key: key.into(),
                label: label.into(),
                path: path.to_string_lossy().into(),
                exists: path.is_dir(),
                files,
            })
        })
        .collect()
}

fn scan(path: &Path, depth: usize, files: &mut Vec<Entry>) -> Result<()> {
    if depth > 8 {
        return Ok(());
    }
    for result in fs::read_dir(path)? {
        let item = result?;
        let file_type = item.file_type()?;
        let path: PathBuf = item.path();
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if !["node_modules", ".git", "target", "dist", "build", ".cache"]
                .contains(&item.file_name().to_string_lossy().as_ref())
            {
                scan(&path, depth + 1, files)?;
            }
        } else if path
            .extension()
            .is_some_and(|e| e == "jsonl" || e == "ndjson")
        {
            files.push(entry(&path, false)?);
        }
    }
    Ok(())
}
