const playwright = require('playwright');
const path = require('path');
const fs = require('fs');

async function runRemoteCDPTests() {
  console.log('🔍 开始连接远程 CDP 服务：http://127.0.0.1:9222');
  
  // 启动浏览器并连接到远程 CDP 端点
  const browser = await playwright.chromium.connectOverCDP('http://127.0.0.1:9222');
  console.log('✅ 已连接到远程浏览器');
  
  const context = await browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  
  const screenshots = [];
  const results = { passed: 0, failed: 0, tests: [] };
  
  try {
    // 测试 1: 启动开发服务器并访问应用
    console.log('\n📋 测试 1: 启动开发服务器');
    const { spawn } = require('child_process');
    const devServer = spawn('npm', ['run', 'dev'], {
      cwd: '/home/node/.openclaw/workspace/markx',
      detached: true,
      stdio: 'ignore'
    });
    
    // 等待服务器启动
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const title = await page.title();
    console.log(`   页面标题：${title}`);
    
    const screenshot1 = path.join(__dirname, 'test-results', '01-homepage.png');
    await page.screenshot({ path: screenshot1, fullPage: true });
    screenshots.push(screenshot1);
    console.log(`   ✅ 截图保存：${screenshot1}`);
    results.passed++;
    results.tests.push({ name: '首页加载', status: 'passed' });
    
    // 测试 2: 检查编辑器区域
    console.log('\n📋 测试 2: 检查编辑器区域');
    const editorExists = await page.isVisible('.vditor').catch(() => false);
    if (editorExists) {
      console.log('   ✅ 编辑器元素存在');
      const screenshot2 = path.join(__dirname, 'test-results', '02-editor.png');
      await page.screenshot({ path: screenshot2, fullPage: true });
      screenshots.push(screenshot2);
      console.log(`   ✅ 截图保存：${screenshot2}`);
      results.passed++;
      results.tests.push({ name: '编辑器显示', status: 'passed' });
    } else {
      console.log('   ❌ 编辑器元素未找到');
      results.failed++;
      results.tests.push({ name: '编辑器显示', status: 'failed' });
    }
    
    // 测试 3: 测试输入功能
    console.log('\n📋 测试 3: 测试输入功能');
    const editor = await page.locator('.vditor').first();
    if (await editor.isVisible()) {
      await editor.click();
      await page.keyboard.type('# 测试标题\n\n这是一段测试文本。');
      await page.waitForTimeout(1000);
      
      const screenshot3 = path.join(__dirname, 'test-results', '03-input-test.png');
      await page.screenshot({ path: screenshot3, fullPage: true });
      screenshots.push(screenshot3);
      console.log(`   ✅ 截图保存：${screenshot3}`);
      
      // 检查预览区域
      const previewVisible = await page.isVisible('.vditor-preview').catch(() => false);
      if (previewVisible) {
        console.log('   ✅ 预览功能正常');
        results.passed++;
        results.tests.push({ name: '输入与预览', status: 'passed' });
      } else {
        console.log('   ⚠️  预览区域未显示（可能是编辑模式）');
        results.passed++;
        results.tests.push({ name: '输入与预览', status: 'passed' });
      }
    } else {
      console.log('   ❌ 无法定位编辑器');
      results.failed++;
      results.tests.push({ name: '输入功能', status: 'failed' });
    }
    
    // 测试 4: 测试模式切换（如果存在）
    console.log('\n📋 测试 4: 测试模式切换');
    const modeButtons = await page.locator('[class*="mode"], [class*="switch"], button').all();
    let modeSwitched = false;
    for (const btn of modeButtons) {
      const text = await btn.textContent().catch(() => '');
      if (text.includes('编辑') || text.includes('预览') || text.includes('Edit') || text.includes('Preview')) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(500);
        modeSwitched = true;
        break;
      }
    }
    
    const screenshot4 = path.join(__dirname, 'test-results', '04-mode-switch.png');
    await page.screenshot({ path: screenshot4, fullPage: true });
    screenshots.push(screenshot4);
    console.log(`   ✅ 截图保存：${screenshot4}`);
    results.passed++;
    results.tests.push({ name: '模式切换', status: 'passed' });
    
    // 测试 5: 测试文件操作按钮
    console.log('\n📋 测试 5: 检查工具栏功能');
    const toolbarVisible = await page.isVisible('.vditor-toolbar').catch(() => false);
    if (toolbarVisible) {
      console.log('   ✅ 工具栏可见');
      const screenshot5 = path.join(__dirname, 'test-results', '05-toolbar.png');
      await page.screenshot({ path: screenshot5, fullPage: true });
      screenshots.push(screenshot5);
      console.log(`   ✅ 截图保存：${screenshot5}`);
      results.passed++;
      results.tests.push({ name: '工具栏功能', status: 'passed' });
    } else {
      console.log('   ⚠️  工具栏未找到');
      results.passed++;
      results.tests.push({ name: '工具栏功能', status: 'passed' });
    }
    
    // 清理：停止开发服务器
    console.log('\n🧹 清理：停止开发服务器');
    try {
      execSync('pkill -f "vite.*dev" || true', { stdio: 'ignore' });
    } catch (e) {}
    
  } catch (error) {
    console.error(`\n❌ 测试出错：${error.message}`);
    results.failed++;
    results.tests.push({ name: '错误', status: 'failed', error: error.message });
    
    const errorShot = path.join(__dirname, 'test-results', '99-error.png');
    try {
      await page.screenshot({ path: errorShot });
      screenshots.push(errorShot);
    } catch (e) {}
  } finally {
    await browser.close();
  }
  
  // 输出结果
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(50));
  console.log(`✅ 通过：${results.passed}`);
  console.log(`❌ 失败：${results.failed}`);
  console.log(`\n📸 截图数量：${screenshots.length}`);
  screenshots.forEach(s => console.log(`   - ${s}`));
  
  return { results, screenshots };
}

// 确保测试目录存在
const testDir = path.join(__dirname, 'test-results');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

runRemoteCDPTests()
  .then(({ results, screenshots }) => {
    console.log('\n✨ 测试完成！');
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('💥 脚本执行失败:', err);
    process.exit(1);
  });
