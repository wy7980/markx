use std::fs;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use large_file_engine::config::EngineConfig;
use large_file_engine::engine::LargeFileEngine;
use large_file_engine::types::{FileMode, IndexState, SearchEvent};

fn config() -> EngineConfig {
    EngineConfig {
        editable_max_bytes: 8,
        read_block_bytes: 64,
        index_block_bytes: 64,
        checkpoint_lines: 2,
        checkpoint_bytes: 64,
        tail_block_bytes: 128,
        ..EngineConfig::default()
    }
}

#[test]
fn probe_reports_mode_without_opening_a_session() {
    let dir = tempfile::tempdir().unwrap();
    let small = dir.path().join("small.txt");
    let large = dir.path().join("large.txt");
    fs::write(&small, b"1234").unwrap();
    fs::write(&large, b"12345678901234567890").unwrap();

    let mut probe_config = config();
    probe_config.editable_max_bytes = 10;
    let engine = LargeFileEngine::new(probe_config);
    let small_probe = engine.probe(&small).unwrap();
    assert_eq!(small_probe.mode, FileMode::Editable);
    assert_eq!(small_probe.size, 4);

    let large_probe = engine.probe(&large).unwrap();
    assert_eq!(large_probe.mode, FileMode::ReadOnly);
    assert_eq!(large_probe.size, 20);
}

#[test]
fn small_files_are_routed_to_editable() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("small.md");
    fs::write(&path, b"tiny").unwrap();

    let engine = LargeFileEngine::new(config());
    let result = engine.open(&path).unwrap();
    assert_eq!(result.mode, FileMode::Editable);
    assert!(result.session_id.is_none());
}

#[test]
fn large_files_open_read_only_and_support_viewport() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("app.log");
    fs::write(&path, b"one\ntwo\nthree\nfour\n").unwrap();

    let engine = LargeFileEngine::new(config());
    let opened = engine.open(&path).unwrap();
    assert_eq!(opened.mode, FileMode::ReadOnly);
    let session_id = opened.session_id.unwrap();

    for _ in 0..200 {
        if engine.index_status(session_id).unwrap().state == IndexState::Ready {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(
        engine.index_status(session_id).unwrap().state,
        IndexState::Ready
    );

    let viewport = engine.viewport(session_id, 1, 2).unwrap();
    assert_eq!(viewport.lines.len(), 2);
    assert_eq!(viewport.lines[0].text, "one");
    assert_eq!(viewport.lines[1].text, "two");

    let tail = engine.tail(session_id, 2).unwrap();
    assert_eq!(tail.lines.last().unwrap().text, "four");

    assert!(engine.close(session_id));
    assert!(engine.viewport(session_id, 1, 1).is_err());
}

#[test]
fn search_stream_emits_batches_and_done() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("stream.log");
    fs::write(&path, b"ERROR one\ninfo\nERROR two\n").unwrap();

    let engine = LargeFileEngine::new(config());
    let opened = engine.open(&path).unwrap();
    let session_id = opened.session_id.unwrap();

    for _ in 0..200 {
        if engine.index_status(session_id).unwrap().state == IndexState::Ready {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }

    let request = large_file_engine::types::SearchRequest {
        session_id,
        pattern: "ERROR".to_string(),
        regex: false,
        case_sensitive: true,
        whole_word: false,
        max_results: 10,
        from_offset: None,
    };

    let (tx, rx) = mpsc::channel();
    engine
        .search_stream(request, move |event| {
            let _ = tx.send(event);
        })
        .unwrap();

    let mut hits = 0usize;
    loop {
        match rx.recv_timeout(Duration::from_secs(5)).unwrap() {
            SearchEvent::Batch { hits: batch, .. } => hits += batch.len(),
            SearchEvent::Done {
                total,
                cancelled,
                error,
                ..
            } => {
                assert_eq!(total, 2);
                assert!(!cancelled);
                assert!(error.is_none());
                break;
            }
        }
    }
    assert_eq!(hits, 2);

    engine.close(session_id);
}

#[test]
fn search_task_returns_paginated_results() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("search.log");
    fs::write(&path, b"ERROR one\ninfo\nERROR two\n").unwrap();

    let engine = LargeFileEngine::new(config());
    let opened = engine.open(&path).unwrap();
    let session_id = opened.session_id.unwrap();

    let request = large_file_engine::types::SearchRequest {
        session_id,
        pattern: "ERROR".to_string(),
        regex: false,
        case_sensitive: true,
        whole_word: false,
        max_results: 10,
        from_offset: None,
    };
    let task_id = engine.search(request).unwrap();

    let mut hits = Vec::new();
    for _ in 0..100 {
        let page = engine.search_page(task_id, 0, 10).unwrap();
        hits = page.hits;
        if page.done {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(hits.len(), 2);
    assert_eq!(hits[0].line, Some(1));
    assert_eq!(hits[1].line, Some(3));
}
