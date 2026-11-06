use std::io;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

/// 文件身份。路径不足以标识 Linux 日志文件（logrotate 会 rename + create），
/// 所以同时记录 volume/device + file id，配合 size/mtime 做轮转检测。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileIdentity {
    pub kind: String,
    pub volume: u64,
    pub file_id: u128,
    pub size: u64,
    pub mtime_ms: u64,
}

impl FileIdentity {
    pub fn from_path(path: &Path) -> io::Result<Self> {
        let metadata = std::fs::metadata(path)?;
        let id = file_id::get_file_id(path)?;
        let (kind, volume, file_id) = match id {
            file_id::FileId::Inode {
                device_id,
                inode_number,
            } => ("inode", device_id, inode_number as u128),
            file_id::FileId::LowRes {
                volume_serial_number,
                file_index,
            } => ("lowres", volume_serial_number as u64, file_index as u128),
            file_id::FileId::HighRes {
                volume_serial_number,
                file_id,
            } => ("highres", volume_serial_number, file_id),
        };

        let mtime_ms = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0);

        Ok(Self {
            kind: kind.to_string(),
            volume,
            file_id,
            size: metadata.len(),
            mtime_ms,
        })
    }

    /// 是否指向同一个文件（不比较 size/mtime）。
    pub fn same_file(&self, other: &Self) -> bool {
        self.kind == other.kind && self.volume == other.volume && self.file_id == other.file_id
    }
}
