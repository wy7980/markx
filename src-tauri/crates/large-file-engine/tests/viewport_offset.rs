use std::io::Write;
use std::sync::Arc;

use large_file_engine::config::EngineConfig;
use large_file_engine::index::{build_index, IndexStore};
use large_file_engine::reader::{read_at::ReadAtReader, FileReader};
use large_file_engine::viewport::read_viewport_at_offset;

fn config() -> EngineConfig {
    EngineConfig {
        read_block_bytes: 8,
        index_block_bytes: 8,
        checkpoint_lines: 1,
        checkpoint_bytes: 8,
        max_line_bytes: 1024,
        ..EngineConfig::default()
    }
}

#[test]
fn offset_maps_to_containing_line() {
    let mut file = tempfile::NamedTempFile::new().unwrap();
    file.write_all(b"aa\nbbb\ncccc\n").unwrap();
    file.flush().unwrap();

    let reader: Arc<dyn FileReader> = Arc::new(ReadAtReader::open(file.path()).unwrap());
    let store = Arc::new(IndexStore::new(1, reader.size()));
    build_index(reader.clone(), store.clone(), &config()).unwrap();
    let snapshot = store.snapshot();

    // offset 4 位于第 2 行 "bbb" 中间。
    let viewport =
        read_viewport_at_offset(reader.as_ref(), snapshot.as_ref(), 4, 1, &config()).unwrap();
    assert_eq!(viewport.lines[0].number, Some(2));
    assert_eq!(viewport.lines[0].text, "bbb");

    // offset 0 位于第 1 行。
    let viewport =
        read_viewport_at_offset(reader.as_ref(), snapshot.as_ref(), 0, 1, &config()).unwrap();
    assert_eq!(viewport.lines[0].number, Some(1));
    assert_eq!(viewport.lines[0].text, "aa");
}
