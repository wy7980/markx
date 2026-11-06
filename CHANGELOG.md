# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- UI 第一阶段视觉现代化：新的 Design Tokens、扁平工具栏、侧栏工作区头部/选中态、移除侧栏底部大按钮、状态栏去重
- 多标签页与文档状态模型：每个标签保存内容/脏标记/当前路径，切换不丢失未保存修改，支持新建/关闭/中键关闭
- 快速打开面板（Ctrl/Cmd+P）：统一搜索已打开标签页与当前目录文件，支持键盘上下选择与回车打开
- 状态栏真实文档信息：语言、换行符（LF/CRLF）、光标行列，Markdown 与代码文件均实时更新
- Windows 自绘标题栏：无边框窗口、拖拽移动、双击最大化/还原、八向边缘缩放、最小化/最大化/关闭按钮；macOS 保留原生交通灯
- 标题栏同步当前文档名与未保存标记
- Windows 高 DPI 下自动把初始窗口压缩到任务栏之上的可用工作区
- 新增 `large-file-engine` Rust crate：GB 级文件只读引擎（fd/read_at、稀疏索引、视口、搜索、轮转检测、块缓存）
- Tauri 命令接入：`large_file_open` / `large_file_viewport` / `large_file_search` 等
- 前端只读日志查看器：>20MB 文件自动进入，按比例分段虚拟滚动、行号跳转、搜索面板与结果列表
- 大文件监听：Tauri Channel 推送追加/截断/轮转事件；append 增量更新稀疏索引，轮转/截断提供重新加载入口
- 搜索结果改为 Tauri Channel 流式推送（64 条/250ms 批量），保留分页轮询作为兼容兜底
- 大文件打开前增加编码/二进制检测（UTF-16/非法 UTF-8/含 NUL），不支持时明确报错
- `size()` 失败时改用 Rust `large_file_probe` 判断只读/可编辑，避免盲目全量读取
- watch 注册失败时降级为 `large_file_poll` 轮询，不再丢失追加/轮转提示
- 查看器增加 Find Next/Prev、精确命中高亮（matchLength）、`large_file_jump_to_offset`

### Changed
- 编辑模式收敛为「即时渲染 / 分屏预览」两种，移除「所见即所得」入口（工具栏菜单与 Ctrl/Cmd+Alt+7 均不再生效）
- 分屏预览下，纯文本 / 代码文件只显示源码，不再渲染无意义的 Markdown 预览
- 非 Markdown 文件改用 CodeMirror 6 纯文本编辑器（语法高亮），修复 Vditor 按 Markdown 解析导致缩进丢失、保存改写文件的问题
- 大文件横幅与「用富文本打开」仅对 Markdown 大文件显示；代码文件的 HTML 导出为转义后的 `<pre>`

## [1.0.0] - 2024-04-04

### Added
- 🎉 初始发布
- ✨ Tauri 桌面应用框架
- ✍️ Vditor 所见即所得编辑器
- 📝 三种编辑模式（所见即所得/即时渲染/分屏预览）
- 📂 侧边栏文件管理
- 📑 大纲导航
- 🌓 暗色/亮色主题切换
- 💾 本地自动保存
- ⌨️ 快捷键支持
- 🧪 完整测试套件
  - 单元测试（32 个）
  - 组件测试（13 个）
  - E2E 测试（24 个）

### Features
- **编辑器**
  - Markdown 实时渲染
  - 标题、列表、引用、代码块
  - 粗体、斜体、删除线、链接
  - 表格、图片支持

- **文件管理**
  - 新建/切换/删除文档
  - 自动保存
  - 导出 Markdown

- **用户体验**
  - 响应式布局
  - 主题切换
  - 大纲导航
  - 字数统计
