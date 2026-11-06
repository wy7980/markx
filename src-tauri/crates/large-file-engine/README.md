# large-file-engine

GB 级文本/日志文件的只读 Rust 引擎。不依赖 Tauri，也不依赖任何前端框架。

## 能力

- 基于已打开 fd 的 `read_at` 读取（日志默认）；
- 可选的 `mmap` 读取（仅静态文件）；
- 分段稀疏索引，支持后台构建、部分索引；
- 按行视口读取，UTF-8 / ASCII，超长行截断；打开前检测 UTF-16/非法 UTF-8/二进制；
- 按字节 offset 跳转到所在行（`jump_to_offset`）；
- 行导向字面量/正则搜索，支持取消与结果分页；
- inode/file-id + 指纹的轮转、截断、copytruncate 检测；
- 后台监听：append 增量更新稀疏索引，truncate/rotate/removed 发事件；
- 分片 LRU 块缓存。

## 本机参考数据（Windows / release）

1GB 日志（约 1278 万行）：

- 打开并显示尾部 200 行：约 11ms
- 后台稀疏索引完成：约 744ms
- 第 1 行视口（200 行）：约 0.37ms
- 跳转第 500 万行：约 0.31ms
- 全文件字面量搜索（无命中）：约 3.0s

具体数值随硬件/磁盘变化，仅作为量级参考。

## 不在首版范围

- GB 文件编辑/保存；
- UTF-16 等非 ASCII 兼容编码的大文件；
- 跨行正则；
- 索引持久化；
- 倒排/trigram 索引。

## 最小用法

```rust
use large_file_engine::{EngineConfig, LargeFileEngine};

let engine = LargeFileEngine::new(EngineConfig::default());
let opened = engine.open(std::path::Path::new("/var/log/messages"))?;
if let Some(session_id) = opened.session_id {
    let viewport = engine.viewport(session_id, 1, 200)?;
    // ...
    engine.close(session_id);
}
```

Tauri 命令见 `src/commands/large_file.rs`。
