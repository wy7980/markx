use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub type SessionId = Uuid;
pub type Epoch = u64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileMode {
    Editable,
    ReadOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Numbering {
    /// 行号来自完整/已知的索引。
    Exact,
    /// 只能给出相对行号（索引尚未覆盖到该区域）。
    Relative,
    /// 行号未知（例如刚打开的尾部视图）。
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IndexState {
    Idle,
    Building,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    /// None 表示行号尚未知。
    pub number: Option<u64>,
    pub offset: u64,
    pub text: String,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewportResponse {
    pub epoch: Epoch,
    pub lines: Vec<LogLine>,
    pub total_lines: Option<u64>,
    pub numbering: Numbering,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenResult {
    pub session_id: Option<SessionId>,
    pub path: String,
    pub mode: FileMode,
    pub size: u64,
    pub epoch: Epoch,
    pub total_lines: Option<u64>,
    pub numbering: Numbering,
    pub tail: Vec<LogLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub state: IndexState,
    pub indexed_bytes: u64,
    pub total_bytes: u64,
    pub total_lines: Option<u64>,
    pub epoch: Epoch,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub session_id: SessionId,
    pub pattern: String,
    #[serde(default)]
    pub regex: bool,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default = "default_max_results")]
    pub max_results: u64,
    /// 从该字节位置之后开始搜索；None 表示从文件头开始。
    #[serde(default)]
    pub from_offset: Option<u64>,
}

fn default_max_results() -> u64 {
    10_000
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub line: Option<u64>,
    pub line_exact: bool,
    pub offset: u64,
    /// 1-based 字符列（按 UTF-8 解码后的字符计算）。
    pub column: u32,
    /// 匹配文本的字符长度，用于精确高亮。
    pub match_length: u32,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultsPage {
    pub task_id: Uuid,
    pub epoch: Epoch,
    pub hits: Vec<SearchHit>,
    /// 下一次分页的起始结果下标；None 表示没有更多。
    pub next_index: Option<u64>,
    pub done: bool,
    pub cancelled: bool,
    pub error: Option<String>,
}

/// 搜索结果流事件，供 Tauri Channel 推送。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SearchEvent {
    Batch {
        #[serde(rename = "taskId")]
        task_id: Uuid,
        epoch: Epoch,
        total: u64,
        hits: Vec<SearchHit>,
    },
    Done {
        #[serde(rename = "taskId")]
        task_id: Uuid,
        epoch: Epoch,
        total: u64,
        cancelled: bool,
        error: Option<String>,
    },
}

/// 文件变化事件，供 Tauri Channel / Event 推送。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileEvent {
    Appended {
        #[serde(rename = "sessionId")]
        session_id: SessionId,
        #[serde(rename = "oldSize")]
        old_size: u64,
        #[serde(rename = "newSize")]
        new_size: u64,
        #[serde(rename = "totalLines")]
        total_lines: Option<u64>,
    },
    Truncated {
        #[serde(rename = "sessionId")]
        session_id: SessionId,
        #[serde(rename = "newSize")]
        new_size: u64,
    },
    Rotated {
        #[serde(rename = "sessionId")]
        session_id: SessionId,
    },
    Removed {
        #[serde(rename = "sessionId")]
        session_id: SessionId,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileProbe {
    pub mode: FileMode,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub session_id: SessionId,
    pub path: String,
    pub size: u64,
    pub epoch: Epoch,
    pub index: IndexStatus,
}
