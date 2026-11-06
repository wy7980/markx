use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::RwLock;
use uuid::Uuid;

use crate::cache::BlockCache;
use crate::config::EngineConfig;
use crate::error::{EngineError, Result};
use crate::index::{append_index, spawn_index_builder, IndexStore};
use crate::reader::{open_read_at, FileReader};
use crate::search::{run_search, SearchManager, SearchOptions};
use crate::session::LargeFileSession;
use crate::types::{
    FileEvent, FileInfo, FileMode, FileProbe, IndexStatus, Numbering, OpenResult, SearchEvent,
    SearchHit, SearchRequest, SearchResultsPage, SessionId, ViewportResponse,
};
use crate::viewport::{read_tail, read_viewport, read_viewport_at_offset};
use crate::watch::{self, FileChange, WatchHandle};

/// 引擎门面。Tauri 命令只依赖这里；UI/框架变化不影响底层。
pub struct LargeFileEngine {
    config: EngineConfig,
    sessions: RwLock<HashMap<SessionId, Arc<LargeFileSession>>>,
    searches: Arc<SearchManager>,
}

impl LargeFileEngine {
    pub fn new(config: EngineConfig) -> Self {
        Self {
            config,
            sessions: RwLock::new(HashMap::new()),
            searches: Arc::new(SearchManager::new()),
        }
    }

    pub fn config(&self) -> &EngineConfig {
        &self.config
    }

    /// 仅读取元数据判断模式，不读取文件内容（用于前端 size() 失败时的兜底）。
    pub fn probe(&self, path: &Path) -> Result<FileProbe> {
        let size = std::fs::metadata(path)?.len();
        let mode = if size < self.config.editable_max_bytes {
            FileMode::Editable
        } else {
            FileMode::ReadOnly
        };
        Ok(FileProbe { mode, size })
    }

    /// 打开文件：小文件返回 Editable，由现有编辑器接管；大文件创建只读会话。
    pub fn open(&self, path: &Path) -> Result<OpenResult> {
        let metadata = std::fs::metadata(path)?;
        let size = metadata.len();
        let path_string = path.to_string_lossy().to_string();

        if size < self.config.editable_max_bytes {
            return Ok(OpenResult {
                session_id: None,
                path: path_string,
                mode: FileMode::Editable,
                size,
                epoch: 0,
                total_lines: None,
                numbering: Numbering::Unknown,
                tail: Vec::new(),
            });
        }

        let reader: Arc<dyn FileReader> = Arc::new(open_read_at(path)?);
        crate::reader::encoding::validate_text_sample(reader.as_ref(), self.config.sample_bytes)?;
        let epoch = reader.epoch();
        let file_state = watch::probe(path, self.config.fingerprint_bytes)?;
        let session_id = Uuid::new_v4();
        let index = Arc::new(IndexStore::new(epoch, size));
        let cache = Arc::new(BlockCache::new(
            self.config.read_block_bytes,
            self.config.cache_bytes,
        ));

        let tail = read_tail(reader.as_ref(), 200, &self.config)?;

        let session = Arc::new(LargeFileSession {
            id: session_id,
            path: path.to_path_buf(),
            epoch,
            reader: reader.clone(),
            index: index.clone(),
            cache,
            state: RwLock::new(file_state),
            poll_lock: parking_lot::Mutex::new(()),
        });
        self.sessions.write().insert(session_id, session);

        let _ = spawn_index_builder(reader, index, self.config.clone());

        Ok(OpenResult {
            session_id: Some(session_id),
            path: path_string,
            mode: FileMode::ReadOnly,
            size,
            epoch,
            total_lines: None,
            numbering: Numbering::Unknown,
            tail,
        })
    }

    pub fn close(&self, session_id: SessionId) -> bool {
        let removed = self.sessions.write().remove(&session_id);
        if let Some(session) = removed {
            session.index.cancel();
            self.searches.cancel_session(session_id);
            true
        } else {
            false
        }
    }

    fn session(&self, session_id: SessionId) -> Result<Arc<LargeFileSession>> {
        self.sessions
            .read()
            .get(&session_id)
            .cloned()
            .ok_or_else(|| EngineError::SessionNotFound(session_id.to_string()))
    }

    pub fn viewport(
        &self,
        session_id: SessionId,
        start_line: u64,
        count: u32,
    ) -> Result<ViewportResponse> {
        let session = self.session(session_id)?;
        let snapshot = session.index.snapshot();
        read_viewport(
            session.reader.as_ref(),
            snapshot.as_ref(),
            start_line,
            count,
            &self.config,
        )
    }

    pub fn jump_to_offset(
        &self,
        session_id: SessionId,
        offset: u64,
        count: u32,
    ) -> Result<ViewportResponse> {
        let session = self.session(session_id)?;
        let snapshot = session.index.snapshot();
        read_viewport_at_offset(
            session.reader.as_ref(),
            snapshot.as_ref(),
            offset,
            count,
            &self.config,
        )
    }

