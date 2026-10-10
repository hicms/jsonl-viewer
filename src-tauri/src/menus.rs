use serde_json::Value;
use tauri::{
    menu::{Menu, MenuItem, MenuItemKind, Submenu},
    AppHandle,
};

type Item = (&'static str, &'static str, Option<&'static str>);
const GROUPS: &[(&str, &str, &[Item])] = &[
    (
        "file",
        "file",
        &[
            ("open", "menuOpen", Some("CmdOrCtrl+O")),
            ("folder", "menuFolder", Some("CmdOrCtrl+Shift+O")),
            ("sources", "menuSources", None),
            ("recent", "menuRecent", None),
            ("save", "save", Some("CmdOrCtrl+S")),
            ("save-as", "saveAs", Some("CmdOrCtrl+Shift+S")),
            ("close", "menuClose", Some("CmdOrCtrl+W")),
            ("close-all", "closeAll", None),
            ("quit", "quit", Some("CmdOrCtrl+Q")),
        ],
    ),
    (
        "edit",
        "edit",
        &[("copy-json", "copySelectedJson", Some("CmdOrCtrl+Shift+C"))],
    ),
    (
        "view",
        "view",
        &[
            ("table", "table", Some("CmdOrCtrl+1")),
            ("tree", "tree", Some("CmdOrCtrl+2")),
            ("raw", "raw", Some("CmdOrCtrl+3")),
            ("trace", "trace", Some("CmdOrCtrl+4")),
            ("theme", "toggleTheme", Some("CmdOrCtrl+Shift+T")),
            ("zoom-in", "zoomIn", Some("CmdOrCtrl+=")),
            ("zoom-out", "zoomOut", Some("CmdOrCtrl+-")),
            ("zoom-reset", "resetZoom", Some("CmdOrCtrl+0")),
        ],
    ),
];

fn catalog(locale: &str) -> Value {
    serde_json::from_str(if locale == "zh-CN" {
        include_str!("../../src/i18n/zh-CN.json")
    } else {
        include_str!("../../src/i18n/en.json")
    })
    .expect("valid application language catalog")
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let labels = catalog("en");
    let menu = Menu::new(app)?;
    for (id, key, items) in GROUPS {
        let submenu = Submenu::with_id(app, *id, labels[*key].as_str().expect("menu label"), true)?;
        for (id, key, shortcut) in *items {
            submenu.append(&MenuItem::with_id(
                app,
                *id,
                labels[*key].as_str().expect("menu label"),
                true,
                *shortcut,
            )?)?;
        }
        menu.append(&submenu)?;
    }
    app.set_menu(menu)?;
    app.hide_menu()?;
    Ok(())
}

pub fn set_locale(app: &AppHandle, locale: &str) -> tauri::Result<()> {
    let labels = catalog(locale);
    let menu = app.menu().expect("installed application menu");
    for (id, key, items) in GROUPS {
        let MenuItemKind::Submenu(submenu) = menu.get(*id).expect("application submenu") else {
            unreachable!()
        };
        submenu.set_text(labels[*key].as_str().expect("menu label"))?;
        for (id, key, _) in *items {
            let MenuItemKind::MenuItem(item) = submenu.get(*id).expect("application menu item")
            else {
                unreachable!()
            };
            item.set_text(labels[*key].as_str().expect("menu label"))?;
        }
    }
    Ok(())
}
