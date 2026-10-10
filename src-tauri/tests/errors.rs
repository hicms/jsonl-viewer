use jsonl_viewer_core::{
    documents::{Documents, Edit},
    error::{CommandError, Error},
};
use serde_json::json;
use std::fs;

#[test]
fn command_errors_expose_stable_codes_and_parser_details() {
    for (error, code) in [
        (Error::Conflict, "conflict"),
        (Error::NotFound, "closed"),
        (Error::UnloadedEdit, "unloaded_edit"),
        (Error::MultilineEdit, "multiline_edit"),
        (Error::InvalidPath, "invalid_path"),
        (Error::HomeUnavailable, "home_unavailable"),
    ] {
        let value = serde_json::to_value(CommandError::from(error)).unwrap();
        assert_eq!(value["code"], code);
        assert!(value.get("line").is_none());
        assert!(value.get("detail").is_none());
    }
    let value = serde_json::to_value(CommandError::from(Error::InvalidEdit {
        line: 7,
        message: "parser diagnostic".into(),
    }))
    .unwrap();
    assert_eq!(value["code"], "invalid_edit");
    assert_eq!(value["line"], 7);
    assert_eq!(value["detail"], "parser diagnostic");
}

#[test]
fn coded_invalid_saves_preserve_the_original_file() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("data.jsonl");
    let original = " {\"id\":0}\r\n\r\n{\"id\":1}\r\n";
    fs::write(&path, original).unwrap();
    let mut documents = Documents::default();
    let opened = documents.open(&path).unwrap();
    for (index, raw, expected) in [
        (1, "{}", "unloaded_edit"),
        (0, "{\n\"id\":2\n}", "multiline_edit"),
    ] {
        let error = documents
            .save(
                &opened.id,
                opened.revision,
                vec![Edit {
                    index,
                    raw: raw.into(),
                    original: " {\"id\":0}".into(),
                }],
                None,
            )
            .unwrap_err();
        assert_eq!(CommandError::from(error).code, expected);
        assert_eq!(fs::read_to_string(&path).unwrap(), original);
    }
}

#[test]
fn shared_native_menu_catalogs_have_matching_nonempty_keys() {
    let english: serde_json::Value =
        serde_json::from_str(include_str!("../../src/i18n/en.json")).unwrap();
    let chinese: serde_json::Value =
        serde_json::from_str(include_str!("../../src/i18n/zh-CN.json")).unwrap();
    assert_eq!(
        english.as_object().unwrap().keys().collect::<Vec<_>>(),
        chinese.as_object().unwrap().keys().collect::<Vec<_>>()
    );
    assert_eq!(english["menuOpen"], json!("Open file…"));
    assert_eq!(chinese["menuOpen"], json!("打开文件…"));
}
