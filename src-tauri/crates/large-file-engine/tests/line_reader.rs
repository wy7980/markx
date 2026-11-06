use std::io::Write;
use std::sync::Arc;

use large_file_engine::config::EngineConfig;
use large_file_engine::index::{build_index, IndexStore};
use large_file_engine::reader::{read_at::ReadAtReader, FileReader};
use large_file_engine::types::IndexState;
use large_file_engine::viewport::{read_tail, read_viewport};

fn test_config() -> EngineConfig {
    EngineConfig {
        read_block_bytes: 64,
        index_block_bytes: 64,
        checkpoint_lines: 2,
        checkpoint_bytes: 64,
        max_line_bytes: 1024,
        tail_block_bytes: 128,
        ..EngineConfig::default()
    }
}

fn write_temp(content: &[u8]) -> tempfile::NamedTempFile {
    let mut file = tempfile::NamedTempFile::new().unwrap();
    file.write_all(content).unwrap();
    file.flush().unwrap();
    file
}

fn indexed_reader(file: &tempfile::NamedTempFile) -> (Arc<dyn FileReader>, Arc<IndexStore>) {
    let reader: Arc<dyn FileReader> = Arc::new(ReadAtReader::open(file.path()).unwrap());
    let store = Arc::new(IndexStore::new(1, reader.size()));
    build_index(reader.clone(), store.clone(), &test_config()).unwrap();
    (reader, store)
}

#[test]
fn viewport_returns_expected_lines_and_numbers() {
    let file = write_temp(b"alpha\nbeta\ngamma\ndelta\n");
    let (reader, store) = indexed_reader(&file);

    let snapshot = store.snapshot();
    let response = read_viewport(reader.as_ref(), snapshot.as_ref(), 1, 2, &test_config()).unwrap();

    assert_eq!(response.lines.len(), 2);
    assert_eq!(response.lines[0].number, Some(1));
    assert_eq!(response.lines[0].text, "alpha");
    assert_eq!(response.lines[1].number, Some(2));
    assert_eq!(response.lines[1].text, "beta");
    assert_eq!(response.total_lines, Some(4));
    assert!(response.has_more);
}

#[test]
fn viewport_handles_crlf_and_missing_trailing_newline() {
    let file = write_temp(b"a\r\nb\r\nc");
    let (reader, store) = indexed_reader(&file);
    let snapshot = store.snapshot();

    let response =
        read_viewport(reader.as_ref(), snapshot.as_ref(), 1, 10, &test_config()).unwrap();
    let texts: Vec<_> = response
        .lines
        .iter()
        .map(|line| line.text.as_str())
        .collect();
    assert_eq!(texts, vec!["a", "b", "c"]);
    assert_eq!(response.total_lines, Some(3));
}

#[test]
fn tail_returns_last_lines_without_line_numbers() {
    let file = write_temp(b"1\n2\n3\n4\n5\n");
    let reader = ReadAtReader::open(file.path()).unwrap();
    let lines = read_tail(&reader as &dyn FileReader, 2, &test_config()).unwrap();

    let texts: Vec<_> = lines.iter().map(|line| line.text.as_str()).collect();
    assert_eq!(texts, vec!["4", "5"]);
    assert!(lines.iter().all(|line| line.number.is_none()));
}

#[test]
fn index_reports_ready_and_total_lines() {
    let file = write_temp(b"a\nb\nc\n");
    let (_reader, store) = indexed_reader(&file);
    let status = store.status();
    assert_eq!(status.state, IndexState::Ready);
    assert_eq!(status.total_lines, Some(3));
}

#[test]
fn viewport_rejects_line_zero() {
    let file = write_temp(b"a\n");
    let (reader, store) = indexed_reader(&file);
    let snapshot = store.snapshot();
    assert!(read_viewport(reader.as_ref(), snapshot.as_ref(), 0, 1, &test_config()).is_err());
}
