# 文件关联功能说明

## 功能概述

此功能允许用户在macOS和Windows系统上通过以下方式使用MarkEdit：
1. **右键菜单打开** - 在文件资源管理器/访达中右键点击Markdown文件，选择"用MarkEdit打开"
2. **命令行打开** - 通过命令行参数直接打开文件：`markedit file.md`
3. **双击打开** - 双击Markdown文件时自动使用MarkEdit打开（如果设为默认程序）

## 支持的文件类型

- `.md` - Markdown文档
- `.markdown` - Markdown文档
- `.txt` - 纯文本文档

## 技术实现

### 1. Tauri配置 (`src-tauri/tauri.conf.json`)
添加了`fileAssociations`配置，声明应用支持的文件类型：
```json
"fileAssociations": [
  {
    "ext": "md",
    "name": "Markdown Document",
    "description": "MarkEdit Markdown Document",
    "role": "Editor",
    "mimeType": "text/markdown"
  }
]
```

### 2. Rust处理 (`src-tauri/src/main.rs`)
- 添加了命令行参数解析
- 使用全局状态存储初始文件路径
- 提供了`get_initial_file`命令供前端调用

### 3. JavaScript处理 (`src/main.js`)
- 添加了`handleInitialFile()`函数
- 在应用初始化后检查是否有通过命令行打开的文件
- 自动加载文件内容到编辑器

## 平台差异

### macOS
- 通过`Info.plist`中的`CFBundleDocumentTypes`注册
- 系统通过Launch Services管理文件关联
- 应用需要签名才能在正式系统中正常注册

### Windows
- 通过注册表注册文件关联
- 在`HKEY_CLASSES_ROOT\.md`下添加关联
- 安装包（MSI/NSIS）负责注册表修改

### Linux
- 通过`.desktop`文件和MIME类型注册
- 通常需要用户手动设置

## 使用方法

### 通过命令行打开文件
```bash
# 在构建后，可以直接运行
./src-tauri/target/debug/markedit file.md

# 或者使用cargo直接运行
cd src-tauri && cargo run -- file.md
```

### 设为默认打开程序
#### macOS
1. 选择一个Markdown文件
2. 右键点击 → "显示简介"
3. 在"打开方式"中选择"MarkEdit"
4. 点击"全部更改..."

#### Windows
1. 选择一个Markdown文件
2. 右键点击 → "属性"
3. 在"常规"标签页点击"更改..."
4. 选择"MarkEdit"

## 开发测试

### 1. 构建应用
```bash
pnpm tauri:dev
```

### 2. 测试命令行参数
```bash
# 在另一个终端中
./src-tauri/target/debug/markedit test.md
```

### 3. 自动测试
运行测试脚本：
```bash
node test-file-association.js
```

## 注意事项

1. **应用签名** - macOS上需要应用签名才能在系统级别注册文件关联
2. **权限** - Windows可能需要管理员权限修改注册表
3. **多实例处理** - 当应用已经运行时，新实例应该将文件路径发送给已有实例
4. **安装包** - 文件关联应该在安装包中配置，而不是应用运行时

## 未来改进

1. **单实例应用** - 确保只有一个应用实例运行
2. **用户设置** - 提供界面让用户管理文件关联
3. **更多文件类型** - 支持更多文本格式（如`.json`, `.xml`, `.yaml`等）
4. **拖放支持** - 支持将文件拖放到应用窗口中打开