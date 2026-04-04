const { chromium } = require('playwright');

(async () => {
  console.log('🎬 开始 E2E 测试功能验证截图...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.vditor', { timeout: 15000 });
  await page.waitForTimeout(1000);
  
  // 截图 1: 主界面
  console.log('📸 1. 主界面...');
  await page.screenshot({ path: 'test-results/final/01-main-view.png', fullPage: true });
  
  // 测试新建文档
  console.log('📄 2. 新建文档...');
  await page.click('#btnNew', { force: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/final/02-new-file.png' });
  
  // 测试输入文本
  console.log('✏️ 3. 输入文本...');
  const editor = page.locator('.vditor-wysiwyg pre.vditor-reset');
  await editor.click();
  await page.keyboard.type('# 功能测试');
  await page.keyboard.press('Enter');
  await page.keyboard.type('这是**粗体**和*斜体*测试');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- 列表项 1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- 列表项 2');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/final/03-input-text.png' });
  
  // 测试大纲功能
  console.log('📑 4. 大纲功能...');
  await page.click('#btnOutline', { force: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/final/04-outline.png' });
  
  // 测试主题切换
  console.log('🌙 5. 深色主题...');
  await page.click('#btnTheme', { force: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/final/05-dark-theme.png' });
  
  // 测试编辑模式切换
  console.log('🔄 6. 分屏预览模式...');
  await page.selectOption('#selectMode', 'sv');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/final/06-split-view.png' });
  
  // 测试侧边栏切换
  console.log('📂 7. 侧边栏折叠...');
  await page.selectOption('#selectMode', 'wysiwyg');
  await page.waitForTimeout(500);
  await page.click('#btnToggleSidebar', { force: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/final/07-sidebar-collapsed.png' });
  
  // 测试字数统计
  console.log('📊 8. 字数统计...');
  await page.click('#btnOutline', { force: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/final/08-word-count.png' });
  
  console.log('\n✅ 所有截图已保存！\n');
  
  await browser.close();
})();
