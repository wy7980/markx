use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use large_file_engine::reader::{read_at::ReadAtReader, FileReader};
use large_file_engine::search::{run_search, SearchOptions};
use large_file_engine::types::SearchHit;

fn write_temp(content: &str) -> tempfile::NamedTempFile {
    let mut file = tempfile::NamedTempFile::new().unwrap();
    file.write_all(content.as_bytes()).unwrap();
    file.flush().unwrap();
    file
}

fn options(pattern: &str) -> SearchOptions {
    SearchOptions {
        pattern: pattern.to_string(),
        regex: false,
        case_sensitive: true,
        whole_word: false,
        max_results: 100,
        from_offset: 0,
        start_line: Some(1),
        block_bytes: 16,
        max_line_bytes: 1024,
    }
}

fn collect(reader: Arc<dyn FileReader>, options: &SearchOptions) -> (Vec<SearchHit>, bool) {
    let mut hits = Vec::new();
    let cancel = Arc::new(AtomicBool::new(false));
    let summary = run_search(reader, options, cancel, |hit| {
        hits.push(hit);
        true
    })
    .unwrap();
    (hits, summary.cancelled)
}

#[test]
fn literal_search_reports_line_numbers_and_columns() {
    let file = write_temp("ERROR first\ninfo line\n  ERROR second\n");
    let reader: Arc<dyn FileReader> = Arc::new(ReadAtReader::open(file.path()).unwrap());

    let (hits, cancelled) = collect(reader, &options("ERROR"));
    assert!(!cancelled);
    assert_eq!(hits.len(), 2);
    assert_eq!(hits[0].line, Some(1));
    assert_eq!(hits[0].column, 1);
    assert_eq!(hits[1].line, Some(3));
    assert_eq!(hits[1].column, 3);
    assert!(hits[0].preview.contains("ERROR first"));
}

#[test]
fn regex_search_and_case_insensitive_literal() {
    let file = write_temp("error one\nERROR two\n");
    let reader: Arc<dyn FileReader> = Arc::new(ReadAtReader::open(file.path()).unwrap());

    let mut regex_options = options(r"ERR\w+");
    regex_options.regex = true;
    regex_options.case_sensitive = false;
    let (regex_hits, _) = collect(reader.clone(), &regex_options);
    assert_eq!(regex_hits.len(), 2);

    let mut insensitive = options("error");
    insensitive.case_sensitive = false;
    let (insensitive_hits, _) = collect(reader, &insensitive);
    assert_eq!(insensitive_hits.len(), 2);
}

#[test]
fn search_respects_max_results() {
    let file = write_temp("x\nx\nx\nx\n");
    let reader: Arc<dyn FileReader> = Arc::new(ReadAtReader::open(file.path()).unwrap());
    let mut search_options = options("x");
    search_options.max_results = 2;

    let (hits, _) = collect(reader, &search_options);
    assert_eq!(hits.len(), 2);
}

#[test]
fn search_can_be_cancelled() {
    let file = write_temp("ERROR\n");
    let reader: Arc<dyn FileReader> = Arc::new(ReadAtReader::open(file.path()).unwrap());
    let cancel = Arc::new(AtomicBool::new(true));
    let summary = run_search(reader, &options("ERROR"), cancel, |_| true).unwrap();
    assert!(summary.cancelled);
}

#[test]
fn invalid_regex_is_reported() {
    let file = write_temp("x\n");
    let reader: Arc<dyn FileReader> = Arc::new(ReadAtReader::open(file.path()).unwrap());
    let mut search_options = options("(");
    search_options.regex = true;
    let cancel = Arc::new(AtomicBool::new(false));
    assert!(run_search(reader, &search_options, cancel, |_| true).is_err());
}
