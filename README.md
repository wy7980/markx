# MarkEdit - 轻量级 Markdown 编辑器

基于 Tauri + Vditor 的桌面 Markdown 编辑器。

## 特性

- ⚡ **极轻量** - 打包体积仅 3-5MB
- 🚀 **启动飞快** - 基于系统 WebView
- ✍️ **所见即所得** - 三种编辑模式
- 🌓 **主题切换** - 亮色/暗色模式
- 📑 **大纲导航** - 快速跳转标题
- 💾 **自动保存** - 本地持久化

## 技术栈

- **Tauri** - Rust 后端，系统 WebView
- **Vditor** - 所见即所得 Markdown 编辑器
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
| **所见即所得** | 类 Word，实时渲染 |
| **即时渲染** | 类 Typora，输入即渲染 |
| **分屏预览** | 左侧编辑，右侧预览 |

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

## License

MIT
