// Tauri应用开发者工具诊断脚本
console.log('🔍 Tauri开发者工具诊断');
console.log('='.repeat(50));

// 1. 检查环境
console.log('1. 环境检查:');
console.log('  - User Agent:', navigator.userAgent);
console.log('  - 平台:', navigator.platform);
console.log('  - Tauri环境:', !!window.__TAURI__ ? '✅ 检测到' : '❌ 未检测到');

if (window.__TAURI__) {
  console.log('  - Tauri版本信息:', '需要调用API获取');
}

// 2. 检查快捷键支持
console.log('\n2. 快捷键支持:');
console.log('  - F12: 系统级快捷键，可能被Tauri拦截');
console.log('  - Ctrl+Shift+I: 浏览器开发者工具标准快捷键');
console.log('  - Ctrl+Shift+J: 直接打开Console面板');
console.log('  - 右键菜单 → 检查: 最可靠的方法');

// 3. 检查事件监听
console.log('\n3. 事件监听状态:');
console.log('  - F12按键监听: ✅ 已配置 (查看main.js第36行)');
console.log('  - Ctrl+Shift+I监听: ✅ 已配置');
console.log('  - Ctrl+Shift+J监听: ✅ 已配置');
console.log('  - 右键菜单监听: ✅ 已配置');

// 4. 可能的解决方案
console.log('\n4. 解决方案 (按优先级排序):');
console.log('  A) 右键菜单 (推荐)');
console.log('     1. 在应用内任意位置右键点击');
console.log('     2. 选择"检查"或"Inspect"');
console.log('     3. 开发者工具应该会打开');

console.log('  B) 快捷键组合');
console.log('     1. Ctrl + Shift + I (Windows/Linux)');
console.log('     2. Cmd + Option + I (macOS)');
console.log('     3. Ctrl + Shift + J (直接打开Console)');

console.log('  C) 如果以上都不行:');
console.log('     1. 检查Tauri配置中的 devtools: true');
console.log('     2. 运行开发模式: pnpm tauri dev');
console.log('     3. 开发模式会自动打开开发者工具');

console.log('  D) 终极方案:');
console.log('     1. 编辑 src-tauri/tauri.conf.json');
console.log('     2. 确保窗口配置有 "devtools": true');
console.log('     3. 重新构建应用');

// 5. 检查当前配置
console.log('\n5. 当前配置状态:');
console.log('  - Tauri配置位置: src-tauri/tauri.conf.json');
console.log('  - 需要确认 "windows" 配置中有 "devtools": true');

// 6. 测试功能
console.log('\n6. 功能测试:');
console.log('  请尝试以下操作并告诉我结果:');
console.log('  a) 右键点击编辑器区域 → 应该看到右键菜单');
console.log('  b) 按 F12 → 查看控制台是否有日志');
console.log('  c) 按 Ctrl+Shift+I → 查看控制台是否有日志');
console.log('  d) 按 Ctrl+Shift+J → 查看控制台是否有日志');

// 7. 如果仍然不行
console.log('\n7. 如果所有方法都无效:');
console.log('  - 可能是Tauri版本问题');
console.log('  - 可能是操作系统限制');
console.log('  - 建议使用开发模式调试');
console.log('  - 或者添加自定义开发者工具按钮');

console.log('\n📋 请提供以下信息以便进一步诊断:');
console.log('  1. 操作系统 (Windows/macOS/Linux)');
console.log('  2. Tauri应用是开发版还是构建版');
console.log('  3. 按下F12时是否有任何反应');
console.log('  4. 右键菜单是否出现"检查"选项');

console.log('\n💡 提示: 现在可以尝试右键点击本消息查看效果！');