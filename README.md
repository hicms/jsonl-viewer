# JSONL Viewer

**English** | [简体中文](README.zh-CN.md)

A local desktop tool built with Rust, Tauri 2, React 19, and Astryx for viewing JSON Lines data and agent sessions.

## Usage

- Open, drag and drop, or double-click `.jsonl` / `.ndjson` files. `.json`, `.log`, and `.txt` files can also be read line by line.
- Table, tree, raw text, and session views, with search across loaded content, row details, copying, column visibility, and column resizing.
- Row details overlay the right side of the window without shrinking the main content. The panel uses 50% of the window width, up to 960 pixels, and fills the content viewport height. The title, edit/save actions, and copy action stay fixed while the content scrolls in a single area.
- Switching views first displays an Astryx skeleton screen, then builds the data view. Table and tree views show short previews of long text; full JSON is available in row details or expanded rows.
- Automatically detects STS, Codex, Claude Code, Pi, and Hermes sessions and displays messages, thinking, tool calls and results, models, reasoning effort, and token usage.
- The desktop sidebar keeps file actions at the top and language, appearance, and zoom at the bottom. In narrow windows, these settings are available by scrolling the navigation drawer. Document save/edit controls sit beside the title; view and column controls sit above full-width search. Column choices persist and remain available while filtering loaded records.
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

Requires Node.js 22.12+ and rustup; `rust-toolchain.toml` pins Rust. Windows also needs MSVC C++ Build Tools and WebView2; macOS needs Xcode Command Line Tools; Linux needs WebKitGTK 4.1, GTK 3, OpenSSL and the other [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
npm ci
npm run desktop
```

`npm run dev` starts only the frontend preview; local file operations require the Tauri desktop process.

```powershell
npm run build                         # TypeScript checks and frontend build
npm test                              # Frontend state and editing regressions
npm run test:release                   # Release regressions; requires PowerShell 7 and Git
cargo test --manifest-path src-tauri/Cargo.toml --locked --no-default-features
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
npm run tauri -- build --debug --no-bundle
npm run test:native                    # Windows WebView2 with real file reads and writes
npm run desktop:build                  # Release EXE and NSIS installer
```

On Windows, `npm run desktop:build` outputs `src-tauri/target/release/JSONL Viewer.exe` and `src-tauri/target/release/bundle/nsis/JSONL Viewer_2.0.0_x64-setup.exe`.

Native tests create files in the system temporary directory and leave the project's sample files unchanged. Close any running JSONL Viewer instance before testing so that the single-instance process does not receive the test arguments. Screenshots are written to the temporary directory by default; set `JSONL_QA_ARTIFACT_DIR` to choose where to save them.

## CI and Releases

GitHub Actions runs `CI` on branch pushes, pull requests and manual dispatches. Pushing a stable `vX.Y.Z` tag runs the same checks and builds through `Release`, then publishes a GitHub Release. Manually dispatching `Release` generates preview artifacts only; it does not create a tag or publish a release.

| Platform | Architectures | Installers |
|---|---|---|
| Linux | x64, ARM64 | `.deb`, `.AppImage` |
| macOS | Intel x64, Apple Silicon ARM64 | `.dmg` |
| Windows | x64, ARM64 | NSIS `.exe` |

Assets use `JSONL-Viewer_<version>_<platform>-<architecture>`, for example `JSONL-Viewer_2.0.0_windows-arm64-setup.exe`. Each release contains eight installers and `SHA256SUMS.txt`. The CI `release-preview` artifact also includes release notes. `scripts/release-config.mjs` defines the platforms, architectures and asset names.

Linux packages target Ubuntu 22.04 or compatible newer systems; AppImage may require FUSE 2. Windows ARM64 packages contain a native ARM64 app with an x86 NSIS installer. macOS packages are ad-hoc signed without Apple notarization; first launch may require approval in System Settings → Privacy & Security. Windows installers do not have a code signing certificate configured.

CI runs Rust file I/O regressions and Clippy on all six platforms, plus frontend type checks, frontend tests and release tooling regressions. Windows runs real WebView2 file I/O tests. Linux/macOS use a desktop process startup smoke check, which does not cover complete GUI or Finder interactions.

### Publish Manually

Install PowerShell 7, Git, Node.js and GitHub CLI, and authenticate with `gh auth login`. Once the source and release workflows are pushed, start from a clean `main` matching `origin/main`:

```powershell
npm run release -- -Help
npm run release -- -Publish                  # e.g. 2.0.0 -> 2.0.1
npm run release -- -Publish -Version 2.1.0    # Choose a stable version
```

You can also run `pwsh -NoProfile -File scripts/release.ps1 -Publish` directly. The script updates `package.json`, `package-lock.json`, Tauri configuration, `Cargo.toml` and `Cargo.lock`, commits the version change, creates an annotated tag and atomically pushes `main` with the tag. An already committed, unpublished current version can be selected with `-Version` without an empty commit. Omitting `-Publish` makes no repository changes.

The script waits for the release workflow matching the tag and commit, then confirms a public stable release with all nine non-empty assets. A failed push preserves the local commit/tag and prints a retry command. Failed workflow jobs can be rerun in Actions. Publication uploads to a draft, verifies every asset size and SHA-256 digest, then makes it public. Failed drafts from the same commit can be retried; published versions cannot be overwritten.

Release notes retain commit titles and bodies, grouped into features, fixes, improvements and maintenance. They include the changes since the previous reachable stable tag, platform downloads, installation/update instructions and checksum verification. Preview notes for the current commit with:

```powershell
node scripts/generate-release-notes.mjs v2.0.0 .plan/release-notes.md --preview
```

The tag must match every manifest and lockfile version. No additional publishing secret is required; only the publish job uses `GITHUB_TOKEN` with `contents: write`. Certificate signing and automatic updates are not configured.

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

Tauri platform configuration selects the appropriate installer formats automatically. Files being continuously written may be temporarily locked by the writing process; drafts are retained if saving fails. Live updates parse only new lines, but file integrity checks read existing bytes, so refresh costs for very large files still grow with file size.

## Component Documentation

```powershell
npm run astryx -- component Table --dense
npm run astryx -- component Chat --dense
```

## License

MIT. Third-party components, fonts, and Rust dependencies are subject to their respective licenses.
