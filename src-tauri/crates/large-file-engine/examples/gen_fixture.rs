//! 生成压测用的大日志文件。
//!
//! 用法：
//! `cargo run -p large-file-engine --example gen_fixture -- 1024 /tmp/1g.log`
//! 第一个参数是目标大小（MB），第二个参数是输出路径。

use std::fs::File;
use std::io::{BufWriter, Write};

fn main() -> std::io::Result<()> {
    let mut args = std::env::args().skip(1);
    let size_mb: u64 = args
        .next()
        .and_then(|value| value.parse().ok())
        .unwrap_or(128);
    let path = args.next().unwrap_or_else(|| "fixture.log".to_string());

    let target = size_mb.saturating_mul(1024 * 1024);
    let line =
        b"2026-01-01T00:00:00Z INFO request completed status=200 latency=12ms path=/api/items\n";

    let file = File::create(&path)?;
    let mut writer = BufWriter::with_capacity(1024 * 1024, file);
    let mut written = 0u64;
    while written < target {
        writer.write_all(line)?;
        written += line.len() as u64;
    }
    writer.flush()?;
    eprintln!("wrote {written} bytes to {path}");
    Ok(())
}
