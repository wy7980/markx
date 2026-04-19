## macOS Finder 右键打开文件问题分析

### 问题现象
1. 命令行打开文件：`/Applications/MarkEdit.app ./file.md` - 报错 `permission denied`
2. Finder 右键用 MarkEdit 打开 - 编辑器内没有显示文件

### 原因分析

#### 问题 1：命令行 `permission denied`
这是因为 macOS 的安全机制。解决方法：
```bash
xattr -cr /Applications/MarkEdit.app
```

或者重新签名应用：
```bash
codesign --force --deep -s - /Applications/MarkEdit.app
```

#### 问题 2：Finder 右键打开后文件未显示
这是因为 **Tauri v2 目前不支持 macOS 的 `NSAppleEventManager` `open-file` Apple Event**。

当应用**未运行**时：
- macOS 启动应用，文件路径通过命令行参数传递
- 当前代码可以处理这种情况

当应用**已运行**时：
- macOS 发送 `open-file` Apple Event 到现有实例
- **Tauri v2 没有暴露这个事件给 Rust 代码**
- 文件路径无法传递到应用

GitHub Issue: https://github.com/tauri-apps/tauri/issues/13615

### 当前配置状态

#### Info.plist 配置（正确）
- `CFBundleDocumentTypes` - 已配置
- `LSHandlerRank = Alternate` - 已配置
- `NSAppleEventsUsageDescription` - 已配置
- `UTImportedTypeDeclarations` - 已配置

#### entitlements.xml 配置（正确）
- `com.apple.security.files.user-selected.read-write` - 已配置

#### Rust 代码
- 命令行参数处理 - 已实现
- Apple Event 处理 - **Tauri v2 不支持**

### 解决方案

#### 方案 1：等待 Tauri v2 官方支持
跟踪 GitHub issue #13615

#### 方案 2：使用 tauri-plugin-single-instance
当 Finder 打开文件时，会启动新实例，通过 single-instance 插件将文件路径传递到现有实例。

#### 方案 3：使用自定义 objc2 代码
直接使用 objc2 框架注册 NSAppleEventManager handler。

### 推荐方案

由于这是 Tauri v2 框架的限制，建议：

1. **短期方案**：用户先关闭应用，然后通过 Finder 打开文件（这样文件路径会通过命令行传递）

2. **长期方案**：等待 Tauri v2 官方添加 `on_open_file` 事件支持

### 当前代码已修复的内容

1. ✅ Info.plist 配置正确
2. ✅ entitlements.xml 配置正确
3. ✅ 命令行参数处理正确
4. ❌ Apple Event 处理 - Tauri v2 不支持

### 测试方法

```bash
# 清除权限限制
xattr -cr /Applications/MarkEdit.app

# 确保应用未运行
pkill -9 MarkEdit

# 通过命令行打开文件（应该工作）
/Applications/MarkEdit.app/Contents/MacOS/MarkEdit ./test.md
```

如果上面命令工作但 Finder 右键不工作，证实是 Tauri v2 的 Apple Event 支持问题。
