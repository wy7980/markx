// 测试Tauri应用中F12功能是否存在的脚本
console.log('🔍 测试Tauri应用中的F12功能...');
console.log('='.repeat(50));

// 1. 检查环境
console.log('1. 环境检查:');
console.log('  - User Agent:', navigator.userAgent);
console.log('  - 平台:', navigator.platform);
console.log('  - Tauri环境检测:');
console.log('    * window.__TAURI__:', !!window.__TAURI__);
console.log('    * window.__TAURI_INTERNALS__:', !!window.__TAURI_INTERNALS__);
console.log('    * window.__TAURI_METADATA__:', !!window.__TAURI_METADATA__);

// 2. 检查F12按键监听
console.log('\n2. F12按键监听测试:');
console.log('  - F12按键监听已配置在main.js第38行');
console.log('  - 监听器会打印日志但不会实际打开开发者工具');

// 3. Tauri中打开开发者工具的方法
console.log('\n3. Tauri中打开开发者工具的方法:');

// 检查是否有打开开发者工具的API
if (window.__TAURI__) {
  console.log('  ✅ 检测到Tauri环境');
  
  // 检查Tauri版本
  if (window.__TAURI_INTERNALS__) {
    console.log('  ℹ️ 可能是Tauri 2.0+');
  } else {
    console.log('  ℹ️ 可能是Tauri 1.x');
  }
  
  // 检查是否有打开开发者工具的API
  console.log('  🔍 检查可用的API:');
  const tauriApis = Object.keys(window.__TAURI__ || {});
  console.log('    - 可用API:', tauriApis.join(', '));
  
  // 检查是否有webview相关的API
  if (window.__TAURI__.webview) {
    console.log('    ✅ 有webview API');
  }
  
  if (window.__TAURI__.window) {
    console.log('    ✅ 有window API');
  }
} else {
  console.log('  ❌ 未检测到Tauri环境，可能是Web版本');
}

// 4. 实际测试F12按键
console.log('\n4. 实际测试F12按键:');
console.log('  请按F12键，然后查看:');
console.log('  a) 控制台是否显示"🔧 按下 F12，尝试打开开发者工具..."');
console.log('  b) 开发者工具是否真的打开');

// 5. 其他打开开发者工具的方法
console.log('\n5. 其他打开开发者工具的方法:');
console.log('  A) 右键菜单 → 检查 (最可靠)');
console.log('  B) Ctrl+Shift+I (Windows/Linux)');
console.log('  C) Cmd+Option+I (macOS)');
console.log('  D) 在Tauri开发模式下运行: pnpm tauri dev');

// 6. 如果F12不工作
console.log('\n6. 如果F12不工作:');
console.log('  - Tauri可能拦截了F12键');
console.log('  - 需要配置Tauri允许开发者工具');
console.log('  - 或者使用其他方法打开');

// 7. 测试右键菜单
console.log('\n7. 测试右键菜单:');
console.log('  请在编辑器区域右键点击，查看:');
console.log('  a) 是否出现右键菜单');
console.log('  b) 菜单中是否有"检查"或"Inspect"选项');
console.log('  c) 控制台是否显示提示信息');

// 8. 添加事件监听器进行测试
console.log('\n8. 添加测试事件监听器:');
document.addEventListener('keydown', (e) => {
  if (e.key === 'F12') {
    console.log('🎯 F12键被按下 (测试脚本检测到)');
    console.log('  - Ctrl键:', e.ctrlKey);
    console.log('  - Shift键:', e.shiftKey);
    console.log('  - Alt键:', e.altKey);
    console.log('  - Meta键:', e.metaKey);
  }
  
  if (e.ctrlKey && e.shiftKey && e.key === 'I') {
    console.log('🎯 Ctrl+Shift+I被按下 (测试脚本检测到)');
  }
});

console.log('\n📋 测试步骤:');
console.log('1. 按F12键 → 查看控制台和开发者工具');
console.log('2. 按Ctrl+Shift+I → 查看控制台和开发者工具');
console.log('3. 右键点击编辑器 → 查看菜单选项');
console.log('4. 报告你观察到的现象');

console.log('\n💡 提示: 如果F12不打开开发者工具，可以尝试:');
console.log('  - 在Tauri配置中添加开发者工具支持');
console.log('  - 使用右键菜单"检查"');
console.log('  - 运行开发模式: pnpm tauri dev');