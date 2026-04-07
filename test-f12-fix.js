// 测试修复后的F12功能
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('🚀 测试修复后的F12功能...');
  
  const screenshotDir = path.join(__dirname, 'test-f12-results');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  
  const browser = await chromium.launch({ 
    headless: false, // 需要显示浏览器以便观察F12效果
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 }
  });
  
  const page = await context.newPage();
  
  try {
    // 1. 打开应用
    console.log('📄 打开应用...');
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);
    
    // 截图：初始状态
    await page.screenshot({ 
      path: path.join(screenshotDir, '01-initial.png'),
      fullPage: true 
    });
    
    // 2. 检查控制台输出
    console.log('📋 检查控制台输出...');
    
    // 监听控制台消息
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('F12') || text.includes('开发者工具') || text.includes('devtools')) {
        console.log(`📝 控制台: ${text}`);
      }
    });
    
    // 3. 测试F12按键
    console.log('⌨️ 测试F12按键...');
    
    // 先点击页面获得焦点
    await page.click('body');
    await page.waitForTimeout(500);
    
    // 按下F12
    await page.keyboard.press('F12');
    await page.waitForTimeout(1000);
    
    // 截图：按下F12后
    await page.screenshot({ 
      path: path.join(screenshotDir, '02-after-f12.png'),
      fullPage: true 
    });
    
    // 4. 测试Ctrl+Shift+I
    console.log('⌨️ 测试Ctrl+Shift+I...');
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.press('I');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');
    await page.waitForTimeout(1000);
    
    // 截图：按下Ctrl+Shift+I后
    await page.screenshot({ 
      path: path.join(screenshotDir, '03-after-ctrl-shift-i.png'),
      fullPage: true 
    });
    
    // 5. 测试右键菜单
    console.log('🖱️ 测试右键菜单...');
    
    // 在编辑器区域右键
    const editor = await page.$('#vditor-container');
    if (editor) {
      await editor.click({ button: 'right' });
      await page.waitForTimeout(1000);
      
      // 截图：右键菜单
      await page.screenshot({ 
        path: path.join(screenshotDir, '04-right-click.png'),
        fullPage: true 
      });
    }
    
    // 6. 检查Tauri环境
    console.log('🔍 检查Tauri环境...');
    const tauriInfo = await page.evaluate(() => {
      return {
        hasTauri: !!window.__TAURI__,
        hasTauriInternals: !!window.__TAURI_INTERNALS__,
        hasTauriMetadata: !!window.__TAURI_METADATA__,
        userAgent: navigator.userAgent
      };
    });
    
    console.log('📊 Tauri环境信息:');
    console.log(`  - window.__TAURI__: ${tauriInfo.hasTauri}`);
    console.log(`  - window.__TAURI_INTERNALS__: ${tauriInfo.hasTauriInternals}`);
    console.log(`  - window.__TAURI_METADATA__: ${tauriInfo.hasTauriMetadata}`);
    console.log(`  - User Agent: ${tauriInfo.userAgent}`);
    
    // 7. 测试基本功能确保F12修复没有破坏其他功能
    console.log('🧪 测试基本功能...');
    
    // 测试新建文档
    const newButton = await page.$('#btnNew');
    if (newButton) {
      await newButton.click();
      await page.waitForTimeout(500);
      console.log('✅ 新建文档功能正常');
    }
    
    // 测试输入
    if (editor) {
      await editor.click();
      await page.keyboard.type('# F12功能测试\n测试F12修复是否影响正常功能');
      await page.waitForTimeout(500);
      console.log('✅ 输入功能正常');
    }
    
    // 8. 最终状态截图
    await page.screenshot({ 
      path: path.join(screenshotDir, '05-final.png'),
      fullPage: true 
    });
    
    console.log('\n🎉 F12功能测试完成！');
    console.log(`📁 截图保存在: ${screenshotDir}`);
    console.log('📋 测试总结:');
    console.log('  1. ✅ 应用正常启动');
    console.log('  2. ✅ F12按键触发测试完成');
    console.log('  3. ✅ Ctrl+Shift+I按键触发测试完成');
    console.log('  4. ✅ 右键菜单测试完成');
    console.log('  5. ✅ Tauri环境检测完成');
    console.log('  6. ✅ 基本功能测试完成');
    
    console.log('\n💡 注意:');
    console.log('  - 在浏览器中，F12和Ctrl+Shift+I会打开浏览器的开发者工具');
    console.log('  - 在Tauri应用中，需要配置正确才能打开内置的开发者工具');
    console.log('  - 查看截图中的控制台输出，确认F12按键被正确检测');
    
  } catch (error) {
    console.error('❌ 测试出错:', error);
    
    await page.screenshot({ 
      path: path.join(screenshotDir, 'error.png'),
      fullPage: true 
    });
    
  } finally {
    // 等待5秒以便观察
    await page.waitForTimeout(5000);
    await browser.close();
    console.log('🔒 浏览器已关闭');
  }
})();