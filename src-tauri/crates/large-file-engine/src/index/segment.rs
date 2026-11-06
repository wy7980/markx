use crate::types::Epoch;

#[derive(Debug, Clone, Copy)]
pub struct Checkpoint {
    /// 0-based 行号（该行行首）。
    pub line: u64,
    /// 行首字节偏移。
    pub offset: u64,
}

#[derive(Debug, Clone)]
pub struct IndexSegment {
    pub start_offset: u64,
    pub end_offset: u64,
    /// None 表示尾部先行索引，绝对行号尚不可知。
    pub start_line: Option<u64>,
    pub checkpoints: Vec<Checkpoint>,
    pub complete: bool,
}

impl IndexSegment {
    /// 返回不晚于 line 的最近 checkpoint：(offset, checkpoint_line)。
    pub fn locate(&self, line: u64) -> Option<(u64, u64)> {
        let start_line = self.start_line?;
        if line < start_line {
            return None;
        }
        let index = self
            .checkpoints
            .partition_point(|checkpoint| checkpoint.line <= line)
            .checked_sub(1)?;
        let checkpoint = self.checkpoints[index];
        Some((checkpoint.offset, checkpoint.line))
    }
}

#[derive(Debug, Clone)]
pub struct IndexSnapshot {
    pub segments: Vec<IndexSegment>,
    pub total_lines: Option<u64>,
    pub indexed_bytes: u64,
    pub complete: bool,
    pub epoch: Epoch,
}

impl IndexSnapshot {
    pub fn empty(epoch: Epoch) -> Self {
        Self {
            segments: Vec::new(),
            total_lines: None,
            indexed_bytes: 0,
            complete: false,
            epoch,
        }
    }

    /// 查询字节 offset 之前最近的 checkpoint；返回 (checkpoint_offset, checkpoint_line)。
    pub fn locate_by_offset(&self, offset: u64) -> Option<(u64, u64)> {
        for segment in &self.segments {
            if offset < segment.start_offset || offset > segment.end_offset {
                continue;
            }
            if segment.checkpoints.is_empty() {
                continue;
            }
            let index = segment
                .checkpoints
                .partition_point(|checkpoint| checkpoint.offset <= offset)
                .checked_sub(1)?;
            let checkpoint = segment.checkpoints[index];
            return Some((checkpoint.offset, checkpoint.line));
        }
        None
    }

    /// 查询行号对应的 checkpoint；返回 (offset, checkpoint_line)。
    pub fn locate(&self, line: u64) -> Option<(u64, u64)> {
        for segment in &self.segments {
            if segment.start_line.is_none() {
                continue;
            }
            if let Some(found) = segment.locate(line) {
                return Some(found);
            }
        }
        None
    }
}
