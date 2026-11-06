use std::fs::OpenOptions;
use std::io::Write;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use large_file_engine::config::EngineConfig;
use large_file_engine::engine::LargeFileEngine;
use large_file_engine::types::{FileEvent, IndexState};

fn config() -> EngineConfig {
    EngineConfig {
        editable_max_bytes: 1,
        read_block_bytes: 64,
        index_block_bytes: 64,
        checkpoint_lines: 2,
        checkpoint_bytes: 64,
        ..EngineConfig::default()
    }
}

#[test]
fn watch_emits_appended_event_and_updates_index() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("live.log");
    std::fs::write(&path, b"a\n").unwrap();

    let engine = LargeFileEngine::new(config());
    let opened = engine.open(&path).unwrap();
    let session_id = opened.session_id.unwrap();

    for _ in 0..200 {
        if engine.index_status(session_id).unwrap().state == IndexState::Ready {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }

    let (tx, rx) = mpsc::channel();
    let watch = engine
        .watch(session_id, 200, move |event| {
            let _ = tx.send(event);
        })
        .unwrap();

    let mut file = OpenOptions::new().append(true).open(&path).unwrap();
    file.write_all(b"b\n").unwrap();
    file.flush().unwrap();

    let event = rx.recv_timeout(Duration::from_secs(5)).unwrap();
    match event {
        FileEvent::Appended {
            session_id: event_session,
            new_size,
            total_lines,
            ..
        } => {
            assert_eq!(event_session, session_id);
            assert_eq!(new_size, 4);
            assert_eq!(total_lines, Some(2));
        }
        other => panic!("unexpected event: {other:?}"),
    }

    let viewport = engine.viewport(session_id, 2, 1).unwrap();
    assert_eq!(viewport.lines[0].text, "b");

    drop(watch);
    engine.close(session_id);
}
