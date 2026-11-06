use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use criterion::{criterion_group, criterion_main, Criterion};
use large_file_engine::config::EngineConfig;
use large_file_engine::index::{build_index, IndexStore};
use large_file_engine::reader::{read_at::ReadAtReader, FileReader};
use large_file_engine::search::{run_search, SearchOptions};
use large_file_engine::viewport::read_viewport;

fn fixture() -> (
    tempfile::TempDir,
    EngineConfig,
    Arc<dyn FileReader>,
    Arc<IndexStore>,
) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bench.log");
    let mut content = Vec::with_capacity(4 * 1024 * 1024);
    while content.len() < 4 * 1024 * 1024 {
        content.extend_from_slice(b"2026-01-01 INFO request completed in 12ms\n");
    }
    std::fs::write(&path, &content).unwrap();

    let config = EngineConfig {
        read_block_bytes: 256 * 1024,
        index_block_bytes: 1024 * 1024,
        ..EngineConfig::default()
    };
    let reader: Arc<dyn FileReader> = Arc::new(ReadAtReader::open(&path).unwrap());
    let store = Arc::new(IndexStore::new(1, reader.size()));
    build_index(reader.clone(), store.clone(), &config).unwrap();
    (dir, config, reader, store)
}

fn bench_viewport(c: &mut Criterion) {
    let (_dir, config, reader, store) = fixture();
    c.bench_function("viewport_200_lines", |b| {
        b.iter(|| {
            let snapshot = store.snapshot();
            read_viewport(reader.as_ref(), snapshot.as_ref(), 1000, 200, &config).unwrap();
        })
    });
}

fn bench_search(c: &mut Criterion) {
    let (_dir, config, reader, _store) = fixture();
    let options = SearchOptions {
        pattern: "ERROR".to_string(),
        regex: false,
        case_sensitive: true,
        whole_word: false,
        max_results: 100,
        from_offset: 0,
        start_line: Some(1),
        block_bytes: config.search_block_bytes,
        max_line_bytes: config.max_line_bytes,
    };
    c.bench_function("search_literal_4mb", |b| {
        b.iter(|| {
            run_search(
                reader.clone(),
                &options,
                Arc::new(AtomicBool::new(false)),
                |_| true,
            )
            .unwrap();
        })
    });
}

criterion_group!(benches, bench_viewport, bench_search);
criterion_main!(benches);
