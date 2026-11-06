//! 大文件只读引擎。
//!
//! 设计目标：
//! - 不依赖 Tauri / UI 框架；
//! - 日志默认 `read_at`，静态文件可选 mmap；
//! - 分段稀疏索引 + 后台构建；
//! - 搜索与索引解耦，行号由扫描过程维护；
//! - 所有对外结构可直接 serde 到前端。

pub mod cache;
pub mod config;
pub mod engine;
pub mod error;
pub mod index;
pub mod reader;
pub mod search;
pub mod session;
pub mod types;
pub mod viewport;
pub mod watch;

pub use config::EngineConfig;
pub use engine::{parse_session_id, shared_engine, LargeFileEngine, SharedEngine};
pub use error::{EngineError, Result};
pub use types::{
    FileEvent, FileInfo, FileMode, FileProbe, IndexState, IndexStatus, LogLine, Numbering,
    OpenResult, SearchEvent, SearchHit, SearchRequest, SearchResultsPage, SessionId,
    ViewportResponse,
};
