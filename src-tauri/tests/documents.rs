#[cfg(windows)]
use jsonl_viewer_core::documents::open_for_save;
use jsonl_viewer_core::{
    documents::{Documents, Edit},
    error::Error,
    reader::{self, Cursor},
};
use std::{fs, io::Write};

#[test]
fn pagination_preserves_physical_indexes_and_unread_content() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("data.jsonl");
    let data = (0..6000)
        .map(|n| {
            if n % 7 == 0 {
                "\r\n".into()
            } else {
                format!(" {{\"n\":{n}}}\r\n")
            }
        })
        .collect::<String>();
    fs::write(&path, &data).unwrap();
    let mut docs = Documents::default();
    let first = docs.open(&path).unwrap();
    assert!(first.has_more);
    assert_eq!(first.lines[0].index, 1);
    let second = docs.page(&first.id, first.revision).unwrap();
    let indexes = second.lines.iter().map(|l| l.index).collect::<Vec<_>>();
    assert!(indexes.windows(2).all(|w| w[0] < w[1]));
    let saved = docs
        .save(
            &first.id,
            second.revision,
            vec![Edit {
                index: 1,
                raw: "{\"n\":\"edited\"}".into(),
                original: " {\"n\":1}".into(),
            }],
            None,
        )
        .unwrap();
    let output = fs::read_to_string(&path).unwrap();
    assert_eq!(output.lines().count(), 6000);
    assert!(output.contains(" {\"n\":5998}\r\n"));
    assert_eq!(output, data.replacen(" {\"n\":1}", "{\"n\":\"edited\"}", 1));
    assert_eq!(saved.total_lines, 6000);
}

#[test]
fn partial_line_and_utf8_are_replaced_on_append() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("live.jsonl");
    fs::write(&path, "{\"text\":\"你好\"}\n{\"n\":").unwrap();
    let mut docs = Documents::default();
    let first = docs.open(&path).unwrap();
    assert!(first.lines[1].parse_error.is_some());
    fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .unwrap()
        .write_all(b"2}\n{\"n\":3}\n")
        .unwrap();
    let second = docs.refresh(&first.id, first.revision).unwrap();
    assert_eq!(second.lines.len(), 3);
    assert_eq!(second.lines[1].value["n"], 2);
    assert_eq!(second.lines[0].value["text"], "你好");
}

#[test]
fn conflict_invalid_edit_and_failed_save_preserve_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("safe.jsonl");
    fs::write(&path, "{\"n\":1}\n").unwrap();
    let mut docs = Documents::default();
    let first = docs.open(&path).unwrap();
    let invalid = docs.save(
        &first.id,
        first.revision,
        vec![Edit {
            index: 0,
            raw: "broken".into(),
            original: "{\"n\":1}".into(),
        }],
        None,
    );
    assert!(matches!(invalid, Err(Error::InvalidEdit { .. })));
    assert_eq!(fs::read_to_string(&path).unwrap(), "{\"n\":1}\n");
    fs::write(&path, "{\"n\":2}\n").unwrap();
    assert!(matches!(
        docs.save(&first.id, first.revision, vec![], None),
        Err(Error::Conflict)
    ));
    assert_eq!(fs::read_to_string(&path).unwrap(), "{\"n\":2}\n");
    let refreshed = docs.refresh(&first.id, first.revision).unwrap();
    assert!(docs
        .save(
            &first.id,
            refreshed.revision,
            vec![],
            Some(&dir.path().join("missing/out.jsonl"))
        )
        .is_err());
    assert_eq!(fs::read_to_string(&path).unwrap(), "{\"n\":2}\n");
}

