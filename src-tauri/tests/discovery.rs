use jsonl_viewer_core::discovery;
use std::fs;

#[test]
fn source_scans_sort_and_label_codex_parent_relationships() {
    let home = tempfile::tempdir().unwrap();
    let sessions = home.path().join(".codex/sessions/nested");
    fs::create_dir_all(&sessions).unwrap();
    fs::write(
        sessions.join("main.jsonl"),
        "{\"type\":\"session_meta\",\"payload\":{\"id\":\"main\",\"thread_source\":\"user\"}}\n",
    )
    .unwrap();
    fs::write(sessions.join("child.jsonl"),"{\"type\":\"session_meta\",\"payload\":{\"id\":\"child\",\"thread_source\":\"subagent\",\"parent_thread_id\":\"main\"}}\n").unwrap();
    fs::write(sessions.join("ignored.md"), "not data").unwrap();
    let sources = discovery::sources(home.path()).unwrap();
    let codex = &sources[0];
    assert_eq!(codex.files.len(), 2);
    assert!(codex.exists);
    let child = codex
        .files
        .iter()
        .find(|e| e.name == "child.jsonl")
        .unwrap();
    assert_eq!(child.trace.as_ref().unwrap()["parentThreadId"], "main");
    assert!(!sources[1].exists);
    let files = discovery::list(&sessions).unwrap();
    assert_eq!(files.len(), 2);
}
