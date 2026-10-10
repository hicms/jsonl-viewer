use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("File changed; edits were not saved")]
    Conflict,
    #[error("File session has closed")]
    NotFound,
    #[error("Line {line} is not valid JSON: {message}")]
    InvalidEdit { line: usize, message: String },
    #[error("Only loaded lines can be edited")]
    UnloadedEdit,
    #[error("Each line must contain one JSON value on a single line")]
    MultilineEdit,
    #[error("Invalid save path")]
    InvalidPath,
    #[error("Could not locate the user directory")]
    HomeUnavailable,
    #[error("{0}")]
    Invalid(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl From<Error> for CommandError {
    fn from(error: Error) -> Self {
        let code = match &error {
            Error::Conflict => "conflict",
            Error::NotFound => "closed",
            Error::InvalidEdit { .. } => "invalid_edit",
            Error::Io(_) => "io",
            Error::Invalid(_) => "invalid",
            Error::UnloadedEdit => "unloaded_edit",
            Error::MultilineEdit => "multiline_edit",
            Error::InvalidPath => "invalid_path",
            Error::HomeUnavailable => "home_unavailable",
        };
        let (line, detail) = match &error {
            Error::InvalidEdit { line, message } => (Some(*line), Some(message.clone())),
            _ => (None, None),
        };
        Self {
            code,
            message: error.to_string(),
            line,
            detail,
        }
    }
}

pub type Result<T> = std::result::Result<T, Error>;