#[test]
fn save_as_is_complete_and_leaves_source_unchanged() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("in.jsonl");
    let out = dir.path().join("out.jsonl");
    let content = (0..2001)
        .map(|n| format!("{{\"n\":{n}}}\n"))
        .collect::<String>();
    fs::write(&path, &content).unwrap();
    let mut docs = Documents::default();
    let first = docs.open(&path).unwrap();
    docs.save(
        &first.id,
        first.revision,
        vec![Edit {
            index: 0,
            raw: "{\"n\":99}".into(),
            original: "{\"n\":0}".into(),
        }],
        Some(&out),
    )
    .unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), content);
    assert_eq!(fs::read_to_string(&out).unwrap().lines().count(), 2001);
}

#[test]
fn shrinking_and_grown_rewrite_reload_instead_of_appending() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("session.jsonl");
    fs::write(&path, "{\"n\":1}\n{\"n\":2}\n").unwrap();
    let mut docs = Documents::default();
    let first = docs.open(&path).unwrap();
    fs::write(&path, "{\"different\":\"larger replacement\"}\n").unwrap();
    let second = docs.refresh(&first.id, first.revision).unwrap();
    assert_eq!(second.lines.len(), 1);
    assert_eq!(second.lines[0].value["different"], "larger replacement");
    fs::write(&path, "7").unwrap();
    let third = docs.refresh(&first.id, second.revision).unwrap();
    assert_eq!(third.lines[0].value, 7);
}

#[test]
fn empty_invalid_bom_and_no_final_newline() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("edge.jsonl");
    fs::write(&path, "\u{feff}{\"a\":1}\r\n\r\nbad\nfalse").unwrap();
    let page = reader::read_page(&path, Cursor::default(), 100).unwrap();
    assert_eq!(
        page.lines.iter().map(|l| l.index).collect::<Vec<_>>(),
        vec![0, 2, 3]
    );
    assert_eq!(page.lines[0].value["a"], 1);
    assert!(page.lines[1].parse_error.is_some());
    assert_eq!(page.cursor.index, 3);
}

#[cfg(windows)]
#[test]
fn windows_save_handle_denies_external_writes() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("locked.jsonl");
    fs::write(&path, "{}\n").unwrap();
    let handle = open_for_save(&path).unwrap();
    assert!(fs::OpenOptions::new().append(true).open(&path).is_err());
    drop(handle);
    assert!(fs::OpenOptions::new().append(true).open(&path).is_ok());
}

#[test]
fn refreshed_revision_cannot_overwrite_a_changed_original_line() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("race.jsonl");
    fs::write(&path, "{\"n\":1}\n").unwrap();
    let mut docs = Documents::default();
    let first = docs.open(&path).unwrap();
    fs::write(&path, "{\"n\":2}\n").unwrap();
    let refreshed = docs.refresh(&first.id, first.revision).unwrap();
    assert!(matches!(
        docs.save(
            &first.id,
            refreshed.revision,
            vec![Edit {
                index: 0,
                raw: "{\"n\":3}".into(),
                original: "{\"n\":1}".into()
            }],
            None
        ),
        Err(Error::Conflict)
    ));
    assert_eq!(fs::read_to_string(&path).unwrap(), "{\"n\":2}\n");
    let saved = docs
        .save(
            &first.id,
            refreshed.revision,
            vec![Edit {
                index: 0,
                raw: "{\"n\":3}".into(),
                original: "{\"n\":2}".into(),
            }],
            None,
        )
        .unwrap();
    assert_eq!(saved.lines[0].value["n"], 3);
}

#[test]
fn partial_at_page_boundary_is_eof_and_save_as_source_advances_revision() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("boundary.jsonl");
    fs::write(&path, "{}\n7").unwrap();
    let page = reader::read_page(&path, Cursor::default(), 2).unwrap();
    assert!(!page.has_more);
    let mut docs = Documents::default();
    let first = docs.open(&path).unwrap();
    let second = docs
        .save(
            &first.id,
            first.revision,
            vec![Edit {
                index: 0,
                raw: "[]".into(),
                original: "{}".into(),
            }],
            Some(&path),
        )
        .unwrap();
    assert!(second.revision > first.revision);
    assert_eq!(fs::read_to_string(&path).unwrap(), "[]\n7");
}
