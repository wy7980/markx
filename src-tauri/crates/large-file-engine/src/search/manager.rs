use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use parking_lot::{Mutex, RwLock};
use uuid::Uuid;

use crate::types::{Epoch, SearchHit, SearchResultsPage, SessionId};

#[derive(Default)]
struct SearchTaskState {
    hits: Vec<SearchHit>,
    done: bool,
    cancelled: bool,
    error: Option<String>,
}

pub struct SearchTask {
    pub id: Uuid,
    pub epoch: Epoch,
    pub session_id: SessionId,
    cancel: Arc<AtomicBool>,
    state: Mutex<SearchTaskState>,
}

impl SearchTask {
    fn new(epoch: Epoch, session_id: SessionId) -> Self {
        Self {
            id: Uuid::new_v4(),
            epoch,
            session_id,
            cancel: Arc::new(AtomicBool::new(false)),
            state: Mutex::new(SearchTaskState::default()),
        }
    }

    pub fn cancel_flag(&self) -> Arc<AtomicBool> {
        self.cancel.clone()
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }

    /// 返回 false 表示调用方应停止继续搜索（任务已取消）。
    pub fn push(&self, hit: SearchHit) -> bool {
        let mut state = self.state.lock();
        if self.cancel.load(Ordering::Relaxed) {
            state.cancelled = true;
            return false;
        }
        state.hits.push(hit);
        true
    }

    pub fn finish(&self, cancelled: bool, error: Option<String>) {
        let mut state = self.state.lock();
        state.done = true;
        state.cancelled = cancelled || state.cancelled;
        state.error = error;
    }

    pub fn page(&self, start: u64, limit: u32) -> SearchResultsPage {
        let state = self.state.lock();
        let start_index = (start as usize).min(state.hits.len());
        let end_index = (start_index + limit.max(1) as usize).min(state.hits.len());
        let hits = state.hits[start_index..end_index].to_vec();
        let next_index = if end_index < state.hits.len() {
            Some(end_index as u64)
        } else {
            None
        };
        SearchResultsPage {
            task_id: self.id,
            epoch: self.epoch,
            hits,
            next_index,
            done: state.done,
            cancelled: state.cancelled,
            error: state.error.clone(),
        }
    }

    pub fn hit_count(&self) -> usize {
        self.state.lock().hits.len()
    }
}

#[derive(Default)]
pub struct SearchManager {
    tasks: RwLock<HashMap<Uuid, Arc<SearchTask>>>,
}

impl SearchManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn create(&self, epoch: Epoch, session_id: SessionId) -> Arc<SearchTask> {
        let task = Arc::new(SearchTask::new(epoch, session_id));
        self.tasks.write().insert(task.id, task.clone());
        task
    }

    pub fn cancel_session(&self, session_id: SessionId) {
        let tasks: Vec<_> = self
            .tasks
            .read()
            .values()
            .filter(|task| task.session_id == session_id)
            .cloned()
            .collect();
        for task in tasks {
            task.cancel();
            self.tasks.write().remove(&task.id);
        }
    }

    pub fn get(&self, id: Uuid) -> Option<Arc<SearchTask>> {
        self.tasks.read().get(&id).cloned()
    }

    pub fn cancel(&self, id: Uuid) -> bool {
        if let Some(task) = self.get(id) {
            task.cancel();
            true
        } else {
            false
        }
    }

    pub fn remove(&self, id: Uuid) -> bool {
        self.tasks.write().remove(&id).is_some()
    }

    /// 关闭会话时取消并移除相关任务（按 epoch 无法区分会话，调用方最好按 session 记录 task）。
    pub fn cancel_all(&self) {
        let tasks: Vec<_> = self.tasks.read().values().cloned().collect();
        for task in tasks {
            task.cancel();
        }
        self.tasks.write().clear();
    }
}
