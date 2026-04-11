const { test, expect } = require('@playwright/test');

test.describe('MarkEdit macOS UI 图标和布局测试', () => {
  test.beforeEach(async ({ page }) => {
    // 打开应用
    await page.goto('http://localhost:5173');
    // 等待应用完全加载（包括编辑器）
    await page.waitForTimeout(2000);
    
    // 模拟macOS环境
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', {
        get: () => 'MacIntel'
      });
    });
  });

  test('1. 应用启动和基本布局', async ({ page }) => {
    // 验证应用标题
    await expect(page).toHaveTitle('MarkEdit');
    
    // 截图：完整应用界面
    await page.screenshot({ 
      path: 'test-results/macos/01-full-app.png',
      fullPage: true 
    });
    
    // 验证macOS检测类已添加
    const hasMacClass = await page.evaluate(() => {
      return document.documentElement.classList.contains('is-mac');
    });
    expect(hasMacClass).toBeTruthy();
    
    // 验证控制台日志
    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.type() === 'log') {
        consoleLogs.push(msg.text());
      }
    });
    
    // 验证关键UI元素存在
    const uiElements = [
      { selector: '#sidebar', name: '侧边栏' },
      { selector: '.toolbar', name: '工具栏' },
      { selector: '#vditor-container', name: '编辑器容器' },
      { selector: '.status-bar', name: '状态栏' }
    ];
    
    for (const element of uiElements) {
      const el = await page.$(element.selector);
      expect(el, `${element.name} 应该存在`).toBeTruthy();
    }
  });

  test('2. 工具栏按钮图标测试', async ({ page }) => {
    // 截图：工具栏特写
    await page.screenshot({ 
      path: 'test-results/macos/02-toolbar-closeup.png',
      clip: { x: 0, y: 0, width: 1200, height: 200 }
    });
    
    // 验证所有工具栏按钮图标
    const toolbarButtons = [
      { id: 'btnToggleSidebar', title: '切换侧边栏' },
      { id: 'btnOpen', title: '打开文件' },
      { id: 'btnSave', title: '保存 (Ctrl+S)' },
      { id: 'btnExport', title: '导出' },
      { id: 'btnOutline', title: '大纲' },
      { id: 'btnTheme', title: '切换主题' }
    ];
    
    for (const button of toolbarButtons) {
      const btn = await page.$(`#${button.id}`);
      expect(btn, `按钮 ${button.title} 应该存在`).toBeTruthy();
      
      // 验证按钮有SVG图标
      const hasSvg = await btn.$('svg');
      expect(hasSvg, `按钮 ${button.title} 应该有SVG图标`).toBeTruthy();
      
      // 验证SVG属性
      const svg = await btn.$('svg');
      const viewBox = await svg.getAttribute('viewBox');
      expect(viewBox, `按钮 ${button.title} 的SVG应该有viewBox属性`).toBeTruthy();
      
      // 验证SVG可见性
      const isVisible = await svg.isVisible();
      expect(isVisible, `按钮 ${button.title} 的SVG应该可见`).toBeTruthy();
      
      // 检查SVG样式
      const svgStyle = await svg.getAttribute('style');
      const computedStyle = await page.evaluate(el => {
        return window.getComputedStyle(el);
      }, svg);
      
      // 验证stroke宽度
      const strokeWidth = computedStyle.strokeWidth;
      console.log(`按钮 ${button.title} SVG stroke-width: ${strokeWidth}`);
      
      // 截图：单个按钮
      const btnBox = await btn.boundingBox();
      await page.screenshot({ 
        path: `test-results/macos/03-button-${button.id}.png`,
        clip: { 
          x: btnBox.x - 10, 
          y: btnBox.y - 10, 
          width: btnBox.width + 20, 
          height: btnBox.height + 20 
        }
      });
    }
  });

  test('3. 主题切换按钮图标测试', async ({ page }) => {
    const themeButton = await page.$('#btnTheme');
    expect(themeButton).toBeTruthy();
    
    // 初始状态：浅色主题，显示太阳图标
    const sunIcon = await page.$('#sunIcon');
    const moonIcon = await page.$('#moonIcon');
    
    // 验证初始状态
    const sunVisible = await sunIcon.isVisible();
    const moonVisible = await moonIcon.isVisible();
    
    expect(sunVisible, '浅色主题下太阳图标应该可见').toBeTruthy();
    expect(moonVisible, '浅色主题下月亮图标应该隐藏').toBeFalsy();
    
    // 截图：浅色主题
    await page.screenshot({ 
      path: 'test-results/macos/04-light-theme.png',
      fullPage: true 
    });
    
    // 点击切换主题
    await themeButton.click();
    await page.waitForTimeout(500);
    
    // 验证切换后状态
    const sunVisibleAfter = await sunIcon.isVisible();
    const moonVisibleAfter = await moonIcon.isVisible();
    
    expect(sunVisibleAfter, '深色主题下太阳图标应该隐藏').toBeFalsy();
    expect(moonVisibleAfter, '深色主题下月亮图标应该可见').toBeTruthy();
    
    // 截图：深色主题
    await page.screenshot({ 
      path: 'test-results/macos/05-dark-theme.png',
      fullPage: true 
    });
    
    // 检查主题类
    const hasDarkTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') === 'dark';
    });
    expect(hasDarkTheme, '切换后应该为深色主题').toBeTruthy();
  });

  test('4. 侧边栏图标测试', async ({ page }) => {
    // 验证侧边栏图标
    const sidebarIcons = [
      { selector: '.sidebar-folder svg', name: '文件夹图标' },
      { selector: '.btn-new svg', name: '新建文档图标' },
      { selector: '.logo-icon', name: '应用Logo' }
    ];
    
    for (const icon of sidebarIcons) {
      const el = await page.$(icon.selector);
      expect(el, `${icon.name} 应该存在`).toBeTruthy();
      
      const isVisible = await el.isVisible();
      expect(isVisible, `${icon.name} 应该可见`).toBeTruthy();
    }
    
    // 截图：侧边栏特写
    await page.screenshot({ 
      path: 'test-results/macos/06-sidebar-closeup.png',
      clip: { x: 0, y: 0, width: 300, height: 800 }
    });
  });

  test('5. 状态栏图标测试', async ({ page }) => {
    // 验证状态栏图标
    const statusIcons = [
      { selector: '.status-icon', name: '文件状态图标' },
      { selector: '.status-item svg', name: '字数统计图标' }
    ];
    
    for (const icon of statusIcons) {
      const els = await page.$$(icon.selector);
      expect(els.length, `应该至少有一个${icon.name}`).toBeGreaterThan(0);
      
      for (const el of els) {
        const isVisible = await el.isVisible();
        expect(isVisible, `${icon.name} 应该可见`).toBeTruthy();
        
        // 检查SVG样式
        const computedStyle = await page.evaluate(element => {
          return {
            stroke: window.getComputedStyle(element).stroke,
            strokeWidth: window.getComputedStyle(element).strokeWidth,
            opacity: window.getComputedStyle(element).opacity
          };
        }, el);
        
        console.log(`${icon.name} 样式:`, computedStyle);
      }
    }
    
    // 截图：状态栏特写
    const statusBar = await page.$('.status-bar');
    const statusBox = await statusBar.boundingBox();
    await page.screenshot({ 
      path: 'test-results/macos/07-statusbar-closeup.png',
      clip: { 
        x: statusBox.x, 
        y: statusBox.y, 
        width: statusBox.width, 
        height: statusBox.height 
      }
    });
  });

  test('6. 导出菜单图标测试', async ({ page }) => {
    const exportButton = await page.$('#btnExport');
    expect(exportButton).toBeTruthy();
    
    // 点击打开导出菜单
    await exportButton.click();
    await page.waitForTimeout(300);
    
    // 验证导出菜单打开
    const exportMenu = await page.$('#exportMenu');
    expect(exportMenu).toBeTruthy();
    
    const menuVisible = await exportMenu.isVisible();
    expect(menuVisible, '导出菜单应该可见').toBeTruthy();
    
    // 验证导出菜单图标
    const exportMenuItems = [
      { id: 'exportMd', name: '导出Markdown图标' },
      { id: 'exportHtml', name: '导出HTML图标' },
      { id: 'exportPdf', name: '导出PDF图标' }
    ];
    
    for (const item of exportMenuItems) {
      const menuItem = await page.$(`#${item.id}`);
      expect(menuItem, `${item.name} 菜单项应该存在`).toBeTruthy();
      
      const svg = await menuItem.$('svg');
      expect(svg, `${item.name} 应该有SVG图标`).toBeTruthy();
      
      const isVisible = await svg.isVisible();
      expect(isVisible, `${item.name} 应该可见`).toBeTruthy();
    }
    
    // 截图：导出菜单
    await page.screenshot({ 
      path: 'test-results/macos/08-export-menu.png',
      fullPage: true 
    });
    
    // 点击其他地方关闭菜单
    await page.click('body');
    await page.waitForTimeout(300);
  });

  test('7. 右键菜单图标测试', async ({ page }) => {
    // 在侧边栏区域触发右键菜单
    const sidebar = await page.$('#sidebar');
    await sidebar.click({ button: 'right' });
    await page.waitForTimeout(300);
    
    // 验证右键菜单打开
    const contextMenu = await page.$('#contextMenu');
    expect(contextMenu).toBeTruthy();
    
    const menuVisible = await contextMenu.isVisible();
    expect(menuVisible, '右键菜单应该可见').toBeTruthy();
    
    // 验证右键菜单图标
    const contextMenuItems = [
      { id: 'menuRename', name: '重命名图标' },
      { id: 'menuCopyPath', name: '复制路径图标' },
      { id: 'menuReveal', name: '资源管理器图标' },
      { id: 'menuDelete', name: '删除图标' }
    ];
    
    for (const item of contextMenuItems) {
      const menuItem = await page.$(`#${item.id}`);
      expect(menuItem, `${item.name} 菜单项应该存在`).toBeTruthy();
      
      const svg = await menuItem.$('svg');
      expect(svg, `${item.name} 应该有SVG图标`).toBeTruthy();
      
      const isVisible = await svg.isVisible();
      expect(isVisible, `${item.name} 应该可见`).toBeTruthy();
    }
    
    // 截图：右键菜单
    await page.screenshot({ 
      path: 'test-results/macos/09-context-menu.png',
      fullPage: true 
    });
    
    // 点击其他地方关闭菜单
    await page.click('body');
    await page.waitForTimeout(300);
  });

  test('8. 按钮悬停效果测试', async ({ page }) => {
    // 测试工具栏按钮悬停效果
    const toolbarButtons = ['#btnSave', '#btnOpen', '#btnTheme'];
    
    for (const buttonId of toolbarButtons) {
      const button = await page.$(buttonId);
      expect(button).toBeTruthy();
      
      // 悬停前截图
      const btnBox = await button.boundingBox();
      await page.screenshot({ 
        path: `test-results/macos/10-${buttonId.replace('#', '')}-before-hover.png`,
        clip: { 
          x: btnBox.x - 5, 
          y: btnBox.y - 5, 
          width: btnBox.width + 10, 
          height: btnBox.height + 10 
        }
      });
      
      // 悬停
      await button.hover();
      await page.waitForTimeout(500);
      
      // 悬停后截图
      await page.screenshot({ 
        path: `test-results/macos/11-${buttonId.replace('#', '')}-after-hover.png`,
        clip: { 
          x: btnBox.x - 5, 
          y: btnBox.y - 5, 
          width: btnBox.width + 10, 
          height: btnBox.height + 10 
        }
      });
      
      // 检查悬停样式
      const hoverStyle = await page.evaluate((selector) => {
        const btn = document.querySelector(selector);
        return window.getComputedStyle(btn);
      }, buttonId);
      
      console.log(`按钮 ${buttonId} 悬停样式:`, {
        backgroundColor: hoverStyle.backgroundColor,
        color: hoverStyle.color,
        borderColor: hoverStyle.borderColor
      });
    }
  });

  test('9. SVG样式验证', async ({ page }) => {
    // 验证所有SVG的通用样式
    const allSvgs = await page.$$('svg');
    console.log(`页面中共有 ${allSvgs.length} 个SVG元素`);
    
    for (let i = 0; i < Math.min(allSvgs.length, 10); i++) {
      const svg = allSvgs[i];
      const computedStyle = await page.evaluate(element => {
        return {
          stroke: window.getComputedStyle(element).stroke,
          strokeWidth: window.getComputedStyle(element).strokeWidth,
          fill: window.getComputedStyle(element).fill,
          opacity: window.getComputedStyle(element).opacity,
          visibility: window.getComputedStyle(element).visibility,
          display: window.getComputedStyle(element).display
        };
      }, svg);
      
      console.log(`SVG ${i+1} 样式:`, computedStyle);
      
      // 验证关键样式属性
      expect(computedStyle.display, 'SVG应该显示').not.toBe('none');
      expect(computedStyle.visibility, 'SVG应该可见').not.toBe('hidden');
    }
  });

  test('10. 最终完整界面截图', async ({ page }) => {
    // 确保在浅色主题
    const currentTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme');
    });
    
    if (currentTheme === 'dark') {
      const themeButton = await page.$('#btnTheme');
      await themeButton.click();
      await page.waitForTimeout(500);
    }
    
    // 最终完整截图
    await page.screenshot({ 
      path: 'test-results/macos/12-final-full-interface.png',
      fullPage: true,
      animations: 'disabled' // 禁用动画以获得更清晰的截图
    });
    
    // 各组件特写截图
    const components = [
      { name: 'toolbar', selector: '.toolbar' },
      { name: 'sidebar', selector: '#sidebar' },
      { name: 'editor', selector: '#vditor-container' },
      { name: 'statusbar', selector: '.status-bar' }
    ];
    
    for (const comp of components) {
      const element = await page.$(comp.selector);
      if (element) {
        const box = await element.boundingBox();
        if (box) {
          await page.screenshot({ 
            path: `test-results/macos/13-${comp.name}-component.png`,
            clip: box
          });
        }
      }
    }
  });
});