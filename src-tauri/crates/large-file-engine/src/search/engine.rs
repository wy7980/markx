use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::error::{EngineError, Result};
use crate::reader::FileReader;
use crate::types::SearchHit;

#[derive(Debug, Clone)]
pub struct SearchOptions {
    pub pattern: String,
    pub regex: bool,
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub max_results: u64,
    /// 从该字节位置开始（一般应为行首）；0 表示文件头。
    pub from_offset: u64,
    /// from_offset 所在行的 1-based 行号；None 表示未知。
    pub start_line: Option<u64>,
    pub block_bytes: usize,
    pub max_line_bytes: usize,
}

#[derive(Debug, Clone, Copy)]
pub struct SearchSummary {
    pub hits: u64,
    pub cancelled: bool,
}

enum Matcher {
    Literal(Vec<u8>),
    Regex(regex::bytes::Regex),
}

impl Matcher {
    fn build(options: &SearchOptions) -> Result<Self> {
        if options.regex {
            return Ok(Matcher::Regex(build_regex(
                &options.pattern,
                options.case_sensitive,
                options.whole_word,
            )?));
        }

        if options.case_sensitive && !options.whole_word {
            return Ok(Matcher::Literal(options.pattern.as_bytes().to_vec()));
        }

        // 大小写不敏感 / 整词匹配走正则；转义用户输入，保持字面量语义。
        let pattern = regex::escape(&options.pattern);
        Ok(Matcher::Regex(build_regex(
            &pattern,
            options.case_sensitive,
            options.whole_word,
        )?))
    }

    fn find(&self, haystack: &[u8]) -> Option<(usize, usize)> {
        match self {
            Matcher::Literal(needle) => {
                memchr::memmem::find(haystack, needle).map(|start| (start, start + needle.len()))
            }
            Matcher::Regex(regex) => regex
                .find(haystack)
                .map(|matched| (matched.start(), matched.end())),
        }
    }
}

fn build_regex(
    pattern: &str,
    case_sensitive: bool,
    whole_word: bool,
) -> Result<regex::bytes::Regex> {
    let pattern = if whole_word {
        format!(r"\b(?:{pattern})\b")
    } else {
        pattern.to_string()
    };
    regex::bytes::RegexBuilder::new(&pattern)
        .case_insensitive(!case_sensitive)
        .size_limit(64 * 1024 * 1024)
        .build()
        .map_err(|error| EngineError::InvalidRegex(error.to_string()))
}

fn hit_column_length(line: &[u8], start: usize, end: usize) -> (u32, u32) {
    let start = start.min(line.len());
    let end = end.max(start).min(line.len());
    let column = String::from_utf8_lossy(&line[..start]).chars().count() as u32 + 1;
    let length = String::from_utf8_lossy(&line[start..end])
        .chars()
        .count()
        .max(1) as u32;
    (column, length)
}

fn preview(bytes: &[u8], max: usize) -> String {
    let end = bytes.len().min(max);
    String::from_utf8_lossy(&bytes[..end]).into_owned()
}

/// 行导向搜索：按块读取，跨块行用 pending 缓冲拼接，行号在扫描中维护。
///
/// 只做行内匹配；跨行正则不在首版范围内（日志场景足够）。
fn append_capped(target: &mut Vec<u8>, bytes: &[u8], max: usize) {
    if target.len() >= max {
        return;
    }
    let remaining = max - target.len();
    target.extend_from_slice(&bytes[..bytes.len().min(remaining)]);
}

pub fn run_search<F>(
    reader: Arc<dyn FileReader>,
    options: &SearchOptions,
    cancel: Arc<AtomicBool>,
    mut on_hit: F,
) -> Result<SearchSummary>
where
    F: FnMut(SearchHit) -> bool,
{
    let matcher = Matcher::build(options)?;
    let line_cap = options.max_line_bytes.max(64 * 1024);
    let total = reader.size();
    let mut buffer = vec![0u8; options.block_bytes.max(4096)];

    let mut offset = options.from_offset.min(total);
    let mut line_start = offset;
    let mut line_number = options.start_line;
    let mut pending: Vec<u8> = Vec::new();
    let mut hits = 0u64;

    while offset < total {
        if cancel.load(Ordering::Relaxed) {
            return Ok(SearchSummary {
                hits,
                cancelled: true,
            });
        }

        let read = reader.read_at(offset, &mut buffer)?;
        if read == 0 {
            break;
        }

        let mut chunk_start = 0usize;
        for position in memchr::memchr_iter(b'\n', &buffer[..read]) {
            let segment = &buffer[chunk_start..position];
            append_capped(&mut pending, segment, line_cap);

            if let Some((start, end)) = matcher.find(&pending) {
                let (column, match_length) = hit_column_length(&pending, start, end);
                let hit = SearchHit {
                    line: line_number,
                    line_exact: line_number.is_some(),
                    offset: line_start + start as u64,
                    column,
                    match_length,
                    preview: preview(&pending, options.max_line_bytes),
                };
                hits += 1;
                if !on_hit(hit) || hits >= options.max_results {
                    return Ok(SearchSummary {
                        hits,
                        cancelled: false,
                    });
                }
            }

            line_number = line_number.map(|number| number + 1);
            line_start = offset + position as u64 + 1;
            chunk_start = position + 1;
            pending.clear();

            if cancel.load(Ordering::Relaxed) {
                return Ok(SearchSummary {
                    hits,
                    cancelled: true,
                });
            }
        }

        append_capped(&mut pending, &buffer[chunk_start..read], line_cap);
        offset += read as u64;
    }

    // 最后一行没有换行。
    if !pending.is_empty() && offset >= total {
        if let Some((start, end)) = matcher.find(&pending) {
            let (column, match_length) = hit_column_length(&pending, start, end);
            let hit = SearchHit {
                line: line_number,
                line_exact: line_number.is_some(),
                offset: line_start + start as u64,
                column,
                match_length,
                preview: preview(&pending, options.max_line_bytes),
            };
            hits += 1;
            on_hit(hit);
        }
    }

    Ok(SearchSummary {
        hits,
        cancelled: cancel.load(Ordering::Relaxed),
    })
}
