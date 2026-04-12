// 调试文件打开问题
console.log('🔍 调试文件打开问题\n');

// 模拟 Tauri API 调用
const mockInvoke = async (command, args) => {
  console.log(`📡 调用 Tauri 命令: ${command}`);
  
  switch (command) {
    case 'get_initial_file':
      // 模拟从命令行获取文件
      // 这里模拟不同的文件路径格式
      const testFiles = [
        '/Users/test/documents/example.md',
        'file:///Users/test/documents/example.md',
        'example.md',
        '/Users/test/documents/script.js',
        '/Users/test/documents/config.json',
        'C:\\Users\\test\\documents\\example.md',
        '/Users/test/documents/测试文件.md', // 中文文件名
      ];
      
      // 返回第一个测试文件
      return testFiles[0];
      
    case 'get_current_dir':
      return '/Users/test/current';
      
    default:
      console.log(`⚠️  未知命令: ${command}`);
      return null;
  }
};

// 模拟文件打开流程
async function debugFileOpen() {
  console.log('🧪 开始调试文件打开流程\n');
  
  // 1. 获取初始文件
  console.log('1️⃣ 获取初始文件:');
  try {
    const initialFile = await mockInvoke('get_initial_file');
    console.log(`   ✅ 获取到文件: ${initialFile}`);
    console.log(`   📊 文件类型: ${typeof initialFile}`);
    console.log(`   📊 文件长度: ${initialFile ? initialFile.length : 0}`);
    
    if (!initialFile) {
      console.log('   ❌ 没有获取到文件');
      return;
    }
    
    // 2. 分析文件路径
    console.log('\n2️⃣ 分析文件路径:');
    console.log(`   📂 原始路径: ${initialFile}`);
    console.log(`   🔍 是否包含 file://: ${initialFile.startsWith('file://')}`);
    console.log(`   🔍 是否包含路径分隔符: ${initialFile.includes('/') || initialFile.includes('\\')}`);
    console.log(`   🔍 是否是相对路径: ${!initialFile.includes('/') && !initialFile.includes('\\')}`);
    
    // 3. 检查文件类型支持
    console.log('\n3️⃣ 检查文件类型支持:');
    const fileExt = initialFile.toLowerCase().split('.').pop();
    console.log(`   📄 文件扩展名: ${fileExt}`);
    
    const supportedExts = ['md', 'markdown', 'txt', 'js', 'py', 'json', 'html', 'css', 'yaml', 'yml', 'toml', 'sh'];
    const isSupported = supportedExts.includes(fileExt) || 
                       initialFile.endsWith('Dockerfile') || 
                       initialFile.endsWith('Makefile');
    console.log(`   ✅ 是否支持: ${isSupported}`);
    
    // 4. 模拟路径处理
    console.log('\n4️⃣ 模拟路径处理:');
    
    if (initialFile.startsWith('file://')) {
      console.log('   💡 检测到 file:// URL');
      const filePath = initialFile.replace('file://', '');
      console.log(`   🔄 转换后路径: ${filePath}`);
    }
    
    if (!initialFile.includes('/') && !initialFile.includes('\\')) {
      console.log('   💡 检测到相对路径');
      const currentDir = await mockInvoke('get_current_dir');
      const fullPath = `${currentDir}/${initialFile}`;
      console.log(`   🔄 完整路径: ${fullPath}`);
    }
    
    // 5. 可能的编码问题
    console.log('\n5️⃣ 检查编码问题:');
    if (initialFile.includes('%20')) {
      console.log('   💡 检测到 URL 编码空格');
      const decodedPath = decodeURIComponent(initialFile);
      console.log(`   🔄 解码后路径: ${decodedPath}`);
    }
    
    // 6. 检查路径分隔符（Windows）
    console.log('\n6️⃣ 检查路径分隔符:');
    if (initialFile.includes('\\')) {
      console.log('   💡 检测到 Windows 路径分隔符');
      const unixPath = initialFile.replace(/\\/g, '/');
      console.log(`   🔄 Unix 路径: ${unixPath}`);
    }
    
    // 7. 常见问题列表
    console.log('\n7️⃣ 常见问题检查:');
    const commonIssues = [
      {
        issue: 'Rust 后端未正确传递文件路径',
        check: '检查 Rust 控制台输出',
        solution: '确保 get_initial_file 函数正确返回文件路径'
      },
      {
        issue: '文件路径格式不正确',
        check: '检查文件路径是否包含特殊字符',
        solution: '处理 URL 编码和路径分隔符'
      },
      {
        issue: '文件权限问题',
        check: '检查文件是否可读',
        solution: '确认应用有文件读取权限'
      },
      {
        issue: '前端代码未正确处理返回值',
        check: '检查 handleInitialFile 函数',
        solution: '添加更多调试日志'
      },
      {
        issue: '应用启动时序问题',
        check: '文件传递时机是否太早或太晚',
        solution: '调整初始化顺序'
      }
    ];
    
    commonIssues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue.issue}`);
      console.log(`      检查: ${issue.check}`);
      console.log(`      解决方案: ${issue.solution}`);
    });
    
  } catch (error) {
    console.error('❌ 调试过程中出错:', error);
  }
  
  console.log('\n🎯 调试建议:');
  console.log('1. 查看 Rust 后端控制台输出');
  console.log('2. 在浏览器控制台添加更多 console.log');
  console.log('3. 检查文件路径是否包含中文字符');
  console.log('4. 检查文件权限');
  console.log('5. 测试简单的文件路径（无空格、无特殊字符）');
}

// 运行调试
debugFileOpen().then(() => {
  console.log('\n✅ 调试完成');
}).catch(error => {
  console.error('❌ 调试失败:', error);
});

// 额外的诊断信息
console.log('\n🔧 平台信息:');
console.log('用户代理:', navigator.userAgent);
console.log('平台:', navigator.platform);
console.log('语言:', navigator.language);

console.log('\n💡 实际测试步骤:');
console.log('1. 在终端运行应用，查看 Rust 输出');
console.log('2. 在浏览器开发者工具查看控制台');
console.log('3. 右键点击文件选择"用 MarkEdit 打开"');
console.log('4. 观察日志输出');