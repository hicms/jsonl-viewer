use jsonl_viewer_core::{
    documents::{Documents, Edit},
    error::Error,
};
use serde_json::json;
use std::fs;

#[test]
fn multiline_document_loads_completely_and_save_preserves_nested_tail() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("backup.JSON");
    let mut value =
        json!({"name": "原文", "entries": (0..6001).collect::<Vec<_>>(), "tail": {"keep": true}});
    let original = format!(
        "\u{feff}{}\r\n",
        serde_json::to_string_pretty(&value)
            .unwrap()
            .replace('\n', "\r\n")
    );
    fs::write(&path, &original).unwrap();
    let mut docs = Documents::default();
    let opened = docs.open(&path).unwrap();
    assert_eq!(opened.lines.len(), 1);
    assert_eq!(opened.total_lines, original.lines().count());
    assert!(!opened.has_more);
    assert_eq!(opened.lines[0].raw, original);
    assert_eq!(opened.lines[0].value, value);
    assert!(opened.lines[0].parse_error.is_none());
    let paged = docs.page(&opened.id, opened.revision).unwrap();
    assert_eq!(paged.revision, opened.revision);
    let copy = dir.path().join("copy.json");
    docs.save(&opened.id, opened.revision, vec![], Some(&copy))
        .unwrap();
    assert_eq!(fs::read(&copy).unwrap(), original.as_bytes());
    value["name"] = json!("已修改");
    let edit = || Edit {
        index: 0,
        raw: serde_json::to_string_pretty(&value).unwrap(),
        original: original.clone(),
    };
    docs.save(&opened.id, opened.revision, vec![edit()], Some(&copy))
        .unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), original);
    let saved = docs
        .save(&opened.id, opened.revision, vec![edit()], None)
        .unwrap();
    let output = fs::read_to_string(&path).unwrap();
    assert!(output.starts_with('\u{feff}'));
    assert!(output.ends_with("\r\n"));
    assert!(!output.replace("\r\n", "").contains('\n'));
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(output.trim_start_matches('\u{feff}')).unwrap(),
        value
    );
    assert_eq!(saved.lines[0].value, value);
    assert_eq!(fs::read(&copy).unwrap(), fs::read(&path).unwrap());
}

#[test]
fn arrays_scalars_and_invalid_documents_have_one_record_and_refresh_whole() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("value.json");
    for source in [
        "[\n  1,\n  {\"two\":2}\n]",
        "null",
        "42",
        "\"文本\"",
        "{",
        "",
    ] {
        fs::write(&path, source).unwrap();
        let mut docs = Documents::default();
        let opened = docs.open(&path).unwrap();
        assert_eq!(opened.lines.len(), 1);
        assert_eq!(opened.lines[0].raw, source);
        assert_eq!(
            opened.lines[0].parse_error.is_some(),
            serde_json::from_str::<serde_json::Value>(source).is_err()
        );
        let completed = "{\n  \"completed\": true,\n  \"tail\": [1,2,3]\n}\n";
        fs::write(&path, completed).unwrap();
        assert!(matches!(
            docs.save(&opened.id, opened.revision, vec![], None),
            Err(Error::Conflict)
        ));
        let refreshed = docs.refresh(&opened.id, opened.revision).unwrap();
        assert_eq!(refreshed.lines.len(), 1);
        assert_eq!(refreshed.lines[0].raw, completed);
        assert_eq!(refreshed.lines[0].value["completed"], true);
        assert!(!refreshed.has_more);
    }
}

#[test]
fn invalid_edits_do_not_write_and_empty_document_can_be_repaired() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("empty.json");
    fs::write(&path, "").unwrap();
    let mut docs = Documents::default();
    let opened = docs.open(&path).unwrap();
    assert!(matches!(
        docs.save(
            &opened.id,
            opened.revision,
            vec![Edit {
                index: 0,
                original: "".into(),
                raw: "{".into()
            }],
            None
        ),
        Err(Error::InvalidEdit { .. })
    ));
    assert_eq!(fs::read_to_string(&path).unwrap(), "");
    let saved = docs
        .save(
            &opened.id,
            opened.revision,
            vec![Edit {
                index: 0,
                original: "".into(),
                raw: "{\"fixed\":true}".into(),
            }],
            None,
        )
        .unwrap();
    assert_eq!(saved.lines[0].value, json!({"fixed":true}));
    assert!(!fs::read_to_string(&path).unwrap().ends_with('\n'));
}