    pub fn tail(&self, session_id: SessionId, count: usize) -> Result<ViewportResponse> {
        let session = self.session(session_id)?;
        let lines = read_tail(session.reader.as_ref(), count, &self.config)?;
        Ok(ViewportResponse {
            epoch: session.epoch,
            lines,
            total_lines: session.index.snapshot().total_lines,
            numbering: Numbering::Unknown,
            has_more: false,
        })
    }

    pub fn index_status(&self, session_id: SessionId) -> Result<IndexStatus> {
        Ok(self.session(session_id)?.index.status())
    }

    pub fn file_info(&self, session_id: SessionId) -> Result<FileInfo> {
        let session = self.session(session_id)?;
        Ok(FileInfo {
            session_id,
            path: session.path.to_string_lossy().to_string(),
            size: session.size(),
            epoch: session.epoch,
            index: session.index.status(),
        })
    }

    /// 启动后台搜索任务，返回 task_id；结果通过 search_page 分页读取。
    pub fn search(&self, request: SearchRequest) -> Result<Uuid> {
        let session_id = request.session_id;
        let session = self.session(session_id)?;
        let epoch = session.epoch;

        if request.pattern.is_empty() {
            return Err(EngineError::InvalidRequest("pattern is empty".into()));
        }

        let (from_offset, start_line) = match request.from_offset {
            Some(offset) => (offset.min(session.size()), None),
            None => (0, Some(1)),
        };
        let max_results = request
            .max_results
            .min(self.config.search_max_results)
            .max(1);

        let options = SearchOptions {
            pattern: request.pattern,
            regex: request.regex,
            case_sensitive: request.case_sensitive,
            whole_word: request.whole_word,
            max_results,
            from_offset,
            start_line,
            block_bytes: self.config.search_block_bytes,
            max_line_bytes: self.config.max_line_bytes,
        };

        let task = self.searches.create(epoch, session_id);
        let task_id = task.id;
        let cancel = task.cancel_flag();
        let task_for_hits = task.clone();
        let reader = session.reader.clone();

        std::thread::spawn(move || {
            let result = run_search(reader, &options, cancel, |hit| task_for_hits.push(hit));
            match result {
                Ok(summary) => task.finish(summary.cancelled, None),
                Err(error) => task.finish(false, Some(format!("{}: {}", error.code(), error))),
            }
        });

        Ok(task_id)
    }

    /// 流式搜索：每 64 条结果推送一个 Batch，结束时推送 Done。
    /// 同时仍写入 SearchTask，兼容 search_page 轮询。
    pub fn search_stream<F>(&self, request: SearchRequest, on_event: F) -> Result<Uuid>
    where
        F: Fn(SearchEvent) + Send + 'static,
    {
        let session_id = request.session_id;
        let session = self.session(session_id)?;
        let epoch = session.epoch;

        if request.pattern.is_empty() {
            return Err(EngineError::InvalidRequest("pattern is empty".into()));
        }

        let (from_offset, start_line) = match request.from_offset {
            Some(offset) => (offset.min(session.size()), None),
            None => (0, Some(1)),
        };
        let max_results = request
            .max_results
            .min(self.config.search_max_results)
            .max(1);

        let options = SearchOptions {
            pattern: request.pattern,
            regex: request.regex,
            case_sensitive: request.case_sensitive,
            whole_word: request.whole_word,
            max_results,
            from_offset,
            start_line,
            block_bytes: self.config.search_block_bytes,
            max_line_bytes: self.config.max_line_bytes,
        };

        let task = self.searches.create(epoch, session_id);
        let task_id = task.id;
        let cancel = task.cancel_flag();
        let task_for_hits = task.clone();
        let reader = session.reader.clone();

        std::thread::spawn(move || {
            let mut batch: Vec<SearchHit> = Vec::with_capacity(64);
            let mut total = 0u64;
            let mut last_flush = Instant::now();
            let result = run_search(reader, &options, cancel, |hit| {
                total += 1;
                if !task_for_hits.push(hit.clone()) {
                    return false;
                }
                batch.push(hit);
                if batch.len() >= 64 || last_flush.elapsed() >= Duration::from_millis(250) {
                    on_event(SearchEvent::Batch {
                        task_id,
                        epoch,
                        total,
                        hits: std::mem::take(&mut batch),
                    });
                    last_flush = Instant::now();
                }
                true
            });

            if !batch.is_empty() {
                on_event(SearchEvent::Batch {
                    task_id,
                    epoch,
                    total,
                    hits: std::mem::take(&mut batch),
                });
            }

            match result {
                Ok(summary) => {
                    let cancelled = summary.cancelled || task.is_cancelled();
                    task.finish(cancelled, None);
                    on_event(SearchEvent::Done {
                        task_id,
                        epoch,
                        total,
                        cancelled,
                        error: None,
                    });
                }
                Err(error) => {
                    let message = format!("{}: {}", error.code(), error);
                    task.finish(false, Some(message.clone()));
                    on_event(SearchEvent::Done {
                        task_id,
                        epoch,
                        total,
                        cancelled: false,
                        error: Some(message),
                    });
                }
            }
        });

        Ok(task_id)
    }

