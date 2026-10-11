use crate::{
    error::Result,
    reader::{Cursor, Line, Page},
};
use serde_json::Value;
use std::{fs, io::Write, path::Path};

pub fn is_document(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
}

pub fn read(path: &Path) -> Result<Page> {
    let raw = fs::read_to_string(path)?;
    let (value, parse_error) = match serde_json::from_str(raw.trim_start_matches('\u{feff}')) {
        Ok(value) => (value, None),
        Err(error) => (Value::Null, Some(error.to_string())),
    };
    Ok(Page {
        cursor: Cursor {
            offset: raw.len() as u64,
            index: 1,
        },
        lines: vec![Line {
            index: 0,
            raw,
            value,
            parse_error,
        }],
        has_more: false,
    })
}

pub fn write_edit(output: &mut impl Write, raw: &str, original: &str) -> Result<()> {
    // The editor sends a JSON value; retain the document's newline convention and BOM.
    let value: Value = serde_json::from_str(raw).expect("edits are validated before writing");
    let formatted = serde_json::to_string_pretty(&value).expect("JSON values serialize");
    let newline = if original.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    if original.starts_with('\u{feff}') {
        output.write_all("\u{feff}".as_bytes())?;
    }
    output.write_all(formatted.replace('\n', newline).as_bytes())?;
    if original.ends_with('\n') {
        output.write_all(newline.as_bytes())?;
    }
    Ok(())
}
