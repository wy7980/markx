// 诊断GitHub构建应用问题的脚本
const fs = require('fs');
const path = require('path');

console.log('🔍 诊断GitHub构建应用问题...\n');

// 检查项目结构
console.log('📁 项目结构检查:');
const checkPaths = [
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/src/main.rs',
  'dist/index.html',
  'dist/assets/',
  '.github/workflows/ci.yml'
];

checkPaths.forEach(p => {
  const exists = fs.existsSync(p);
  console.log(`  ${exists ? '✅' : '❌'} ${p}`);
});

console.log('\n🔧 Tauri配置检查:');
const tauriConfig = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));

console.log('  - 应用标识符:', tauriConfig.package?.identifier || '未设置');
console.log('  - 构建目标:', tauriConfig.tauri?.bundle?.targets?.join(', ') || '未设置');
console.log('  - 前端构建路径:', tauriConfig.build?.distDir || '未设置');

console.log('\n📊 前端构建检查:');
if (fs.existsSync('dist/index.html')) {
  const indexHtml = fs.readFileSync('dist/index.html', 'utf8');
  const hasVditor = indexHtml.includes('vditor');
  const hasMainJs = indexHtml.includes('main.js');
  
  console.log(`  ${hasVditor ? '✅' : '❌'} 包含Vditor引用`);
  console.log(`  ${hasMainJs ? '✅' : '❌'} 包含main.js引用`);
  
  // 检查main.js是否包含必要的模块
  if (fs.existsSync('dist/main.js')) {
    const mainJs = fs.readFileSync('dist/main.js', 'utf8');
    const hasInitVditor = mainJs.includes('Vditor');
    const hasEventListeners = mainJs.includes('addEventListener');
    
    console.log(`  ${hasInitVditor ? '✅' : '❌'} 包含Vditor初始化`);
    console.log(`  ${hasEventListeners ? '✅' : '❌'} 包含事件监听器`);
  }
}

console.log('\n🎯 常见问题诊断:');
console.log('1. ❌ 按钮点击无反应的可能原因:');
console.log('   - 前端资源加载失败');
console.log('   - JavaScript执行错误');
console.log('   - 事件监听器未正确绑定');
console.log('   - 构建后的路径配置错误');

console.log('\n2. 🔧 解决方案:');
console.log('   a) 检查控制台错误 (F12 → Console)');
console.log('   b) 检查网络请求 (F12 → Network)');
console.log('   c) 检查前端资源是否正确加载');
console.log('   d) 确保Tauri应用正确打包前端资源');

console.log('\n3. 📝 检查步骤:');
console.log('   - 运行构建的应用');
console.log('   - 打开开发者工具 (F12)');
console.log('   - 查看Console标签页的错误');
console.log('   - 查看Network标签页的资源加载');

console.log('\n4. 🛠️ 修复建议:');
console.log('   a) 更新Tauri配置中的dist路径');
console.log('   b) 确保前端资源被正确复制到构建目录');
console.log('   c) 检查JavaScript是否被正确打包');
console.log('   d) 验证事件监听器是否正确绑定');

// 检查main.js中的事件监听器
console.log('\n🔍 检查main.js中的事件监听器:');
if (fs.existsSync('src/main.js')) {
  const mainSrc = fs.readFileSync('src/main.js', 'utf8');
  
  const events = [
    { name: '新建按钮', pattern: /btnNew.*addEventListener/ },
    { name: '保存按钮', pattern: /btnSave.*addEventListener/ },
    { name: '打开按钮', pattern: /btnOpen.*addEventListener/ },
    { name: '文档加载', pattern: /DOMContentLoaded/ },
    { name: 'Vditor初始化', pattern: /new Vditor/ }
  ];
  
  events.forEach(event => {
    const found = event.pattern.test(mainSrc);
    console.log(`  ${found ? '✅' : '❌'} ${event.name}`);
  });
}

console.log('\n💡 建议操作:');
console.log('1. 在本地运行 `pnpm run tauri:dev` 测试开发模式');
console.log('2. 检查GitHub Actions构建日志中的错误');
console.log('3. 确保CI中正确构建了前端资源');
console.log('4. 验证构建产物中的前端资源完整性');

console.log('\n📋 如果控制台有错误，请提供错误信息以便进一步诊断。');