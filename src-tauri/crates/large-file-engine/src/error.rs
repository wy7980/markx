use std::io;

/// 引擎统一错误。命令层会把它转换成稳定的 code + message。
#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("io error: {0}")]
    Io(#[from] io::Error),

    #[error("session not found: {0}")]
    SessionNotFound(String),

    #[error("index is not ready for line {0}")]
    IndexNotReady(u64),

    #[error("invalid regex: {0}")]
    InvalidRegex(String),

    #[error("unsupported encoding: {0}")]
    UnsupportedEncoding(String),

    #[error("binary file is not supported")]
    BinaryFile,

    #[error("file is stale (rotated or truncated)")]
    StaleFile,

    #[error("operation cancelled")]
    Cancelled,

    #[error("invalid request: {0}")]
    InvalidRequest(String),
}

impl EngineError {
    /// 前端可依赖的稳定错误码。
    pub fn code(&self) -> &'static str {
        match self {
            EngineError::Io(err) if err.kind() == io::ErrorKind::PermissionDenied => {
                "PermissionDenied"
            }
            EngineError::Io(_) => "IoError",
            EngineError::SessionNotFound(_) => "SessionNotFound",
            EngineError::IndexNotReady(_) => "IndexNotReady",
            EngineError::InvalidRegex(_) => "InvalidRegex",
            EngineError::UnsupportedEncoding(_) => "UnsupportedEncoding",
            EngineError::BinaryFile => "BinaryFile",
            EngineError::StaleFile => "StaleFile",
            EngineError::Cancelled => "Cancelled",
            EngineError::InvalidRequest(_) => "InvalidRequest",
        }
    }
}

pub type Result<T> = std::result::Result<T, EngineError>;
