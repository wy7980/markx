use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

use large_file_engine::watch::WatchHandle;
use large_file_engine::{
    parse_session_id, shared_engine, EngineConfig, EngineError, FileEvent, FileProbe,
    LargeFileEngine, OpenResult, SearchEvent, SearchRequest, SearchResultsPage, ViewportResponse,
};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;
use uuid::Uuid;

pub struct EngineState {
    pub engine: Arc<LargeFileEngine>,
    pub watches: Mutex<HashMap<Uuid, (Uuid, WatchHandle)>>,
}

impl EngineState {
    pub fn new() -> Self {
        Self {
            engine: shared_engine(EngineConfig::default()),
            watches: Mutex::new(HashMap::new()),
        }
    }
}

fn stop_session_watches(state: &EngineState, session_id: Uuid) {
    let handles: Vec<(Uuid, WatchHandle)> = {
        let mut watches = state.watches.lock().unwrap();
        let ids: Vec<Uuid> = watches
            .iter()
            .filter(|(_, (session, _))| *session == session_id)
            .map(|(id, _)| *id)
            .collect();
        ids.into_iter()
            .filter_map(|id| watches.remove(&id))
            .collect()
    };
    // Drop outside the lock: WatchHandle::drop joins the polling thread.
    drop(handles);
}

impl Default for EngineState {
    fn default() -> Self {
        Self::new()
    }
}

/// 前端可读的结构化错误。
#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl From<EngineError> for CommandError {
    fn from(error: EngineError) -> Self {
        Self {
            code: error.code().to_string(),
            message: error.to_string(),
        }
    }
}

type CommandResult<T> = std::result::Result<T, CommandError>;

fn parse_id(value: &str) -> CommandResult<Uuid> {
    parse_session_id(value).map_err(CommandError::from)
}

#[tauri::command]
pub fn large_file_probe(state: State<'_, EngineState>, path: String) -> CommandResult<FileProbe> {
    Ok(state.engine.probe(Path::new(&path))?)
}

#[tauri::command]
pub fn large_file_open(
    state: State<'_, EngineState>,
    path: String,
) -> CommandResult<OpenResult> {
    Ok(state.engine.open(Path::new(&path))?)
}

#[tauri::command]
pub fn large_file_close(state: State<'_, EngineState>, session_id: String) -> CommandResult<bool> {
    let session_id = parse_id(&session_id)?;
    stop_session_watches(&state, session_id);
    Ok(state.engine.close(session_id))
}

#[tauri::command]
pub fn large_file_poll(
    state: State<'_, EngineState>,
    session_id: String,
) -> CommandResult<Option<FileEvent>> {
    Ok(state.engine.poll_file(parse_id(&session_id)?)?)
}

#[tauri::command]
pub fn large_file_jump_to_offset(
    state: State<'_, EngineState>,
    session_id: String,
    offset: u64,
    count: u32,
) -> CommandResult<ViewportResponse> {
    Ok(state
        .engine
        .jump_to_offset(parse_id(&session_id)?, offset, count)?)
}

#[tauri::command]
pub fn large_file_watch(
    state: State<'_, EngineState>,
    session_id: String,
    channel: Channel<FileEvent>,
) -> CommandResult<String> {
    let session_id = parse_id(&session_id)?;
    let watch_id = Uuid::new_v4();
    let handle = state.engine.watch(session_id, 1000, move |event| {
        let _ = channel.send(event);
    })?;
    state
        .watches
        .lock()
        .unwrap()
        .insert(watch_id, (session_id, handle));
    Ok(watch_id.to_string())
}

#[tauri::command]
pub fn large_file_unwatch(
    state: State<'_, EngineState>,
    watch_id: String,
) -> CommandResult<bool> {
    let watch_id = Uuid::parse_str(&watch_id).map_err(|error| CommandError {
        code: "InvalidRequest".to_string(),
        message: error.to_string(),
    })?;
    let handle = state.watches.lock().unwrap().remove(&watch_id);
    Ok(handle.is_some())
}

#[tauri::command]
pub fn large_file_viewport(
    state: State<'_, EngineState>,
    session_id: String,
    start_line: u64,
    count: u32,
) -> CommandResult<ViewportResponse> {
    Ok(state
        .engine
        .viewport(parse_id(&session_id)?, start_line, count)?)
}

#[tauri::command]
pub fn large_file_tail(
    state: State<'_, EngineState>,
    session_id: String,
    count: u32,
) -> CommandResult<ViewportResponse> {
    Ok(state.engine.tail(parse_id(&session_id)?, count.max(1) as usize)?)
}

#[tauri::command]
pub fn large_file_index_status(
    state: State<'_, EngineState>,
    session_id: String,
) -> CommandResult<large_file_engine::IndexStatus> {
    Ok(state.engine.index_status(parse_id(&session_id)?)?)
}

#[tauri::command]
pub fn large_file_info(
    state: State<'_, EngineState>,
    session_id: String,
) -> CommandResult<large_file_engine::FileInfo> {
    Ok(state.engine.file_info(parse_id(&session_id)?)?)
}

#[tauri::command]
pub fn large_file_search(
    state: State<'_, EngineState>,
    request: SearchRequest,
) -> CommandResult<String> {
    Ok(state.engine.search(request)?.to_string())
}

#[tauri::command]
pub fn large_file_search_stream(
    state: State<'_, EngineState>,
    request: SearchRequest,
    channel: Channel<SearchEvent>,
) -> CommandResult<String> {
    let task_id = state.engine.search_stream(request, move |event| {
        let _ = channel.send(event);
    })?;
    Ok(task_id.to_string())
}

#[tauri::command]
pub fn large_file_search_page(
    state: State<'_, EngineState>,
    task_id: String,
    start: u64,
    limit: u32,
) -> CommandResult<SearchResultsPage> {
    let task_id = Uuid::parse_str(&task_id)
        .map_err(|error| CommandError {
            code: "InvalidRequest".to_string(),
            message: error.to_string(),
        })?;
    Ok(state.engine.search_page(task_id, start, limit)?)
}

#[tauri::command]
pub fn large_file_search_cancel(
    state: State<'_, EngineState>,
    task_id: String,
) -> CommandResult<bool> {
    let task_id = Uuid::parse_str(&task_id).map_err(|error| CommandError {
        code: "InvalidRequest".to_string(),
        message: error.to_string(),
    })?;
    Ok(state.engine.cancel_search(task_id))
}

#[tauri::command]
pub fn large_file_search_release(
    state: State<'_, EngineState>,
    task_id: String,
) -> CommandResult<bool> {
    let task_id = Uuid::parse_str(&task_id).map_err(|error| CommandError {
        code: "InvalidRequest".to_string(),
        message: error.to_string(),
    })?;
    Ok(state.engine.release_search(task_id))
}
