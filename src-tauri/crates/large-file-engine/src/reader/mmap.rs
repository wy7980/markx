use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};

use memmap2::Mmap;

use crate::error::Result;
use crate::reader::identity::FileIdentity;
use crate::reader::FileReader;
use crate::types::Epoch;

/// 内存映射读取。
///
/// 仅建议用于确认不会被截断的静态文件：
/// Unix 上文件被截断后继续访问旧映射可能触发 SIGBUS，Rust 无法安全捕获。
pub struct MmapReader {
    mmap: Option<Mmap>,
    path: PathBuf,
    identity: FileIdentity,
    size: u64,
    epoch: Epoch,
}

impl MmapReader {
    pub fn open(path: &Path) -> Result<Self> {
        let file = File::open(path)?;
        let metadata = file.metadata()?;
        let size = metadata.len();
        let identity = FileIdentity::from_path(path)?;

        // 空文件无法 mmap，保留 None。
        let mmap = if size == 0 {
            None
        } else {
            // SAFETY: 该 reader 明确只用于不会被截断的静态文件；调用方负责生命周期。
            Some(unsafe { Mmap::map(&file)? })
        };

        Ok(Self {
            mmap,
            path: path.to_path_buf(),
            identity,
            size,
            epoch: 1,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl FileReader for MmapReader {
    fn size(&self) -> u64 {
        self.size
    }

    fn identity(&self) -> &FileIdentity {
        &self.identity
    }

    fn epoch(&self) -> Epoch {
        self.epoch
    }

    fn read_at(&self, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        let Some(mmap) = &self.mmap else {
            return Ok(0);
        };
        if offset >= self.size {
            return Ok(0);
        }
        let start = offset as usize;
        let available = mmap.len().saturating_sub(start);
        let take = available.min(buf.len());
        buf[..take].copy_from_slice(&mmap[start..start + take]);
        Ok(take)
    }
}
