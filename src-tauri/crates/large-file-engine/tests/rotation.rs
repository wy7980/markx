use std::fs::{self, OpenOptions};
use std::io::Write;

use large_file_engine::watch::{detect_change, probe, FileChange};

#[test]
fn detects_append_rewrite_truncate_and_replace() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("app.log");
    fs::write(&path, b"a\nb\n").unwrap();

    let state = probe(&path, 64).unwrap();

    // append
    let mut file = OpenOptions::new().append(true).open(&path).unwrap();
    file.write_all(b"c\n").unwrap();
    file.flush().unwrap();
    assert_eq!(
        detect_change(&path, &state, 64).unwrap(),
        FileChange::Appended { new_size: 6 }
    );

    // 同内容重写：unchanged
    let state = probe(&path, 64).unwrap();
    fs::write(&path, b"a\nb\nc\n").unwrap();
    assert_eq!(
        detect_change(&path, &state, 64).unwrap(),
        FileChange::Unchanged
    );

    // 同大小但内容变化（copytruncate/重写）：truncated
    fs::write(&path, b"X\nY\nZ\n").unwrap();
    assert_eq!(
        detect_change(&path, &state, 64).unwrap(),
        FileChange::Truncated
    );

    // inode/文件 ID 变化：replaced
    let state = probe(&path, 64).unwrap();
    fs::remove_file(&path).unwrap();
    fs::write(&path, b"new\n").unwrap();
    assert_eq!(
        detect_change(&path, &state, 64).unwrap(),
        FileChange::Replaced
    );

    // 截断：truncated
    let state = probe(&path, 64).unwrap();
    fs::write(&path, b"").unwrap();
    assert_eq!(
        detect_change(&path, &state, 64).unwrap(),
        FileChange::Truncated
    );
}

#[test]
fn detects_removed_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("gone.log");
    fs::write(&path, b"x\n").unwrap();
    let state = probe(&path, 64).unwrap();
    fs::remove_file(&path).unwrap();
    assert_eq!(
        detect_change(&path, &state, 64).unwrap(),
        FileChange::Removed
    );
}
