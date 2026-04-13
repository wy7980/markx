# macOS 右键菜单文件打开问题诊断

## 问题现象
- 右键点击文件 → 选择"用 MarkEdit 打开"
- 应用启动，但文件没有在窗口中打开
- 控制台日志显示 `initialFile: null`

## 可能的原因

### 1. 命令行参数传递问题
在 macOS 上，当通过右键菜单打开文件时，系统可能使用不同的参数格式：

**常见情况：**
1. **单文件打开**：`/path/to/file.md`
2. **多文件打开**：多个路径参数
3. **file:// URL 格式**：`file:///path/to/file.md`
4. **带空格的文件名**：`file:///path/to/my%20file.md`
5. **特殊参数**：`-psn_0_123456` (进程序列号)

### 2. Tauri 配置问题
- `tauri.conf.json` 中的文件关联配置可能不完整
- 需要在 `build` 配置中添加文件关联支持

### 3. Rust 后端处理问题
当前的 `is_supported_file` 函数可能在处理某些路径格式时有问题

### 4. 前端时序问题
文件路径可能在应用初始化完成之前就被处理（或丢弃）了

## 解决方案

### 方案1: 修改 Rust 后端，添加更多调试信息
在 Rust 代码中添加更详细的日志，显示系统实际传递的参数

### 方案2: 改进文件关联配置
确保 Tauri 配置文件正确声明了所有支持的文件类型

### 方案3: 修改前端代码，添加重试机制
如果初始文件为null，添加逻辑来尝试从其他来源获取文件路径

### 方案4: 检查 macOS 启动服务注册
确保应用正确注册到 macOS 的启动服务数据库

## 测试步骤
1. **直接命令行测试**
   ```bash
   /path/to/MarkEdit.app/Contents/MacOS/markedit-tauri /path/to/test.md
   ```

2. **查看 Rust 日志输出**
   ```bash
   # 在终端中运行应用，查看详细日志
   ```

3. **检查系统日志**
   ```bash
   log show --predicate 'subsystem contains "MarkEdit"' --last 1h
   ```

4. **手动注册文件关联**
   ```bash
   /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f /path/to/MarkEdit.app
   ```

## 关键问题
1. **参数格式**: macOS 可能传递 file:// URL 而不是直接路径
2. **编码问题**: 空格和特殊字符可能被URL编码
3. **时序问题**: 应用可能在文件路径可用之前就已经初始化完成

## 修复优先级
1. ✅ **添加详细日志** (已完成)
2. 🔄 **改进Rust参数解析** (进行中)
3. ⏳ **优化前端错误处理**
4. 🕐 **检查启动时序**

---

**下一步**: 修改 Rust 后端，添加更详细的分析和日志，特别是处理 macOS 特定的参数格式。