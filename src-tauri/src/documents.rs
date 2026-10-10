use crate::{
    error::{Error, Result},
    reader::{self, Cursor, Fingerprint, Line},
    traces,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashMap},
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    time::SystemTime,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub revision: u64,
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub total_lines: usize,
    pub lines: Vec<Line>,
    pub has_more: bool,
    pub trace: Option<Value>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Edit {
    pub index: usize,
    pub raw: String,
    pub original: String,
}

struct Document {
    path: PathBuf,
    revision: u64,
    fingerprint: Fingerprint,
    cursor: Cursor,
    lines: Vec<Line>,
    has_more: bool,
    observed: Option<(u64, SystemTime)>,
}

impl Document {
    fn snapshot(&self, id: &str) -> Snapshot {
        Snapshot {
            id: id.into(),
            revision: self.revision,
            path: self.path.to_string_lossy().into_owned(),
            name: self
                .path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            size_bytes: self.fingerprint.size,
            total_lines: self.fingerprint.total_lines,
            lines: self.lines.clone(),
            has_more: self.has_more,
            trace: traces::parse(&self.lines, &self.path.to_string_lossy()),
        }
    }
    fn reload(&mut self, limit: usize) -> Result<()> {
        let fingerprint = reader::fingerprint(&self.path)?;
        let page = reader::read_page(&self.path, Cursor::default(), limit)?;
        if reader::fingerprint(&self.path)? != fingerprint {
            return Err(Error::Conflict);
        }
        self.fingerprint = fingerprint;
        self.lines = page.lines;
        self.cursor = page.cursor;
        self.has_more = page.has_more;
        self.observed = stamp(&self.path);
        self.revision += 1;
        Ok(())
    }
}

#[derive(Default)]
pub struct Documents {
    next_id: u64,
    documents: HashMap<String, Document>,
}

impl Documents {
    pub fn open(&mut self, path: &Path) -> Result<Snapshot> {
        let path = fs::canonicalize(path)?;
        if let Some((id, doc)) = self.documents.iter().find(|(_, doc)| doc.path == path) {
            return Ok(doc.snapshot(id));
        }
        let mut document = Document {
            path,
            revision: 0,
            fingerprint: Fingerprint {
                hash: [0; 32],
                size: 0,
                total_lines: 0,
            },
            cursor: Cursor::default(),
            lines: Vec::new(),
            has_more: false,
            observed: None,
        };
        document.reload(reader::PAGE_SIZE)?;
        self.next_id += 1;
        let id = self.next_id.to_string();
        let snapshot = document.snapshot(&id);
        self.documents.insert(id, document);
        Ok(snapshot)
    }

    pub fn page(&mut self, id: &str, revision: u64) -> Result<Snapshot> {
        let doc = self.documents.get_mut(id).ok_or(Error::NotFound)?;
        if doc.revision != revision || reader::fingerprint(&doc.path)? != doc.fingerprint {
            return Err(Error::Conflict);
        }
        if doc.has_more {
            let page = reader::read_page(&doc.path, doc.cursor, reader::PAGE_SIZE)?;
            if reader::fingerprint(&doc.path)? != doc.fingerprint {
                return Err(Error::Conflict);
            }
            doc.lines.retain(|line| line.index < doc.cursor.index);
            doc.lines.extend(page.lines);
            doc.cursor = page.cursor;
            doc.has_more = page.has_more;
            doc.revision += 1;
        }
        Ok(doc.snapshot(id))
    }

    pub fn refresh(&mut self, id: &str, revision: u64) -> Result<Snapshot> {
        let doc = self.documents.get_mut(id).ok_or(Error::NotFound)?;
        if doc.revision != revision {
            return Err(Error::Conflict);
        }
        let size = fs::metadata(&doc.path)?.len();
        if !doc.has_more
            && size > doc.fingerprint.size
            && reader::prefix_matches(&doc.path, &doc.fingerprint)?
        {
            let fingerprint = reader::fingerprint(&doc.path)?;
            let page = reader::read_page(&doc.path, doc.cursor, reader::PAGE_SIZE)?;
            if reader::fingerprint(&doc.path)? != fingerprint {
                return Err(Error::Conflict);
            }
            doc.lines.retain(|line| line.index < doc.cursor.index);
            doc.lines.extend(page.lines);
            doc.cursor = page.cursor;
            doc.has_more = page.has_more;
            doc.fingerprint = fingerprint;
            doc.revision += 1;
            doc.observed = stamp(&doc.path);
        } else {
            doc.reload(doc.lines.len().max(reader::PAGE_SIZE))?;
        }
        Ok(doc.snapshot(id))
    }