    pub fn search_page(&self, task_id: Uuid, start: u64, limit: u32) -> Result<SearchResultsPage> {
        self.searches
            .get(task_id)
            .map(|task| task.page(start, limit))
            .ok_or_else(|| EngineError::InvalidRequest(format!("search task not found: {task_id}")))
    }

    pub fn cancel_search(&self, task_id: Uuid) -> bool {
        self.searches.cancel(task_id)
    }

    /// 释放已完成/已取消的搜索任务（前端拿到最终结果后调用）。
    pub fn release_search(&self, task_id: Uuid) -> bool {
        self.searches.remove(task_id)
    }

    /// 启动文件变化监听：append 会增量更新索引；truncate/rotate/removed 会通知调用方。
    pub fn watch<F>(
        &self,
        session_id: SessionId,
        interval_ms: u64,
        callback: F,
    ) -> Result<WatchHandle>
    where
        F: Fn(FileEvent) + Send + 'static,
    {
        let session = self.session(session_id)?;
        let config = self.config.clone();
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_thread = cancel.clone();
        let interval = Duration::from_millis(interval_ms.max(200));

        let join = std::thread::spawn(move || {
            while !cancel_thread.load(Ordering::Relaxed) {
                let mut waited = 0u64;
                while waited < interval.as_millis() as u64 {
                    if cancel_thread.load(Ordering::Relaxed) {
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                    waited += 100;
                }

                let event = poll_session(&session, session_id, &config);
                if let Some(event) = event {
                    let terminal = matches!(
                        event,
                        FileEvent::Truncated { .. }
                            | FileEvent::Rotated { .. }
                            | FileEvent::Removed { .. }
                    );
                    callback(event);
                    if terminal {
                        return;
                    }
                }
            }
        });

        Ok(WatchHandle::new(cancel, join))
    }

    /// 供 watch 失败时的前端轮询兜底使用。
    pub fn poll_file(&self, session_id: SessionId) -> Result<Option<FileEvent>> {
        let session = self.session(session_id)?;
        Ok(poll_session(&session, session_id, &self.config))
    }

    pub fn close_all(&self) {
        let sessions: Vec<_> = self.sessions.read().values().cloned().collect();
        for session in sessions {
            session.index.cancel();
        }
        self.sessions.write().clear();
        self.searches.cancel_all();
    }
}

fn poll_session(
    session: &LargeFileSession,
    session_id: SessionId,
    config: &EngineConfig,
) -> Option<FileEvent> {
    // 防止 watch 线程与前端轮询兜底并发 append 同一段数据。
    let _guard = session.poll_lock.lock();
    // ReadAtReader 缓存了 size；追加后必须先刷新，否则 read_at 会在旧 EOF 返回 0。
    let _ = session.reader.refresh_size();
    let previous = session.state.read().clone();

    match watch::detect_change(&session.path, &previous, config.fingerprint_bytes) {
        Ok(FileChange::Unchanged) => None,
        Ok(FileChange::Appended { new_size }) => {
            let total_lines = append_index(
                session.reader.clone(),
                session.index.clone(),
                config,
                previous.size,
            )
            .ok()?;
            if let Ok(next) = watch::probe(&session.path, config.fingerprint_bytes) {
                *session.state.write() = next;
            }
            Some(FileEvent::Appended {
                session_id,
                old_size: previous.size,
                new_size,
                total_lines: Some(total_lines),
            })
        }
        Ok(FileChange::Truncated) => {
            let new_size = match watch::probe(&session.path, config.fingerprint_bytes) {
                Ok(next) => {
                    let size = next.size;
                    *session.state.write() = next;
                    size
                }
                Err(_) => previous.size,
            };
            Some(FileEvent::Truncated {
                session_id,
                new_size,
            })
        }
        Ok(FileChange::Replaced) => {
            if let Ok(next) = watch::probe(&session.path, config.fingerprint_bytes) {
                *session.state.write() = next;
            }
            Some(FileEvent::Rotated { session_id })
        }
        Ok(FileChange::Removed) => Some(FileEvent::Removed { session_id }),
        Err(_) => None,
    }
}

/// 让 Tauri 状态可以直接持有。
pub type SharedEngine = Arc<LargeFileEngine>;

pub fn shared_engine(config: EngineConfig) -> SharedEngine {
    Arc::new(LargeFileEngine::new(config))
}

/// 便捷：解析前端传来的 session id。
pub fn parse_session_id(value: &str) -> Result<SessionId> {
    Uuid::parse_str(value).map_err(|error| EngineError::InvalidRequest(error.to_string()))
}
