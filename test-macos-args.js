// 测试 macOS 命令行参数传递
console.log('🔍 测试 macOS 命令行参数传递\n');

// 模拟不同的 macOS 参数传递场景
const testScenarios = [
  {
    name: '场景1: 直接文件路径',
    args: ['/Users/test/Documents/example.md'],
    description: 'macOS Finder 有时会传递绝对路径'
  },
  {
    name: '场景2: file:// URL',
    args: ['file:///Users/test/Documents/example.md'],
    description: 'macOS 通常传递 file:// URL'
  },
  {
    name: '场景3: URL编码空格',
    args: ['file:///Users/test/My%20Documents/example.md'],
    description: '包含空格的文件路径会被 URL 编码'
  },
  {
    name: '场景4: 带 -psn 参数',
    args: ['-psn_0_123456', '/Users/test/Documents/example.md'],
    description: 'macOS 会添加进程序列号参数'
  },
  {
    name: '场景5: 相对路径',
    args: ['example.md'],
    description: '有时会传递相对路径'
  },
  {
    name: '场景6: 多文件',
    args: ['/path/to/file1.md', '/path/to/file2.js'],
    description: '同时打开多个文件'
  },
  {
    name: '场景7: 中文文件名',
    args: ['file:///Users/test/文档/测试文件.md'],
    description: '包含中文字符的文件名'
  }
];

console.log('📋 测试场景:');
testScenarios.forEach((scenario, index) => {
  console.log(`\n${index + 1}. ${scenario.name}`);
  console.log(`   参数: ${JSON.stringify(scenario.args)}`);
  console.log(`   描述: ${scenario.description}`);
  
  // 模拟 Rust 的 is_supported_file 函数
  const isSupported = (path) => {
    const lowercase = path.toLowerCase();
    const supported = [
      '.md', '.markdown', '.txt', '.js', '.py', '.json', 
      '.html', '.css', '.yaml', '.yml'
    ];
    return supported.some(ext => lowercase.endsWith(ext)) ||
           path.endsWith('Dockerfile') || 
           path.endsWith('Makefile');
  };
  
  // 分析每个参数
  scenario.args.forEach((arg, i) => {
    console.log(`   参数[${i}]: "${arg}"`);
    console.log(`     长度: ${arg.length}`);
    console.log(`     是否以 - 开头: ${arg.startsWith('-')}`);
    console.log(`     是否以 file:// 开头: ${arg.startsWith('file://')}`);
    console.log(`     是否包含路径分隔符: ${arg.includes('/') || arg.includes('\\')}`);
    console.log(`     是否支持的文件类型: ${isSupported(arg)}`);
    
    // 如果是 file:// URL，显示转换后
    if (arg.startsWith('file://')) {
      const path = arg.replace('file://', '')
                      .replace(/%20/g, ' ')
                      .replace(/%2F/g, '/');
      console.log(`     file:// 转换后: "${path}"`);
      console.log(`     转换后是否支持: ${isSupported(path)}`);
    }
  });
});

console.log('\n🔧 问题诊断:');
console.log('1. 如果 Rust 后端没有显示文件路径，可能是:');
console.log('   - 系统传递的参数格式未被正确识别');
console.log('   - macOS 启动服务未正确注册文件关联');
console.log('   - 应用打包时文件关联配置丢失');

console.log('\n2. 解决方案:');
console.log('   a) 检查 Rust 后端日志，查看实际传递的参数');
console.log('   b) 重新注册 macOS 文件关联:');
console.log('      lsregister -f /Applications/MarkEdit.app');
console.log('   c) 清除启动服务缓存:');
console.log('      lsregister -kill -r -domain local -domain system -domain user');
console.log('   d) 重启 Finder: killall Finder');

console.log('\n3. 测试方法:');
console.log('   a) 在终端手动测试:');
console.log('      open -a MarkEdit /path/to/test.md');
console.log('   b) 直接运行二进制文件:');
console.log('      ./MarkEdit.app/Contents/MacOS/markedit-tauri /path/to/test.md');
console.log('   c) 查看系统日志:');
console.log('      log show --predicate \'subsystem contains "MarkEdit"\' --last 1h');

console.log('\n🎯 关键检查点:');
console.log('1. Rust 编译是否成功？');
console.log('2. 应用是否包含正确的 Info.plist 文件类型声明？');
console.log('3. macOS 是否将应用注册为文件类型的默认打开方式？');
console.log('4. 系统是否传递了正确的参数给应用？');

console.log('\n💡 建议:');
console.log('1. 在 GitHub Actions 中查看完整的 Rust 编译输出');
console.log('2. 如果可能，在本地 macOS 机器上测试构建');
console.log('3. 检查 tauri.conf.json 中的文件关联配置是否正确');
console.log('4. 确保应用包含正确的 CFBundleDocumentTypes 声明');