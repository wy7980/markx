use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::{Mutex, RwLock};

use crate::cache::BlockCache;
use crate::index::IndexStore;
use crate::reader::FileReader;
use crate::types::{Epoch, SessionId};
use crate::watch::FileState;

pub struct LargeFileSession {
    pub id: SessionId,
    pub path: PathBuf,
    pub epoch: Epoch,
    pub reader: Arc<dyn FileReader>,
    pub index: Arc<IndexStore>,
    pub cache: Arc<BlockCache>,
    pub state: RwLock<FileState>,
    pub poll_lock: Mutex<()>,
}

impl LargeFileSession {
    pub fn size(&self) -> u64 {
        self.reader.size()
    }
}
