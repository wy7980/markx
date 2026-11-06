/// 引擎阈值。所有值都可在 Tauri 层按需覆盖。
#[derive(Debug, Clone)]
pub struct EngineConfig {
    /// 小于此大小交给现有编辑器；大于等于则进入只读大文件模式。
    pub editable_max_bytes: u64,
    /// 视口/行扫描的读取块。
    pub read_block_bytes: usize,
    /// 后台建索引的读取块。
    pub index_block_bytes: usize,
    /// 每多少行打一个 checkpoint。
    pub checkpoint_lines: u64,
    /// 或每多少字节打一个 checkpoint（与行阈值先到为准）。
    pub checkpoint_bytes: u64,
    /// 单行展示上限；超出部分标记 truncated。
    pub max_line_bytes: usize,
    /// 尾部首屏读取的窗口字节数。
    pub tail_block_bytes: usize,
    /// read_at 块缓存总预算。
    pub cache_bytes: u64,
    /// 搜索读取块。
    pub search_block_bytes: usize,
    /// 单个搜索任务的最大结果数。
    pub search_max_results: u64,
    /// 轮转检测 fingerprint 的采样字节数。
    pub fingerprint_bytes: usize,
    /// 打开大文件时用于编码/二进制检测的采样字节数。
    pub sample_bytes: usize,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            editable_max_bytes: 20 * 1024 * 1024,
            read_block_bytes: 256 * 1024,
            index_block_bytes: 1024 * 1024,
            checkpoint_lines: 4096,
            checkpoint_bytes: 1024 * 1024,
            max_line_bytes: 8 * 1024,
            tail_block_bytes: 1024 * 1024,
            cache_bytes: 32 * 1024 * 1024,
            search_block_bytes: 1024 * 1024,
            search_max_results: 10_000,
            fingerprint_bytes: 4 * 1024,
            sample_bytes: 64 * 1024,
        }
    }
}
