const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // 访问应用
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  
  // 等待 Vditor 加载
  await page.waitForSelector('.vditor', { timeout: 15000 });
  await page.waitForTimeout(2000);
  
  // 截图完整页面
  await page.screenshot({ 
    path: 'markedit-screenshot.png',
    fullPage: true,
    type: 'png'
  });
  
  console.log('✅ 截图已保存：markedit-screenshot.png');
  
  await browser.close();
})();
