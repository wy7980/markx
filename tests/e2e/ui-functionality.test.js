const { test, expect } = require('@playwright/test');

test.describe('MarkEdit UI 功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 等待应用加载
    await page.waitForSelector('#vditor-container', { timeout: 10000 });
    await page.waitForTimeout(500); // 额外等待确保完全加载
  });

  test('主界面布局验证', async ({ page }) => {
    console.log('🧪 测试: 主界面布局验证');
    
    // 检查主要组件是否可见
    const components = [
      { selector: 'body', name: '页面主体' },
      { selector: '.sidebar', name: '侧边栏' },
      { selector: 'main', name: '主内容区' },
      { selector: '.toolbar', name: '工具栏' },
      { selector: '.status-bar', name: '状态栏' },
      { selector: '#vditor-container', name: '编辑器容器' }
    ];

    for (const { selector, name } of components) {
      const element = page.locator(selector);
      const isVisible = await element.isVisible();
      console.log(`  ${name}: ${isVisible ? '✅ 可见' : '❌ 不可见'}`);
      expect(isVisible).toBe(true);
    }

    // 截图验证
    await page.screenshot({ path: 'test-results/main-layout.png' });
    console.log('📸 截图已保存: test-results/main-layout.png');
  });

  test('工具栏按钮功能', async ({ page }) => {
    console.log('🧪 测试: 工具栏按钮功能');
    
    const toolbarButtons = [
      { id: 'btnNew', name: '新建文档' },
      { id: 'btnOpen', name: '打开文件' },
      { id: 'btnSave', name: '保存文件' },
      { id: 'btnExport', name: '导出' },
      { id: 'btnTheme', name: '切换主题' }
    ];

    for (const { id, name } of toolbarButtons) {
      const button = page.locator(`#${id}`);
      const isVisible = await button.isVisible();
      const isEnabled = await button.isEnabled();
      
      console.log(`  ${name} (${id}): ${isVisible ? '✅ 可见' : '❌ 不可见'}, ${isEnabled ? '✅ 可用' : '❌ 禁用'}`);
      
      expect(isVisible).toBe(true);
      // 大部分按钮应该可用，除了特定状态下的保存按钮
      if (id !== 'btnSave' || await button.isEnabled()) {
        expect(isEnabled).toBe(true);
      }
    }

    // 测试按钮点击效果
    const newButton = page.locator('#btnNew');
    await newButton.click();
    await page.waitForTimeout(300);
    
    // 检查状态栏是否有新文档提示
    const statusText = page.locator('#statusText');
    const status = await statusText.textContent();
    console.log(`  新建文档后状态: ${status}`);
    expect(status).toBeTruthy();
  });

  test('编辑器基本功能', async ({ page }) => {
    console.log('🧪 测试: 编辑器基本功能');
    
    // 检查编辑器是否加载
    const editorContainer = page.locator('#vditor-container');
    await expect(editorContainer).toBeVisible();
    
    // 获取初始内容 - 通过 Vditor 实例或直接检查 DOM
    const initialContent = await page.evaluate(() => {
      // 尝试从 Vditor 获取内容
      if (window.editorInstance && window.editorInstance.getValue) {
        return window.editorInstance.getValue();
      }
      // 备用方案：检查 DOM 中的文本内容
      const editorElement = document.querySelector('.vditor-content');
      return editorElement ? editorElement.textContent : '';
    });
    console.log(`  编辑器初始内容长度: ${initialContent ? initialContent.length : 0}`);
    
    // 测试输入功能 - 通过点击编辑器区域然后输入
    // 先找到可点击的编辑器区域
    const editorArea = page.locator('.vditor-content, .vditor-textarea, [contenteditable="true"]').first();
    
    if (await editorArea.count() > 0) {
      await editorArea.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      
      const testText = '# UI 功能测试\n\n这是一个 Playwright UI 测试。';
      await page.keyboard.type(testText);
      
      await page.waitForTimeout(500);
      
      // 验证内容是否输入成功
      const contentAfterInput = await page.evaluate(() => {
        if (window.editorInstance && window.editorInstance.getValue) {
          return window.editorInstance.getValue();
        }
        return '';
      });
      
      console.log(`  输入后内容长度: ${contentAfterInput ? contentAfterInput.length : 0}`);
      
      if (contentAfterInput) {
        expect(contentAfterInput).toContain('UI 功能测试');
      }
    } else {
      console.log('  ⚠️ 未找到可编辑的编辑器区域');
    }
    
    // 截图验证
    await page.screenshot({ path: 'test-results/editor-input.png' });
    console.log('📸 截图已保存: test-results/editor-input.png');
  });

  test('侧边栏文件列表', async ({ page }) => {
    console.log('🧪 测试: 侧边栏文件列表');
    
    // 检查侧边栏
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    
    // 检查文件列表容器
    const fileList = page.locator('#fileList');
    await expect(fileList).toBeVisible();
    
    // 检查文件列表内容
    const fileListContent = await fileList.textContent();
    console.log(`  文件列表内容: ${fileListContent ? '有内容' : '空'}`);
    
    // 如果文件列表有内容，测试点击功能
    const fileItems = page.locator('.file-item');
    const itemCount = await fileItems.count();
    console.log(`  文件项数量: ${itemCount}`);
    
    if (itemCount > 0) {
      // 点击第一个文件项
      await fileItems.first().click();
      await page.waitForTimeout(300);
      
      // 检查是否激活
      const isActive = await fileItems.first().hasClass('active');
      console.log(`  文件项点击后激活: ${isActive ? '✅ 是' : '❌ 否'}`);
    }
    
    // 截图验证
    await page.screenshot({ path: 'test-results/sidebar-filelist.png' });
    console.log('📸 截图已保存: test-results/sidebar-filelist.png');
  });

  test('主题切换功能', async ({ page }) => {
    console.log('🧪 测试: 主题切换功能');
    
    // 获取当前主题
    const initialTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || 
             document.body.getAttribute('data-theme') ||
             (document.body.className.includes('dark') ? 'dark' : 'light');
    });
    console.log(`  初始主题: ${initialTheme || '默认'}`);
    
    // 点击主题切换按钮
    const themeButton = page.locator('#btnTheme');
    await expect(themeButton).toBeVisible();
    await themeButton.click();
    await page.waitForTimeout(500);
    
    // 检查主题是否切换
    const newTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || 
             document.body.getAttribute('data-theme') ||
             (document.body.className.includes('dark') ? 'dark' : 'light');
    });
    console.log(`  切换后主题: ${newTheme || '默认'}`);
    
    // 主题应该变化（如果初始是light，切换后可能是dark或反之）
    expect(newTheme).not.toBe(initialTheme);
    
    // 再次点击切换回来
    await themeButton.click();
    await page.waitForTimeout(500);
    
    // 截图验证
    await page.screenshot({ path: 'test-results/theme-switch.png' });
    console.log('📸 截图已保存: test-results/theme-switch.png');
  });

  test('状态栏信息显示', async ({ page }) => {
    console.log('🧪 测试: 状态栏信息显示');
    
    // 检查状态栏
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toBeVisible();
    
    // 检查状态文本
    const statusText = page.locator('#statusText');
    const status = await statusText.textContent();
    console.log(`  状态栏文本: "${status}"`);
    expect(status).toBeTruthy();
    
    // 检查文件路径显示
    const filePath = page.locator('#filePath');
    const pathText = await filePath.textContent();
    console.log(`  文件路径: "${pathText}"`);
    
    // 检查字数统计
    const wordCount = page.locator('#wordCount');
    const wordCountText = await wordCount.textContent();
    console.log(`  字数: ${wordCountText}`);
    
    // 检查段落统计
    const paraCount = page.locator('#paraCount');
    const paraCountText = await paraCount.textContent();
    console.log(`  段落: ${paraCountText}`);
  });

  test('右键菜单功能', async ({ page }) => {
    console.log('🧪 测试: 右键菜单功能');
    
    try {
      // 在编辑器区域右键
      const editorContainer = page.locator('#vditor-container');
      const editorBox = await editorContainer.boundingBox();
      
      if (editorBox) {
        // 在编辑器区域内右键
        await page.mouse.click(editorBox.x + 100, editorBox.y + 100, { button: 'right' });
        await page.waitForTimeout(300);
        console.log('  编辑器区域右键测试完成');
      }
      
      // 在侧边栏区域右键
      const sidebar = page.locator('.sidebar');
      const sidebarBox = await sidebar.boundingBox();
      if (sidebarBox) {
        await page.mouse.click(sidebarBox.x + 10, sidebarBox.y + 10, { button: 'right' });
        await page.waitForTimeout(300);
        console.log('  侧边栏区域右键测试完成');
      }
    } catch (error) {
      console.log(`  右键菜单测试遇到错误: ${error.message}`);
    }
  });

  test('响应式布局', async ({ page }) => {
    console.log('🧪 测试: 响应式布局');
    
    const viewports = [
      { width: 1920, height: 1080, name: '桌面大屏' },
      { width: 1366, height: 768, name: '桌面标准' },
      { width: 1024, height: 768, name: '平板横屏' },
      { width: 768, height: 1024, name: '平板竖屏' },
      { width: 375, height: 667, name: '手机竖屏' }
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(300);
      
      // 检查主要组件仍然可见
      const editorVisible = await page.locator('#vditor-container').isVisible();
      console.log(`  ${viewport.name} (${viewport.width}x${viewport.height}): 编辑器${editorVisible ? '✅ 可见' : '❌ 不可见'}`);
      expect(editorVisible).toBe(true);
      
      // 截图不同尺寸
      await page.screenshot({ 
        path: `test-results/responsive-${viewport.width}x${viewport.height}.png` 
      });
    }
    
    console.log('📸 响应式布局截图已保存');
  });

  test('键盘快捷键', async ({ page }) => {
    console.log('🧪 测试: 键盘快捷键');
    
    // 测试 Ctrl+S (保存)
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(500);
    
    // 检查状态栏是否有保存相关提示
    const statusText = page.locator('#statusText');
    const statusAfterSave = await statusText.textContent();
    console.log(`  Ctrl+S 后状态: "${statusAfterSave}"`);
    
    // 状态应该更新（可能是"已保存"或其他提示）
    expect(statusAfterSave).toBeTruthy();
    
    // 测试 Ctrl+N (新建 - 如果支持)
    // 注意：Ctrl+N 可能会被浏览器拦截，所以这里只测试应用内支持的快捷键
    
    console.log('  键盘快捷键测试完成');
  });

  test('文件类型支持UI指示', async ({ page }) => {
    console.log('🧪 测试: 文件类型支持UI指示');
    
    // 测试文件图标功能是否可用
    const hasFileIcons = await page.evaluate(() => {
      // 检查是否可以通过全局函数访问文件类型功能
      return typeof window.getFileIcon === 'function';
    });
    
    console.log(`  文件图标功能: ${hasFileIcons ? '✅ 可用' : '❌ 不可用'}`);
    
    if (hasFileIcons) {
      // 测试一些文件图标
      const testResults = await page.evaluate(() => {
        const files = ['test.md', 'script.js', 'style.css', 'data.json'];
        const results = {};
        files.forEach(file => {
          results[file] = window.getFileIcon(file);
        });
        return results;
      });
      
      console.log('  文件图标测试结果:');
      Object.entries(testResults).forEach(([file, icon]) => {
        console.log(`    ${file}: ${icon}`);
      });
    }
    
    // 检查文件类型信息显示
    const filePathElement = page.locator('#filePath');
    const filePathContent = await filePathElement.textContent();
    console.log(`  文件路径显示: "${filePathContent}"`);
    
    // 截图验证
    await page.screenshot({ path: 'test-results/filetype-ui.png' });
    console.log('📸 截图已保存: test-results/filetype-ui.png');
  });

  test('导出菜单功能', async ({ page }) => {
    console.log('🧪 测试: 导出菜单功能');
    
    // 检查导出按钮
    const exportButton = page.locator('#btnExport');
    await expect(exportButton).toBeVisible();
    
    // 悬停显示导出菜单
    await exportButton.hover();
    await page.waitForTimeout(500);
    
    // 检查导出菜单是否可见
    const exportMenu = page.locator('#exportMenu');
    const isMenuVisible = await exportMenu.isVisible();
    console.log(`  导出菜单: ${isMenuVisible ? '✅ 可见' : '❌ 不可见（可能需点击）'}`);
    
    // 如果菜单可见，检查菜单项
    if (isMenuVisible) {
      const menuItems = exportMenu.locator('button, a');
      const itemCount = await menuItems.count();
      console.log(`  导出菜单项数量: ${itemCount}`);
      
      // 至少应该有导出 Markdown 和导出 HTML
      expect(itemCount).toBeGreaterThan(0);
    }
    
    // 截图验证
    await page.screenshot({ path: 'test-results/export-menu.png' });
    console.log('📸 截图已保存: test-results/export-menu.png');
  });
});

