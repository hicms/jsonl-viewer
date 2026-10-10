# JSONL Viewer

**English** | [简体中文](README.zh-CN.md)

A local desktop tool built with Rust, Tauri 2, React 19, and Astryx for viewing JSON Lines data and agent sessions.

## Usage

- Open, drag and drop, or double-click `.jsonl` / `.ndjson` files. `.json`, `.log`, and `.txt` files can also be read line by line.
- Table, tree, raw text, and session views, with search across loaded content, row details, copying, column visibility, and column resizing.
- Row details overlay the right side of the window without shrinking the main content. The panel uses 50% of the window width, up to 960 pixels, and fills the content viewport height. The title, edit/save actions, and copy action stay fixed while the content scrolls in a single area.
- Switching views first displays an Astryx skeleton screen, then builds the data view. Table and tree views show short previews of long text; full JSON is available in row details or expanded rows.
- Automatically detects STS, Codex, Claude Code, Pi, and Hermes sessions and displays messages, thinking, tool calls and results, models, reasoning effort, and token usage.
- Multiple file tabs, directory browsing, recent files, session sources, and navigation between parent and child sessions.
- Recent files retain up to 50 entries. The sidebar initially shows 5 entries and can expand to show more. Hovering over or focusing a history entry reveals a trash icon that removes only that entry. Close buttons are always visible on the active file tab and open-file sidebar entries; other files show them on hover or keyboard focus. Unsaved changes prompt for confirmation before closing.
- Save and error notifications appear at the bottom right. The newest notification sits 80 pixels above the window bottom, independent of application zoom; additional notifications stack upward.
- File close buttons have no background box on hover or press, and retain a focus outline for keyboard navigation.
- Session ordering, width, and detail visibility use icon buttons in the main toolbar, with tooltips on hover. The native Windows menu bar is hidden, while menu keyboard shortcuts remain available.
- Session files refresh automatically when they change, with newest-first ordering, message navigation, and controls to pause or resume following updates.
- Enter edit mode to edit JSON in row details. Valid input is immediately retained as a draft; click Save to write it to disk. Incomplete JSON also triggers an unsaved-changes prompt.
- Light, dark, and system appearance, using the Astryx Neutral theme, with 80%–150% zoom.
- English and Simplified Chinese UI. Choose System, English, or 简体中文 in the file browser's Language selector. System is the default: a Chinese system language selects Simplified Chinese; other languages fall back to English. Manual choices persist across restarts. Switching languages retains open files, drafts, and view state; source data and technical diagnostics are preserved.

Files load in batches of 1,000 non-empty records. Table, tree, and raw text views display 100 loaded records per page. Search covers only currently loaded content. Rust saves files by merging edited rows into the complete source file, preserving unloaded content, untouched whitespace, and line endings. It refuses to overwrite files that have changed externally. Saving a complete copy with Save As retains drafts for the source file.

## Development

Windows requires Rust stable, MSVC C++ Build Tools, Node.js 22.12+, and the WebView2 Runtime.

```powershell
npm ci
npm run desktop
```

`npm run dev` starts only the frontend preview; local file operations require the Tauri desktop process.

```powershell
npm run build                         # TypeScript checks and frontend build
npm test                              # Frontend state and editing regressions
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri -- build --debug --no-bundle
npm run test:native                    # Windows WebView2 with real file reads and writes
npm run desktop:build                  # Release EXE and NSIS installer
```

Native tests create files in the system temporary directory and leave the project's sample files unchanged. Close any running JSONL Viewer instance before testing so that the single-instance process does not receive the test arguments. Screenshots are written to the temporary directory by default; set `JSONL_QA_ARTIFACT_DIR` to choose where to save them.

## Architecture

| Path | Responsibility |
|---|---|
| `src-tauri/src/reader.rs` | Byte cursors, physical line numbers, JSONL pagination, and UTF-8 handling |
| `src-tauri/src/documents.rs` | Document identity and versions, complete-file saves, and conflict checks |
| `src-tauri/src/atomic_save.rs` | Platform-specific atomic replacement |
| `src-tauri/src/traces/` | Format detection, message normalization, tool result matching, and session metadata |
| `src-tauri/src/discovery.rs` | Directories and standard session sources |
| `src-tauri/src/desktop.rs` | Tauri commands, native menus, file change events, and single-instance handling |
| `src-tauri/src/menus.rs` | Native menu shortcuts and labels from the shared language catalogs |
| `src/i18n/` | English and Chinese catalogs, language preference, system language detection, and Astryx internationalization |
| `src/workspace/` | Per-file state, drafts, and validation of asynchronous responses |
| `src/views/` | Table, tree, raw text, session, and row detail views |
| `src/components/` | File browser, toolbar, and session sources |

All interactive controls use Astryx directly. Custom CSS handles only window dimensions, scroll containers, and data layout. File dialogs, menus, and windows are provided by the native platform. Fonts and styles are bundled with the application, with no runtime CDN dependency.

Windows native workflows have automated regression coverage. macOS and Linux have not been verified in the current environment. To build for another platform, install Tauri's prerequisites on that system and adjust the bundle targets. Files being continuously written may be temporarily locked by the writing process; drafts are retained if saving fails. Live updates parse only new lines, but file integrity checks read existing bytes, so refresh costs for very large files still grow with file size.

## Component Documentation

```powershell
npm run astryx -- component Table --dense
npm run astryx -- component Chat --dense
```

## License

MIT. Third-party components, fonts, and Rust dependencies are subject to their respective licenses.
