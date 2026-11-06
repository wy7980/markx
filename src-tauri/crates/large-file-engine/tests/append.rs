use std::io::Write;
use std::sync::Arc;

use large_file_engine::config::EngineConfig;
use large_file_engine::index::{append_index, build_index, IndexStore};
use large_file_engine::reader::{read_at::ReadAtReader, FileReader};
use large_file_engine::viewport::read_viewport;

fn config() -> EngineConfig {
    EngineConfig {
        read_block_bytes: 64,
        index_block_bytes: 64,
        checkpoint_lines: 2,
        checkpoint_bytes: 64,
        max_line_bytes: 1024,
        ..EngineConfig::default()
    }
}

#[test]
fn append_index_extends_complete_file() {
    let mut file = tempfile::NamedTempFile::new().unwrap();
    file.write_all(b"a\nb\n").unwrap();
    file.flush().unwrap();

    let reader: Arc<dyn FileReader> = Arc::new(ReadAtReader::open(file.path()).unwrap());
    let store = Arc::new(IndexStore::new(1, reader.size()));
    build_index(reader.clone(), store.clone(), &config()).unwrap();

    file.write_all(b"c\n").unwrap();
    file.flush().unwrap();
    reader.refresh_size().unwrap();

    let total = append_index(reader.clone(), store.clone(), &config(), 4).unwrap();
    assert_eq!(total, 3);

    let snapshot = store.snapshot();
    let viewport = read_viewport(reader.as_ref(), snapshot.as_ref(), 3, 1, &config()).unwrap();
    assert_eq!(viewport.lines[0].text, "c");
}

#[test]
fn append_index_handles_partial_last_line() {
    let mut file = tempfile::NamedTempFile::new().unwrap();
    file.write_all(b"a\nb").unwrap();
    file.flush().unwrap();

    let reader: Arc<dyn FileReader> = Arc::new(ReadAtReader::open(file.path()).unwrap());
    let store = Arc::new(IndexStore::new(1, reader.size()));
    build_index(reader.clone(), store.clone(), &config()).unwrap();

    file.write_all(b"c\n").unwrap();
    file.flush().unwrap();
    reader.refresh_size().unwrap();

    let total = append_index(reader.clone(), store.clone(), &config(), 3).unwrap();
    assert_eq!(total, 2);

    let snapshot = store.snapshot();
    let viewport = read_viewport(reader.as_ref(), snapshot.as_ref(), 2, 1, &config()).unwrap();
    assert_eq!(viewport.lines[0].text, "bc");
}
