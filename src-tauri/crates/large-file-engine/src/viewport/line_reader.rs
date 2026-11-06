use crate::config::EngineConfig;
use crate::error::{EngineError, Result};
use crate::index::IndexSnapshot;
use crate::reader::FileReader;
use crate::types::{LogLine, Numbering, ViewportResponse};

/// 从 checkpoint 顺序扫描，返回目标逻辑行（0-based）的行首偏移。
fn advance_to_line(
    reader: &dyn FileReader,
    start_offset: u64,
    start_line: u64,
    target_line: u64,
    block_bytes: usize,
) -> Result<u64> {
    if target_line < start_line {
        return Err(EngineError::InvalidRequest(
            "target line before checkpoint".into(),
        ));
    }
    if target_line == start_line {
        return Ok(start_offset);
    }

    let mut line = start_line;
    let mut offset = start_offset;
    let mut buffer = vec![0u8; block_bytes.max(4096)];

    loop {
        let read = reader.read_at(offset, &mut buffer)?;
        if read == 0 {
            return Err(EngineError::IndexNotReady(target_line + 1));
        }
        for position in memchr::memchr_iter(b'\n', &buffer[..read]) {
            line += 1;
            if line == target_line {
                return Ok(offset + position as u64 + 1);
            }
        }
        offset += read as u64;
    }
}

fn decode_line(number: Option<u64>, offset: u64, bytes: &[u8], max_line_bytes: usize) -> LogLine {
    let mut end = bytes.len();
    if end > 0 && bytes[end - 1] == b'\r' {
        end -= 1;
    }
    let truncated = end > max_line_bytes;
    let end = end.min(max_line_bytes);
    let text = String::from_utf8_lossy(&bytes[..end]).into_owned();
    LogLine {
        number,
        offset,
        text,
        truncated,
    }
}

/// 读取尾部窗口，用于打开大文件时的首屏。
pub fn read_tail(
    reader: &dyn FileReader,
    max_lines: usize,
    config: &EngineConfig,
) -> Result<Vec<LogLine>> {
    let size = reader.size();
    if size == 0 || max_lines == 0 {
        return Ok(Vec::new());
    }

    let window = (config.tail_block_bytes.max(config.read_block_bytes * 4) as u64).min(size);
    let mut start = size - window;
    let mut buffer = vec![0u8; window as usize];
    let read = reader.read_at(start, &mut buffer)?;
    buffer.truncate(read);

    if start > 0 {
        match memchr::memchr(b'\n', &buffer) {
            Some(position) => {
                start += position as u64 + 1;
                buffer.drain(..=position);
            }
            // 整个窗口没有换行：仍然展示这一行（会被截断）。
            None => {}
        }
    }

    let mut lines = Vec::new();
    let mut line_start = 0usize;
    for position in memchr::memchr_iter(b'\n', &buffer) {
        if position > line_start {
            lines.push(decode_line(
                None,
                start + line_start as u64,
                &buffer[line_start..position],
                config.max_line_bytes,
            ));
        }
        line_start = position + 1;
    }
    if line_start < buffer.len() {
        lines.push(decode_line(
            None,
            start + line_start as u64,
            &buffer[line_start..],
            config.max_line_bytes,
        ));
    }

    if lines.len() > max_lines {
        lines.drain(..lines.len() - max_lines);
    }
    Ok(lines)
}

/// 从字节 offset 定位到所在行，再读取视口。
pub fn read_viewport_at_offset(
    reader: &dyn FileReader,
    snapshot: &IndexSnapshot,
    offset: u64,
    count: u32,
    config: &EngineConfig,
) -> Result<ViewportResponse> {
    if count == 0 {
        return Err(EngineError::InvalidRequest(
            "count must be greater than zero".into(),
        ));
    }

    let target = offset.min(reader.size());
    let (checkpoint_offset, checkpoint_line) = snapshot.locate_by_offset(target).unwrap_or((0, 0));

    let mut line_index = checkpoint_line;
    let mut position = checkpoint_offset;
    let mut buffer = vec![0u8; config.read_block_bytes.max(4096)];

    while position < target {
        let read = reader.read_at(position, &mut buffer)?;
        if read == 0 {
            break;
        }
        let limit = ((target - position) as usize).min(read);
        for _ in memchr::memchr_iter(b'\n', &buffer[..limit]) {
            line_index += 1;
        }
        position += limit as u64;
    }

    // read_viewport 会从行首重新定位；这里只负责把 offset 映射到行号。
    read_viewport(reader, snapshot, line_index + 1, count, config)
}

/// 读取 [start_line, start_line + count) 的视口。start_line 为 1-based。
pub fn read_viewport(
    reader: &dyn FileReader,
    snapshot: &IndexSnapshot,
    start_line: u64,
    count: u32,
    config: &EngineConfig,
) -> Result<ViewportResponse> {
    if start_line == 0 || count == 0 {
        return Err(EngineError::InvalidRequest(
            "start_line and count must be greater than zero".into(),
        ));
    }

    let target_line = start_line - 1;
    let (checkpoint_offset, checkpoint_line) = snapshot
        .locate(target_line)
        .ok_or(EngineError::IndexNotReady(start_line))?;
    let mut offset = advance_to_line(
        reader,
        checkpoint_offset,
        checkpoint_line,
        target_line,
        config.read_block_bytes,
    )?;

    let mut lines = Vec::with_capacity(count as usize);
    let mut line_index = target_line;
    let mut line_start = offset;
    let mut line_buffer: Vec<u8> = Vec::new();
    let mut truncated = false;

    let mut buffer = vec![0u8; config.read_block_bytes.max(4096)];
    let mut has_more = false;
    let total = reader.size();

    'outer: loop {
        let read = reader.read_at(offset, &mut buffer)?;
        if read == 0 {
            break;
        }

        let mut chunk_start = 0usize;
        for position in memchr::memchr_iter(b'\n', &buffer[..read]) {
            let segment = &buffer[chunk_start..position];
            append_capped(
                &mut line_buffer,
                segment,
                config.max_line_bytes,
                &mut truncated,
            );
            lines.push(decode_line(
                Some(line_index + 1),
                line_start,
                &line_buffer,
                config.max_line_bytes,
            ));
            line_index += 1;
            line_start = offset + position as u64 + 1;
            line_buffer.clear();
            truncated = false;
            chunk_start = position + 1;

            if lines.len() >= count as usize {
                has_more = line_start < total;
                break 'outer;
            }
        }

        append_capped(
            &mut line_buffer,
            &buffer[chunk_start..read],
            config.max_line_bytes,
            &mut truncated,
        );
        offset += read as u64;
    }

    // 文件末尾没有换行的最后一行。
    if lines.len() < count as usize && (!line_buffer.is_empty() || line_start < total) {
        lines.push(decode_line(
            Some(line_index + 1),
            line_start,
            &line_buffer,
            config.max_line_bytes,
        ));
    }

    Ok(ViewportResponse {
        epoch: reader.epoch(),
        lines,
        total_lines: snapshot.total_lines,
        numbering: Numbering::Exact,
        has_more,
    })
}

fn append_capped(target: &mut Vec<u8>, bytes: &[u8], max: usize, truncated: &mut bool) {
    if target.len() >= max {
        if !bytes.is_empty() {
            *truncated = true;
        }
        return;
    }
    let remaining = max - target.len();
    if bytes.len() > remaining {
        target.extend_from_slice(&bytes[..remaining]);
        *truncated = true;
    } else {
        target.extend_from_slice(bytes);
    }
}
