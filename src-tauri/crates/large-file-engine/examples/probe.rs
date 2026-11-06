//! 打开一个大文件并打印关键路径耗时，用于本机压测。
//!
//! 用法：`cargo run -p large-file-engine --release --example probe -- /path/to/file.log`
//! 先用 `examples/gen_fixture.rs` 生成测试文件。

use std::path::Path;
use std::time::{Duration, Instant};

use large_file_engine::{types::IndexState, EngineConfig, LargeFileEngine};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args().nth(1).ok_or("usage: probe <path>")?;
    let engine = LargeFileEngine::new(EngineConfig::default());

    let started = Instant::now();
    let opened = engine.open(Path::new(&path))?;
    println!(
        "open: {:?}, mode={:?}, size={} bytes, tail_lines={}",
        started.elapsed(),
        opened.mode,
        opened.size,
        opened.tail.len()
    );

    let Some(session_id) = opened.session_id else {
        return Ok(());
    };

    let index_started = Instant::now();
    loop {
        let status = engine.index_status(session_id)?;
        if status.state == IndexState::Ready {
            println!(
                "index: {:?}, lines={:?}, indexed_bytes={}",
                index_started.elapsed(),
                status.total_lines,
                status.indexed_bytes
            );
            break;
        }
        if status.state == IndexState::Failed {
            return Err(format!("index failed: {status:?}").into());
        }
        if index_started.elapsed() > Duration::from_secs(300) {
            return Err("index timeout".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    }

    let viewport_started = Instant::now();
    let viewport = engine.viewport(session_id, 1, 200)?;
    println!(
        "viewport line 1: {:?}, lines={}",
        viewport_started.elapsed(),
        viewport.lines.len()
    );

    let jump_line = 5_000_000u64;
    let jump_started = Instant::now();
    match engine.viewport(session_id, jump_line, 200) {
        Ok(viewport) => println!(
            "jump line {jump_line}: {:?}, lines={}",
            jump_started.elapsed(),
            viewport.lines.len()
        ),
        Err(error) => println!(
            "jump line {jump_line}: {:?}, {error}",
            jump_started.elapsed()
        ),
    }

    let request = large_file_engine::types::SearchRequest {
        session_id,
        pattern: "ERROR".to_string(),
        regex: false,
        case_sensitive: true,
        whole_word: false,
        max_results: 100,
        from_offset: None,
    };
    let search_started = Instant::now();
    let task_id = engine.search(request)?;
    let mut done = false;
    let mut hits = 0;
    while !done {
        let page = engine.search_page(task_id, 0, 100)?;
        hits = page.hits.len();
        done = page.done;
        std::thread::sleep(Duration::from_millis(20));
    }
    println!("search all: {:?}, hits={hits}", search_started.elapsed());

    engine.close(session_id);
    Ok(())
}
