use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{BufRead, BufReader, Read, Seek, SeekFrom},
    path::Path,
};

pub const PAGE_SIZE: usize = 1000;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Line {
    pub index: usize,
    pub raw: String,
    pub value: Value,
    pub parse_error: Option<String>,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cursor {
    pub offset: u64,
    pub index: usize,
}

#[derive(Debug)]
pub struct Page {
    pub lines: Vec<Line>,
    pub cursor: Cursor,
    pub has_more: bool,
}

pub fn parse_line(raw: &str, index: usize) -> Option<Line> {
    if raw.trim().is_empty() {
        return None;
    }
    let text = raw.trim_start_matches('\u{feff}').trim();
    let (value, parse_error) = match serde_json::from_str(text) {
        Ok(value) => (value, None),
        Err(error) => (Value::Null, Some(error.to_string())),
    };
    Some(Line {
        index,
        raw: raw.trim_end_matches(['\r', '\n']).to_owned(),
        value,
        parse_error,
    })
}

pub fn read_page(path: &Path, start: Cursor, limit: usize) -> Result<Page> {
    let mut file = File::open(path)?;
    let size = file.metadata()?.len();
    if start.offset > size {
        return Err(Error::Conflict);
    }
    file.seek(SeekFrom::Start(start.offset))?;
    let mut reader = BufReader::new(file);
    let mut cursor = start;
    let mut lines = Vec::new();
    let mut bytes = Vec::new();
    let mut partial = false;
    loop {
        bytes.clear();
        let consumed = reader.read_until(b'\n', &mut bytes)?;
        if consumed == 0 {
            break;
        }
        let complete = bytes.last() == Some(&b'\n');
        let raw = String::from_utf8_lossy(&bytes);
        if let Some(line) = parse_line(&raw, cursor.index) {
            lines.push(line);
        }
        // An incomplete UTF-8 sequence or JSON line is displayed but re-read next time.
        if !complete {
            partial = true;
            break;
        }
        cursor.offset += consumed as u64;
        cursor.index += 1;
        if lines.len() >= limit {
            break;
        }
    }
    let has_more = !partial && cursor.offset < size && lines.len() >= limit;
    Ok(Page {
        lines,
        cursor,
        has_more,
    })
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Fingerprint {
    pub hash: [u8; 32],
    pub size: u64,
    pub total_lines: usize,
}

pub fn fingerprint(path: &Path) -> Result<Fingerprint> {
    fingerprint_reader(File::open(path)?)
}

pub fn fingerprint_reader(mut reader: impl Read) -> Result<Fingerprint> {
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut size = 0;
    let mut total_lines = 0;
    let mut last = None;
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
        total_lines += buffer[..count].iter().filter(|&&b| b == b'\n').count();
        size += count as u64;
        last = buffer.get(count - 1).copied();
    }
    if last.is_some_and(|b| b != b'\n') {
        total_lines += 1;
    }
    Ok(Fingerprint {
        hash: hash.finalize().into(),
        size,
        total_lines,
    })
}

pub fn prefix_matches(path: &Path, known: &Fingerprint) -> Result<bool> {
    let file = File::open(path)?;
    Ok(fingerprint_reader(file.take(known.size))?.hash == known.hash)
}