    pub fn save(
        &mut self,
        id: &str,
        revision: u64,
        edits: Vec<Edit>,
        destination: Option<&Path>,
    ) -> Result<Snapshot> {
        let doc = self.documents.get_mut(id).ok_or(Error::NotFound)?;
        if doc.revision != revision {
            return Err(Error::Conflict);
        }
        let target = destination.unwrap_or(&doc.path);
        let same_target = fs::canonicalize(target).is_ok_and(|p| p == doc.path);
        let mut source = open_for_save(&doc.path)?;
        if reader::fingerprint_reader(&mut source)? != doc.fingerprint {
            return Err(Error::Conflict);
        }
        source.seek(SeekFrom::Start(0))?;
        let mut replacements = BTreeMap::new();
        for edit in edits {
            if edit.index >= doc.fingerprint.total_lines
                || !doc.lines.iter().any(|line| line.index == edit.index)
            {
                return Err(Error::UnloadedEdit);
            }
            if !doc
                .lines
                .iter()
                .any(|line| line.index == edit.index && line.raw == edit.original)
            {
                return Err(Error::Conflict);
            }
            serde_json::from_str::<Value>(&edit.raw).map_err(|error| Error::InvalidEdit {
                line: edit.index + 1,
                message: error.to_string(),
            })?;
            if edit.raw.contains(['\r', '\n']) {
                return Err(Error::MultilineEdit);
            }
            replacements.insert(edit.index, edit.raw);
        }
        let parent = target.parent().ok_or(Error::InvalidPath)?;
        let mut output = tempfile::NamedTempFile::new_in(parent)?;
        let mut reader = BufReader::new(&mut source);
        let mut bytes = Vec::new();
        let mut index = 0;
        loop {
            bytes.clear();
            if reader.read_until(b'\n', &mut bytes)? == 0 {
                break;
            }
            if let Some(raw) = replacements.get(&index) {
                output.write_all(raw.as_bytes())?;
                if bytes.ends_with(b"\r\n") {
                    output.write_all(b"\r\n")?;
                } else if bytes.ends_with(b"\n") {
                    output.write_all(b"\n")?;
                }
            } else {
                output.write_all(&bytes)?;
            }
            index += 1;
        }
        output
            .as_file()
            .set_permissions(source.metadata()?.permissions())?;
        output.flush()?;
        output.as_file().sync_all()?;
        // The held Windows handle denies writes. Recheck path content for replacements/renames.
        if reader::fingerprint(&doc.path)? != doc.fingerprint {
            return Err(Error::Conflict);
        }
        crate::atomic_save::persist(output, target)?;
        drop(source);
        if same_target || destination.is_none() {
            doc.reload(doc.lines.len().max(reader::PAGE_SIZE))?;
        }
        Ok(doc.snapshot(id))
    }

    pub fn close(&mut self, id: &str) {
        self.documents.remove(id);
    }

    pub fn changed(&mut self) -> Vec<String> {
        self.documents
            .iter_mut()
            .filter_map(|(id, doc)| {
                let current = stamp(&doc.path);
                if current != doc.observed {
                    doc.observed = current;
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect()
    }
}

fn stamp(path: &Path) -> Option<(u64, SystemTime)> {
    let metadata = fs::metadata(path).ok()?;
    Some((metadata.len(), metadata.modified().ok()?))
}

pub fn open_for_save(path: &Path) -> Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // FILE_SHARE_READ | FILE_SHARE_DELETE: readers and our atomic replacement allowed.
        options.share_mode(1 | 4);
    }
    Ok(options.open(path)?)
}
