use large_file_engine::types::{FileEvent, SearchEvent, SearchHit};
use uuid::Uuid;

#[test]
fn file_event_uses_camel_case_for_frontend() {
    let session_id = Uuid::parse_str("11111111-1111-4111-8111-111111111111").unwrap();
    let appended = FileEvent::Appended {
        session_id,
        old_size: 10,
        new_size: 20,
        total_lines: Some(3),
    };
    let value = serde_json::to_value(&appended).unwrap();
    assert_eq!(value["kind"], "appended");
    assert_eq!(value["sessionId"], session_id.to_string());
    assert_eq!(value["oldSize"], 10);
    assert_eq!(value["newSize"], 20);
    assert_eq!(value["totalLines"], 3);

    let rotated = FileEvent::Rotated { session_id };
    let value = serde_json::to_value(&rotated).unwrap();
    assert_eq!(value["kind"], "rotated");
    assert_eq!(value["sessionId"], session_id.to_string());
}

#[test]
fn search_event_uses_camel_case_for_frontend() {
    let task_id = Uuid::parse_str("22222222-2222-4222-8222-222222222222").unwrap();
    let batch = SearchEvent::Batch {
        task_id,
        epoch: 1,
        total: 1,
        hits: vec![SearchHit {
            line: Some(42),
            line_exact: true,
            offset: 420,
            column: 1,
            match_length: 5,
            preview: "ERROR".to_string(),
        }],
    };
    let value = serde_json::to_value(&batch).unwrap();
    assert_eq!(value["kind"], "batch");
    assert_eq!(value["taskId"], task_id.to_string());
    assert_eq!(value["total"], 1);
    assert_eq!(value["hits"][0]["line"], 42);

    let done = SearchEvent::Done {
        task_id,
        epoch: 1,
        total: 1,
        cancelled: false,
        error: None,
    };
    let value = serde_json::to_value(&done).unwrap();
    assert_eq!(value["kind"], "done");
    assert_eq!(value["taskId"], task_id.to_string());
}
