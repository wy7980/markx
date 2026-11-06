# MarkEdit - 轻量级 Markdown 编辑器

基于 Tauri + Vditor 的桌面 Markdown 编辑器。

## 特性

- ⚡ **极轻量** - 打包体积仅 3-5MB
- 🚀 **启动飞快** - 基于系统 WebView
- ✍️ **即时渲染** - 类 Typora 的编辑体验（即时渲染 / 分屏预览）
- 🗂️ **多标签页** - 同时打开多个文档，保留各自内容与未保存状态
- 🔎 **快速打开** - Ctrl/Cmd+P 搜索标签页和当前目录文件，键盘即可切换
- 📍 **实时状态栏** - 光标行列、语言、换行符随编辑即时更新
- 🪟 **原生外观** - Windows 自绘标题栏与窗口控制，macOS 保留系统交通灯
- 🧩 **代码 / 纯文本** - 使用纯文本引擎 + 语法高亮，缩进与内容原样保存
- 🌓 **主题切换** - 亮色/暗色模式
- 📑 **大纲导航** - 快速跳转标题
- 💾 **自动保存** - 本地持久化

## 技术栈

- **Tauri** - Rust 后端，系统 WebView
- **Vditor** - Markdown 编辑器内核（即时渲染 / 分屏预览）
- **CodeMirror 6** - 代码 / 纯文本 / 大文件编辑器（纯文本 + 语法高亮）
- **Vite** - 前端构建工具

## 开发

### 前提条件

1. 安装 Rust: https://rustup.rs
2. 安装 Node.js: https://nodejs.org

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run tauri:dev
```

### 构建

```bash
npm run tauri:build
```

构建产物位于 `src-tauri/target/release/bundle/`。

## 编辑模式

| 模式 | 说明 |
|------|------|
| **即时渲染** | 默认模式，类 Typora；语法符号默认隐藏，光标进入时展开 |
| **分屏预览** | 左侧源码，右侧预览（仅 Markdown） |

> 原「所见即所得」（WYSIWYG）模式已移除：它以渲染后的 HTML 作为编辑对象，回写 Markdown 时容易丢失或改写格式，且与本项目“编辑本地 .md 文件”的定位不符。

### 非 Markdown 文件

`.py` / `.js` / `.json` / `.yaml` / `.sql` 等文本与代码文件不再经过 Vditor，而是使用 CodeMirror 6 的纯文本编辑器：

- 文本按原样保留（包括空格缩进、Tab、行尾空格），保存不会改写内容；
- 按扩展名提供语法高亮（JS/TS、JSON、HTML、CSS、Python、Shell、SQL、YAML、TOML、Dockerfile、PowerShell、Java/C/C++/C#、XML 等）；
- 不解析 Markdown，因此不会有标题字号、列表标记、front matter 之类的影响。

## 快捷键

- `Ctrl+S` - 保存
- `Ctrl+B` - 粗体
- `Ctrl+I` - 斜体
- `Ctrl+D` - 删除线

## 项目结构

```
markedit-tauri/
├── src/                 # 前端代码
│   ├── index.html
│   ├── main.js
│   └── style.css
├── src-tauri/           # Rust 后端
│   ├── src/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tests/               # 测试文件
│   ├── unit/            # 单元测试
│   ├── component/       # 组件测试
│   └── e2e/             # E2E 测试
├── package.json
└── vite.config.js
```

## 测试

### 测试框架

| 类型 | 框架 | 说明 |
|------|------|------|
| **单元测试** | Vitest | 测试独立模块和函数 |
| **组件测试** | Vitest + Testing Library | 测试 UI 组件 |
| **E2E 测试** | Playwright | 端到端测试 |

### 运行测试

```bash
# 安装依赖
npm install

# 运行单元测试
npm run test

# 运行单元测试（监视模式）
npm run test:ui

# 运行测试覆盖率
npm run test:coverage

# 运行 E2E 测试
npm run test:e2e

# 运行 E2E 测试（UI 模式）
npm run test:e2e:ui

# 运行所有测试
npm run test:all
```

### 测试覆盖

- ✅ **文件管理模块**
  - 创建/更新/删除文件
  - 文件切换
  - 持久化存储

- ✅ **大纲解析模块**
  - 标题提取
  - 层级树构建
  - 统计计算

- ✅ **主题管理模块**
  - 主题切换
  - 持久化
  - 事件通知

- ✅ **UI 组件**
  - 侧边栏
  - 工具栏
  - 大纲面板
  - 状态栏

- ✅ **E2E 场景**
  - 应用启动
  - 编辑器输入
  - 格式化功能
  - 主题切换
  - 文件操作

### 测试覆盖率报告

```bash
npm run test:coverage
```

报告生成在 `coverage/` 目录。

## 大文件引擎（Rust 后端）

`src-tauri/crates/large-file-engine` 是面向 GB 级日志/文本的只读引擎，不依赖 Tauri 与前端框架：

- 日志默认基于 fd 的 `read_at`，静态文件可选用 mmap；
- 分段稀疏索引 + 后台构建，支持部分索引；
- 按行视口读取，UTF-8/ASCII，超长行截断；
- 字面量/正则搜索，支持取消与结果分页；
- inode/file-id + 指纹的 append / truncate / copytruncate / rename 检测；
- Tauri 命令：`large_file_open`、`large_file_viewport`、`large_file_search`、`large_file_jump_to_offset` 等（见 `src-tauri/src/commands/large_file.rs`）。
- 打开前编码/二进制检测；`size()` 失败时用 `large_file_probe` 判定模式，避免未知大小全量读取。
- watch 注册失败时降级为 `large_file_poll` 轮询；查看器支持 Find Next/Prev 与精确命中高亮。

当前阶段已完成 Rust 引擎、Tauri 命令、前端只读日志查看器、Tauri Channel 文件监听（append 增量索引、truncate/rotate 提示重新加载）以及搜索结果 Channel 流式推送；后续可补索引持久化和真实桌面端验收。

## License

MIT
