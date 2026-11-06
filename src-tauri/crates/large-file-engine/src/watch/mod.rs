use std::io;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;

use crate::reader::{identity::FileIdentity, read_at_path};

#[derive(Debug, Clone)]
pub struct FileState {
    pub identity: FileIdentity,
    pub size: u64,
    pub mtime_ms: u64,
    pub head_fingerprint: [u8; 32],
    pub head_fingerprint_len: usize,
    pub tail_fingerprint: [u8; 32],
    pub tail_fingerprint_len: usize,
    /// 上次已确认的完整行末尾偏移（用于增量扫描）。
    pub last_complete_offset: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileChange {
    Unchanged,
    Appended {
        new_size: u64,
    },
    /// 文件被截断或 copytruncate 重写，需要重建索引。
    Truncated,
    /// inode/文件 ID 变化：rename + create / 被替换。
    Replaced,
    Removed,
}

fn fingerprint_at(path: &Path, offset: u64, len: usize) -> io::Result<[u8; 32]> {
    if len == 0 {
        return Ok(*blake3::hash(&[]).as_bytes());
    }
    let mut buffer = vec![0u8; len];
    let read = read_at_path(path, offset, &mut buffer)?;
    buffer.truncate(read);
    Ok(*blake3::hash(&buffer).as_bytes())
}

/// 后台监听线程的句柄；Drop 时会请求取消并等待线程退出。
pub struct WatchHandle {
    cancel: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

impl WatchHandle {
    pub(crate) fn new(cancel: Arc<AtomicBool>, join: JoinHandle<()>) -> Self {
        Self {
            cancel,
            join: Some(join),
        }
    }

    pub fn stop(&mut self) {
        self.cancel.store(true, Ordering::Relaxed);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

impl Drop for WatchHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn probe(path: &Path, fingerprint_bytes: usize) -> io::Result<FileState> {
    let identity = FileIdentity::from_path(path)?;
    let size = identity.size;
    let head_len = fingerprint_bytes.min(size as usize);
    let tail_len = fingerprint_bytes.min(size as usize);
    let head_fingerprint = fingerprint_at(path, 0, head_len)?;
    let tail_fingerprint = fingerprint_at(path, size.saturating_sub(tail_len as u64), tail_len)?;

    Ok(FileState {
        mtime_ms: identity.mtime_ms,
        identity,
        size,
        head_fingerprint,
        head_fingerprint_len: head_len,
        tail_fingerprint,
        tail_fingerprint_len: tail_len,
        last_complete_offset: size,
    })
}

/// 轮转/截断检测。仅靠 size 回退不足以发现 copytruncate：
/// copytruncate 可能很快写回超过旧 offset，所以同时比较 fingerprint。
pub fn detect_change(
    path: &Path,
    previous: &FileState,
    fingerprint_bytes: usize,
) -> io::Result<FileChange> {
    if !path.exists() {
        return Ok(FileChange::Removed);
    }

    let current = probe(path, fingerprint_bytes)?;

    if !previous.identity.same_file(&current.identity) {
        return Ok(FileChange::Replaced);
    }

    if current.size < previous.last_complete_offset {
        return Ok(FileChange::Truncated);
    }

    if current.size == previous.size {
        if current.head_fingerprint != previous.head_fingerprint
            || current.tail_fingerprint != previous.tail_fingerprint
        {
            return Ok(FileChange::Truncated);
        }
        return Ok(FileChange::Unchanged);
    }

    // 追加：头部必须保持不变；尾部天然会变化，不做比较。
    // 注意 fingerprint 长度要沿用上一次的采样长度，否则文件变长后 hash 输入长度不同会误判。
    let head_len = previous.head_fingerprint_len.min(current.size as usize);
    let current_head = fingerprint_at(path, 0, head_len)?;
    if current_head != previous.head_fingerprint {
        return Ok(FileChange::Truncated);
    }

    Ok(FileChange::Appended {
        new_size: current.size,
    })
}
