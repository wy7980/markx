// 测试文件资源管理器打开功能
console.log('🔍 测试文件资源管理器打开功能');

// 模拟 Tauri API
const mockShellOpen = async (dir) => {
  console.log(`📁 尝试打开目录: ${dir}`);
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`✅ 目录打开成功: ${dir}`);
      resolve();
    }, 100);
  });
};

const mockDirname = async (path) => {
  // 简单模拟路径获取目录
  const lastSlash = path.lastIndexOf('/');
  const dir = lastSlash > 0 ? path.substring(0, lastSlash) : '.';
  console.log(`📂 从路径获取目录: ${path} → ${dir}`);
  return dir;
};

// 测试用例
async function testRevealInExplorer() {
  console.log('\n🧪 测试用例 1: 正常文件路径');
  const testFile1 = { path: '/home/user/documents/test.md', name: 'test.md' };
  try {
    const dir = await mockDirname(testFile1.path);
    await mockShellOpen(dir);
    console.log('✅ 测试通过: 正常文件路径');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }

  console.log('\n🧪 测试用例 2: 根目录文件');
  const testFile2 = { path: '/test.md', name: 'test.md' };
  try {
    const dir = await mockDirname(testFile2.path);
    await mockShellOpen(dir);
    console.log('✅ 测试通过: 根目录文件');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }

  console.log('\n🧪 测试用例 3: 当前目录文件');
  const testFile3 = { path: 'test.md', name: 'test.md' };
  try {
    const dir = await mockDirname(testFile3.path);
    await mockShellOpen(dir);
    console.log('✅ 测试通过: 当前目录文件');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }

  console.log('\n🧪 测试用例 4: 空路径');
  const testFile4 = { path: '', name: 'test.md' };
  try {
    if (!testFile4.path) {
      throw new Error('文件路径为空');
    }
    const dir = await mockDirname(testFile4.path);
    await mockShellOpen(dir);
    console.log('✅ 测试通过: 空路径');
  } catch (error) {
    console.error('❌ 测试失败 (预期中):', error.message);
  }
}

// 运行测试
testRevealInExplorer().then(() => {
  console.log('\n📊 测试完成');
}).catch(error => {
  console.error('测试执行错误:', error);
});

// 检查实际代码中的潜在问题
console.log('\n🔧 检查实际实现中的潜在问题:');
console.log('1. contextTargetFile 可能未正确设置');
console.log('2. shellOpen API 调用可能失败');
console.log('3. 路径处理可能有问题');
console.log('4. 权限问题');
console.log('5. 异步错误处理');

console.log('\n💡 建议检查:');
console.log('1. 在浏览器控制台查看错误信息');
console.log('2. 检查 contextTargetFile 的值是否正确');
console.log('3. 确认 Tauri shell API 是否正常工作');
console.log('4. 检查文件路径格式');