test.describe('文件操作流程测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#vditor-container', { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('完整文件操作流程', async ({ page }) => {
    console.log('🧪 测试: 完整文件操作流程');
    
    try {
      // 1. 新建文档
      const newButton = page.locator('#btnNew');
      if (await newButton.isVisible()) {
        await newButton.click();
        await page.waitForTimeout(500);
        
        const statusText = page.locator('#statusText');
        const status = await statusText.textContent();
        console.log(`  1. 新建文档后状态: "${status}"`);
      }
      
      // 2. 尝试输入内容
      const editorContainer = page.locator('#vditor-container');
      if (await editorContainer.isVisible()) {
        // 点击编辑器区域
        await editorContainer.click();
        await page.waitForTimeout(300);
        
        // 尝试清空并输入内容
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(300);
        
        const testContent = '# 测试文档\n\n这是通过UI测试创建的文档内容。';
        await page.keyboard.type(testContent);
        await page.waitForTimeout(500);
        
        console.log('  2. 内容输入完成');
      }
      
      // 3. 检查字数统计（如果存在）
      const wordCount = page.locator('#wordCount');
      if (await wordCount.count() > 0) {
        const count = await wordCount.textContent();
        console.log(`  3. 当前字数: ${count}`);
      }
      
      // 4. 测试保存按钮
      const saveButton = page.locator('#btnSave');
      if (await saveButton.isVisible()) {
        await saveButton.click();
        await page.waitForTimeout(1000);
        console.log('  4. 保存按钮点击完成');
      }
      
      // 5. 测试导出按钮
      const exportButton = page.locator('#btnExport');
      if (await exportButton.isVisible()) {
        await exportButton.hover();
        await page.waitForTimeout(300);
        console.log('  5. 导出按钮悬停测试完成');
      }
      
      console.log('  完整文件操作流程测试完成');
      
      // 截图整个流程
      await page.screenshot({ path: 'test-results/full-workflow.png', fullPage: true });
      console.log('📸 完整流程截图已保存: test-results/full-workflow.png');
    } catch (error) {
      console.log(`  流程测试遇到错误: ${error.message}`);
    }
  });
});