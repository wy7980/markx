const { chromium } = require('playwright');

(async () => {
  console.log('🔌 正在连接 CDP 浏览器...');
  
  // 通过 CDP 连接远程浏览器
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  
  // 创建新上下文和页面
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  console.log('🌐 正在访问 MarkEdit...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  
  console.log('⏳ 等待 Vditor 编辑器加载...');
  await page.waitForSelector('.vditor', { timeout: 15000 });
  await page.waitForTimeout(2000);
  
  console.log('📸 正在截图...');
  await page.screenshot({ 
    path: 'markedit-cdp-screenshot.png',
    fullPage: true,
    type: 'png'
  });
  
  console.log('✅ 截图已保存：markedit-cdp-screenshot.png');
  
  // 获取页面标题
  const title = await page.title();
  console.log(`📄 页面标题：${title}`);
  
  await browser.close();
  console.log('👋 浏览器已关闭');
})();
