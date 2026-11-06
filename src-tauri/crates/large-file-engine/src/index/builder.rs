use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use arc_swap::ArcSwap;
use parking_lot::RwLock;

use crate::config::EngineConfig;
use crate::error::{EngineError, Result};
use crate::reader::FileReader;
use crate::types::{Epoch, IndexState, IndexStatus};

use super::segment::{Checkpoint, IndexSegment, IndexSnapshot};

/// 索引的并发入口：读侧拿不可变快照，不阻塞后台构建。
pub struct IndexStore {
    snapshot: ArcSwap<IndexSnapshot>,
    status: RwLock<IndexStatus>,
    cancel: AtomicBool,
}

impl IndexStore {
    pub fn new(epoch: Epoch, total_bytes: u64) -> Self {
        // 先放一个 line 0 -> offset 0 的 checkpoint，保证打开后立刻可以请求第 1 行。
        let mut initial = IndexSnapshot::empty(epoch);
        initial.segments.push(IndexSegment {
            start_offset: 0,
            end_offset: 0,
            start_line: Some(0),
            checkpoints: vec![Checkpoint { line: 0, offset: 0 }],
            complete: false,
        });
        Self {
            snapshot: ArcSwap::from_pointee(initial),
            status: RwLock::new(IndexStatus {
                state: IndexState::Idle,
                indexed_bytes: 0,
                total_bytes,
                total_lines: None,
                epoch,
                error: None,
            }),
            cancel: AtomicBool::new(false),
        }
    }

    pub fn snapshot(&self) -> Arc<IndexSnapshot> {
        self.snapshot.load_full()
    }

    pub fn status(&self) -> IndexStatus {
        self.status.read().clone()
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }

    pub fn publish(&self, snapshot: IndexSnapshot) {
        let mut status = self.status.write();
        status.indexed_bytes = snapshot.indexed_bytes;
        status.total_lines = snapshot.total_lines;
        status.epoch = snapshot.epoch;
        self.snapshot.store(Arc::new(snapshot));
    }

    pub fn mark_building(&self) {
        self.status.write().state = IndexState::Building;
    }

    pub fn mark_ready(&self, total_lines: u64) {
        let mut status = self.status.write();
        status.state = IndexState::Ready;
        status.total_lines = Some(total_lines);
    }

    pub fn mark_failed(&self, message: String) {
        let mut status = self.status.write();
        status.state = IndexState::Failed;
        status.error = Some(message);
    }
}

/// 从文件头顺序构建稀疏索引。
///
/// 调用方应在后台线程运行；函数本身不依赖 async runtime。
pub fn build_index(
    reader: Arc<dyn FileReader>,
    store: Arc<IndexStore>,
    config: &EngineConfig,
) -> Result<()> {
    store.mark_building();

    let total_bytes = reader.size();
    let epoch = reader.epoch();
    let mut buffer = vec![0u8; config.index_block_bytes.max(4096)];

    let mut checkpoints = vec![Checkpoint { line: 0, offset: 0 }];
    let mut line_count = 0u64;
    let mut last_checkpoint_line = 0u64;
    let mut last_checkpoint_offset = 0u64;
    let mut offset = 0u64;
    let mut last_byte = None;
    let mut last_publish = 0u64;

    while offset < total_bytes {
        if store.is_cancelled() {
            return Ok(());
        }

        let read = match reader.read_at(offset, &mut buffer) {
            Ok(read) => read,
            Err(error) => {
                store.mark_failed(error.to_string());
                return Err(error.into());
            }
        };
        if read == 0 {
            break;
        }
        last_byte = Some(buffer[read - 1]);

        for position in memchr::memchr_iter(b'\n', &buffer[..read]) {
            line_count += 1;
            let line_offset = offset + position as u64 + 1;
            if line_count - last_checkpoint_line >= config.checkpoint_lines
                || line_offset - last_checkpoint_offset >= config.checkpoint_bytes
            {
                checkpoints.push(Checkpoint {
                    line: line_count,
                    offset: line_offset,
                });
                last_checkpoint_line = line_count;
                last_checkpoint_offset = line_offset;
            }
        }

        offset += read as u64;

        // 降低快照发布频率：每 8MB 一次，避免长文件反复 clone checkpoint。
        if offset - last_publish >= 8 * 1024 * 1024 {
            store.publish(IndexSnapshot {
                segments: vec![IndexSegment {
                    start_offset: 0,
                    end_offset: offset,
                    start_line: Some(0),
                    checkpoints: checkpoints.clone(),
                    complete: false,
                }],
                total_lines: None,
                indexed_bytes: offset,
                complete: false,
                epoch,
            });
            last_publish = offset;
        }
    }

    let total_lines = line_count + if last_byte != Some(b'\n') { 1 } else { 0 };
    store.publish(IndexSnapshot {
        segments: vec![IndexSegment {
            start_offset: 0,
            end_offset: total_bytes,
            start_line: Some(0),
            checkpoints,
            complete: true,
        }],
        total_lines: Some(total_lines),
        indexed_bytes: total_bytes,
        complete: true,
        epoch,
    });
    store.mark_ready(total_lines);
    Ok(())
}

