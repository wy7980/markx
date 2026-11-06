use std::io::Write;

use large_file_engine::reader::encoding::validate_text_sample;
use large_file_engine::reader::{read_at::ReadAtReader, FileReader};

fn check(content: &[u8]) -> Result<(), large_file_engine::EngineError> {
    let mut file = tempfile::NamedTempFile::new().unwrap();
    file.write_all(content).unwrap();
    file.flush().unwrap();
    let reader = ReadAtReader::open(file.path()).unwrap();
    validate_text_sample(&reader, 64 * 1024)
}

#[test]
fn accepts_utf8() {
    assert!(check("hello\n世界\n".as_bytes()).is_ok());
}

#[test]
fn rejects_utf16_bom() {
    assert!(matches!(
        check(&[0xFF, 0xFE, b'h', 0, b'i', 0]),
        Err(large_file_engine::EngineError::UnsupportedEncoding(_))
    ));
}

#[test]
fn rejects_binary_nul() {
    assert!(matches!(
        check(b"abc\0def"),
        Err(large_file_engine::EngineError::BinaryFile)
    ));
}

#[test]
fn rejects_invalid_utf8() {
    assert!(matches!(
        check(&[0x61, 0x62, 0xFF, 0x63]),
        Err(large_file_engine::EngineError::UnsupportedEncoding(_))
    ));
}
