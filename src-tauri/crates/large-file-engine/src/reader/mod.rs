use std::fs::File;
use std::io;
use std::path::Path;

use crate::error::Result;
use crate::types::Epoch;

use self::identity::FileIdentity;

pub mod encoding;
pub mod identity;
pub mod mmap;
pub mod read_at;

/// 大文件引擎只依赖这个 trait；Tauri/UI 不参与读取实现。
pub trait FileReader: Send + Sync {
    fn size(&self) -> u64;
    fn identity(&self) -> &FileIdentity;
    fn epoch(&self) -> Epoch;

    /// 读取 [offset, offset+buf.len())，允许短读；EOF 返回 0。
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> io::Result<usize>;

    /// 文件可能被追加/截断；日志 reader 需要刷新缓存的 size。
    fn refresh_size(&self) -> io::Result<u64> {
        Ok(self.size())
    }

    /// 必须读满 buf，否则返回 UnexpectedEof。
    fn read_exact_at(&self, offset: u64, buf: &mut [u8]) -> io::Result<()> {
        let mut done = 0usize;
        while done < buf.len() {
            let read = self.read_at(offset + done as u64, &mut buf[done..])?;
            if read == 0 {
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "short read from large file",
                ));
            }
            done += read;
        }
        Ok(())
    }
}

/// 打开只读 reader。日志默认 read_at；静态文件可显式选择 mmap。
pub fn open_read_at(path: &Path) -> Result<read_at::ReadAtReader> {
    read_at::ReadAtReader::open(path)
}

pub fn open_mmap(path: &Path) -> Result<mmap::MmapReader> {
    mmap::MmapReader::open(path)
}

/// 平台无关的定位读取。Windows 使用 seek_read，Unix 使用 pread。
pub(crate) fn read_at_file(file: &File, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::FileExt;
        file.read_at(buf, offset)
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::FileExt;
        file.seek_read(buf, offset)
    }

    #[cfg(not(any(unix, windows)))]
    {
        use std::io::{Read, Seek, SeekFrom};
        let mut clone = file.try_clone()?;
        clone.seek(SeekFrom::Start(offset))?;
        clone.read(buf)
    }
}

/// 读取文件头/尾的 fingerprint 时使用。
pub(crate) fn read_at_path(path: &Path, offset: u64, buf: &mut [u8]) -> io::Result<usize> {
    let file = File::open(path)?;
    read_at_file(&file, offset, buf)
}
