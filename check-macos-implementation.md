# macOS 文件打开实现检查清单

## 问题分析
当前问题: `get_initial_file()` 返回 `null`
日志显示: 前端调用成功，但后端返回 null

## 检查清单

### 1. ✅ Tauri 配置文件检查
- [x] `tauri.conf.json` 中有 `fileAssociations` 配置
- [x] 支持多种文件扩展名
- [x] 有正确的 `identifier` (虽然以 .app 结尾有警告)

### 2. ✅ Rust 后端代码检查
- [x] 有 `get_initial_file` 命令
- [x] 有命令行参数处理逻辑
- [x] 有 macOS 特定处理

### 3. ✅ 前端代码检查
- [x] 调用 `invoke('get_initial_file')`
- [x] 有错误处理
- [x] 有重试机制

### 4. ❌ macOS 特定问题

#### 可能的问题:
1. **macOS 没有传递参数**
   - 应用可能没有正确注册为文件类型处理器
   - 系统缓存可能需要清理

2. **参数格式不匹配**
   - macOS 可能传递不同的参数格式
   - 需要更好的参数解析

3. **应用启动时序**
   - 文件路径可能在应用初始化之后才可用

## 其他成功应用的研究要点

### 已知的 Tauri 应用模式:
1. **使用环境变量** - 一些应用通过环境变量传递文件路径
2. **使用 IPC 消息** - 应用启动后通过消息传递文件路径
3. **使用文件系统监听** - 监听特定目录或文件

### macOS 特定的解决方案:
1. **NSUserDefaults** - 通过 macOS 的用户默认系统传递数据
2. **Apple Events** - 使用 macOS 事件系统
3. **URL Scheme 处理** - 处理 file:// URL

## 需要检查的关键代码

### 1. Rust 参数处理改进
```rust
// 当前实现可能的问题:
// - 只检查了部分文件扩展名
// - 没有处理所有可能的参数格式
// - macOS 特定处理可能不完整

// 改进建议:
// 1. 打印所有环境变量
println!("Environment variables: {:?}", std::env::vars().collect::<Vec<_>>());

// 2. 检查进程信息
#[cfg(target_os = "macos")]
{
    // macOS 特定的参数检查
}
```

### 2. macOS 文件关联验证
```bash
# 检查应用是否注册
defaults read com.apple.LaunchServices/com.apple.launchservices.secure

# 检查 Info.plist
plutil -p /Applications/MarkEdit.app/Contents/Info.plist

# 重新注册
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f /Applications/MarkEdit.app
```

### 3. 替代的文件传递方法
```javascript
// 如果命令行参数失败，尝试其他方法
// 1. 检查 shared memory
// 2. 检查临时文件
// 3. 使用 URL scheme
```

## 具体实现建议

### 方案1: 改进 Rust 参数解析
- 添加更详细的调试日志
- 处理所有可能的参数格式
- 添加 macOS 特定检查

### 方案2: 使用替代的文件传递
- 通过环境变量传递
- 通过临时文件传递
- 通过 IPC 消息传递

### 方案3: 延迟文件打开
- 应用启动后等待文件路径
- 使用文件系统监听
- 实现重试机制

## 测试计划

### 1. 本地测试
```bash
# 直接运行应用
./MarkEdit.app/Contents/MacOS/markedit-tauri /path/to/file.md

# 查看日志
RUST_LOG=debug ./MarkEdit.app/Contents/MacOS/markedit-tauri /path/to/file.md
```

### 2. 系统集成测试
```bash
# 使用 open 命令
open -a MarkEdit /path/to/file.md

# 检查系统日志
log show --predicate 'subsystem contains "MarkEdit"'
```

### 3. 文件关联测试
```bash
# 手动触发文件关联
xdg-open /path/to/file.md  # Linux
open /path/to/file.md     # macOS
```

## 参考资料
1. Tauri 官方文档: https://tauri.app/v1/guides/features/file-associations/
2. macOS 文件关联: https://developer.apple.com/documentation/bundleresources/information_property_list/cfbundledocumenttypes
3. 类似应用实现: 需要查找成功的 Tauri 应用案例

## 下一步
1. 查找类似应用的实现代码
2. 实现改进的参数处理
3. 测试不同的文件传递方法
4. 验证 macOS 文件关联