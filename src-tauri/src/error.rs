use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("文件已变化，当前修改未保存。请核对磁盘内容后重新编辑")]
    Conflict,
    #[error("文件会话已关闭")]
    NotFound,
    #[error("第 {line} 行不是有效 JSON：{message}")]
    InvalidEdit { line: usize, message: String },
    #[error("{0}")]
    Invalid(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl From<Error> for CommandError {
    fn from(error: Error) -> Self {
        let code = match &error {
            Error::Conflict => "conflict",
            Error::NotFound => "closed",
            Error::InvalidEdit { .. } => "invalid_edit",
            Error::Io(_) => "io",
            Error::Invalid(_) => "invalid",
        };
        Self {
            code,
            message: error.to_string(),
        }
    }
}

pub type Result<T> = std::result::Result<T, Error>;