/// 文件追加后，从 from_offset 继续扫描并发布新的完整索引快照。
/// 调用方应保证之前的索引已经完成；否则返回 IndexNotReady。
pub fn append_index(
    reader: Arc<dyn FileReader>,
    store: Arc<IndexStore>,
    config: &EngineConfig,
    from_offset: u64,
) -> Result<u64> {
    let snapshot = store.snapshot();
    if !snapshot.complete {
        return Err(EngineError::IndexNotReady(0));
    }

    let size = reader.size();
    let total_before = snapshot.total_lines.unwrap_or(0);
    if from_offset >= size {
        return Ok(total_before);
    }

    let segment = snapshot
        .segments
        .first()
        .cloned()
        .ok_or_else(|| EngineError::InvalidRequest("index has no segment".into()))?;
    let mut checkpoints = segment.checkpoints;
    let mut last_checkpoint_line = checkpoints.last().map(|item| item.line).unwrap_or(0);
    let mut last_checkpoint_offset = checkpoints.last().map(|item| item.offset).unwrap_or(0);

    // 上一段末尾是否已经有换行，决定起始行号是 total 还是 total-1。
    let mut last_byte = if from_offset > 0 {
        let mut byte = [0u8; 1];
        reader.read_exact_at(from_offset - 1, &mut byte)?;
        Some(byte[0])
    } else {
        None
    };
    let mut line_count = if last_byte == Some(b'\n') {
        total_before
    } else {
        total_before.saturating_sub(1)
    };

    let mut buffer = vec![0u8; config.index_block_bytes.max(4096)];
    let mut offset = from_offset;
    while offset < size {
        let read = reader.read_at(offset, &mut buffer)?;
        if read == 0 {
            break;
        }
        last_byte = Some(buffer[read - 1]);

        for position in memchr::memchr_iter(b'\n', &buffer[..read]) {
            line_count += 1;
            let line_offset = offset + position as u64 + 1;
            if line_count - last_checkpoint_line >= config.checkpoint_lines
                || line_offset - last_checkpoint_offset >= config.checkpoint_bytes
            {
                checkpoints.push(Checkpoint {
                    line: line_count,
                    offset: line_offset,
                });
                last_checkpoint_line = line_count;
                last_checkpoint_offset = line_offset;
            }
        }
        offset += read as u64;
    }

    let total_lines = line_count + if last_byte != Some(b'\n') { 1 } else { 0 };
    store.publish(IndexSnapshot {
        segments: vec![IndexSegment {
            start_offset: 0,
            end_offset: size,
            start_line: Some(0),
            checkpoints,
            complete: true,
        }],
        total_lines: Some(total_lines),
        indexed_bytes: size,
        complete: true,
        epoch: reader.epoch(),
    });
    store.mark_ready(total_lines);
    Ok(total_lines)
}

/// 在后台线程启动索引构建。
pub fn spawn_index_builder(
    reader: Arc<dyn FileReader>,
    store: Arc<IndexStore>,
    config: EngineConfig,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        if let Err(error) = build_index(reader, store, &config) {
            // build_index 已经在失败路径写入状态；这里只记录线程退出。
            eprintln!("large-file-engine: index builder stopped: {error}");
        }
    })
}
