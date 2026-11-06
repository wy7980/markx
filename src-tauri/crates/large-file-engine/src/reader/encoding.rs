use crate::error::{EngineError, Result};
use crate::reader::FileReader;

/// 大文件打开前的轻量校验：
/// - UTF-16/UTF-32 BOM：明确不支持；
/// - 采样中出现 NUL：按二进制处理；
/// - 非 UTF-8 且不是采样尾部截断：按不支持的编码处理。
pub fn validate_text_sample(reader: &dyn FileReader, sample_bytes: usize) -> Result<()> {
    let size = reader.size();
    if size == 0 {
        return Ok(());
    }

    let len = (sample_bytes.max(4) as u64).min(size) as usize;
    let mut buffer = vec![0u8; len];
    let read = reader.read_at(0, &mut buffer)?;
    buffer.truncate(read);

    if buffer.starts_with(&[0xFF, 0xFE, 0x00, 0x00])
        || buffer.starts_with(&[0x00, 0x00, 0xFE, 0xFF])
        || buffer.starts_with(&[0xFF, 0xFE])
        || buffer.starts_with(&[0xFE, 0xFF])
    {
        return Err(EngineError::UnsupportedEncoding(
            "UTF-16/UTF-32 大文件暂不支持".into(),
        ));
    }

    if buffer.contains(&0) {
        return Err(EngineError::BinaryFile);
    }

    match std::str::from_utf8(&buffer) {
        Ok(_) => Ok(()),
        // 采样窗口可能刚好截断一个多字节字符，允许尾部最多 3 字节不完整。
        Err(error) if error.error_len().is_none() && error.valid_up_to() + 3 >= buffer.len() => {
            Ok(())
        }
        Err(_) => Err(EngineError::UnsupportedEncoding(
            "仅支持 UTF-8/ASCII 大文件".into(),
        )),
    }
}
