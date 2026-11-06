use std::fs::{File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::error::Result;
use crate::reader::identity::FileIdentity;
use crate::reader::{read_at_file, FileReader};
use crate::types::Epoch;

/// 基于已打开文件句柄的随机读取实现。
///
/// 关键点：
/// - 持有 fd，rename+create 后旧会话仍能读旧 inode；
/// - 不共享文件游标，多线程读取安全；
/// - 短读、EOF 由调用方处理。
pub struct ReadAtReader {
    file: File,
    path: PathBuf,
    identity: FileIdentity,
    size: AtomicU64,
    epoch: Epoch,
}

impl ReadAtReader {
    pub fn open(path: &Path) -> Result<Self> {
        let file = OpenOptions::new().read(true).open(path)?;
        let identity = FileIdentity::from_path(path)?;
        let size = file.metadata()?.len();
        Ok(Self {
            file,
            path: path.to_path_buf(),
            identity,
            size: AtomicU64::new(size),
            epoch: 1,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn refresh_identity(mut self) -> Result<Self> {
        self.identity = FileIdentity::from_path(&self.path)?;
        self.epoch = self.epoch.saturating_add(1);
        Ok(self)
    }
}

impl FileReader for ReadAtReader {
    fn size(&self) -> u64 {
        self.size.load(Ordering::Relaxed)
    }

    fn refresh_size(&self) -> io::Result<u64> {
        let size = self.file.metadata()?.len();
        self.size.store(size, Ordering::Relaxed);
        Ok(size)
    }

    fn identity(&self) -> &FileIdentity {
        &self.identity
    }

    fn epoch(&self) -> Epoch {
        self.epoch
    }

    fn read_at(&self, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
        let size = self.size.load(Ordering::Relaxed);
        if offset >= size {
            return Ok(0);
        }
        let max = ((size - offset) as usize).min(buf.len());
        if max == 0 {
            return Ok(0);
        }
        read_at_file(&self.file, offset, &mut buf[..max])
    }
}
