# 贡献指南

感谢你考虑为 MarkEdit 做贡献！

## 开发环境

### 前提条件

- Node.js 18+
- Rust (https://rustup.rs)
- Windows 10/11 (用于 Windows 构建)

### 安装

```bash
# 克隆仓库
git clone https://github.com/wy7980/markx.git
cd markx

# 安装依赖
npm install
```

### 开发

```bash
# 启动开发服务器
npm run tauri:dev
```

### 测试

```bash
# 运行单元测试
npm run test

# 运行 E2E 测试
npm run test:e2e

# 运行测试覆盖率
npm run test:coverage
```

### 构建

```bash
# 构建生产版本
npm run tauri:build
```

## 提交规范

使用 Conventional Commits 格式：

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `test:` 测试相关
- `refactor:` 重构
- `style:` 代码格式
- `chore:` 构建/工具

示例：
```
feat: 添加导出 PDF 功能
fix: 修复暗色主题下大纲显示问题
docs: 更新安装文档
```

## 代码风格

- JavaScript: 使用 ES6+ 语法
- CSS: 使用 CSS Variables 管理主题
- 提交前确保测试通过

## 问题反馈

发现 bug 或有新功能建议？请在 [Issues](https://github.com/wy7980/markx/issues) 中提交。
