use std::num::NonZeroUsize;
use std::sync::Arc;

use lru::LruCache;
use parking_lot::Mutex;

use crate::error::Result;
use crate::reader::FileReader;

const SHARDS: usize = 16;

/// read_at 的块缓存。按块号分片，避免全局锁竞争。
pub struct BlockCache {
    block_size: usize,
    shards: Vec<Mutex<LruCache<u64, Arc<Vec<u8>>>>>,
}

impl BlockCache {
    pub fn new(block_size: usize, capacity_bytes: u64) -> Self {
        let block_size = block_size.max(4096);
        let blocks = (capacity_bytes / block_size as u64).max(SHARDS as u64) as usize;
        let per_shard = NonZeroUsize::new((blocks / SHARDS).max(1)).unwrap();
        let shards = (0..SHARDS)
            .map(|_| Mutex::new(LruCache::new(per_shard)))
            .collect();
        Self { block_size, shards }
    }

    pub fn block_size(&self) -> usize {
        self.block_size
    }

    fn shard(&self, block_index: u64) -> &Mutex<LruCache<u64, Arc<Vec<u8>>>> {
        &self.shards[(block_index as usize) % SHARDS]
    }

    pub fn get(&self, block_index: u64) -> Option<Arc<Vec<u8>>> {
        self.shard(block_index).lock().get(&block_index).cloned()
    }

    pub fn put(&self, block_index: u64, block: Arc<Vec<u8>>) {
        self.shard(block_index).lock().put(block_index, block);
    }

    pub fn clear(&self) {
        for shard in &self.shards {
            shard.lock().clear();
        }
    }

    /// 读取包含 offset 的整块；块尾按文件大小截断。
    pub fn read_block(&self, reader: &dyn FileReader, block_index: u64) -> Result<Arc<Vec<u8>>> {
        if let Some(block) = self.get(block_index) {
            return Ok(block);
        }

        let start = block_index.saturating_mul(self.block_size as u64);
        if start >= reader.size() {
            return Ok(Arc::new(Vec::new()));
        }
        let len = ((reader.size() - start) as usize).min(self.block_size);
        let mut buffer = vec![0u8; len];
        reader.read_exact_at(start, &mut buffer)?;
        let block = Arc::new(buffer);
        self.put(block_index, block.clone());
        Ok(block)
    }
}
