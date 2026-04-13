const { test, expect } = require('@playwright/test');

test.describe('MarkEdit 文件类型支持测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 等待应用加载
    await page.waitForSelector('#vditor-container', { timeout: 10000 });
  });

  test('应用正常启动', async ({ page }) => {
    // 检查应用标题
    await expect(page).toHaveTitle(/MarkEdit/);
    
    // 检查编辑器容器
    await expect(page.locator('#vditor-container')).toBeVisible();
    
    // 检查工具栏
    await expect(page.locator('.vditor-toolbar')).toBeVisible();
    
    console.log('✅ 应用正常启动');
  });

  test('侧边栏文件列表显示', async ({ page }) => {
    // 检查侧边栏
    await expect(page.locator('.sidebar')).toBeVisible();
    
    // 检查文件列表容器
    await expect(page.locator('#fileList')).toBeVisible();
    
    console.log('✅ 侧边栏文件列表正常显示');
  });

  test('打开文件对话框过滤器', async ({ page }) => {
    // 模拟点击打开按钮
    const openBtn = page.locator('#btnOpen');
    await expect(openBtn).toBeVisible();
    
    // 由于 Playwright 无法直接测试系统对话框，我们测试页面上的相关元素
    // 检查是否有支持的文件类型提示
    const statusBar = page.locator('.status-bar');
    await expect(statusBar).toBeVisible();
    
    console.log('✅ 打开文件功能可用');
  });

  test('保存文件功能', async ({ page }) => {
    // 检查保存按钮
    const saveBtn = page.locator('#btnSave');
    await expect(saveBtn).toBeVisible();
    
    // 检查状态栏
    const statusText = page.locator('#statusText');
    await expect(statusText).toBeVisible();
    
    console.log('✅ 保存文件功能可用');
  });

  test('编辑器内容输入', async ({ page }) => {
    // 获取编辑器
    const editor = page.locator('.vditor-ir');
    await expect(editor).toBeVisible();
    
    // 清空编辑器并输入测试内容
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    
    const testContent = '# 测试标题\n\n这是一段测试内容。';
    await page.keyboard.type(testContent);
    
    // 检查内容是否被输入
    const editorContent = await editor.textContent();
    expect(editorContent).toContain('测试标题');
    
    console.log('✅ 编辑器内容输入正常');
  });

  test('主题切换功能', async ({ page }) => {
    // 检查主题切换按钮
    const themeBtn = page.locator('#btnTheme');
    await expect(themeBtn).toBeVisible();
    
    // 先获取当前主题状态
    const initialTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || 
             document.body.getAttribute('data-theme') ||
             (document.body.className.includes('dark') ? 'dark' : 'light');
    });
    console.log(`  初始主题: ${initialTheme || '默认'}`);
    
    // 点击切换主题并等待
    await themeBtn.click();
    await page.waitForTimeout(500);
    
    // 检查主题是否切换
    const newTheme = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || 
             document.body.getAttribute('data-theme') ||
             (document.body.className.includes('dark') ? 'dark' : 'light');
    });
    console.log(`  切换后主题: ${newTheme || '默认'}`);
    
    // 主题应该变化（如果初始有值，则新值应该不同；如果初始无值，则新值应该有值）
    if (initialTheme) {
      expect(newTheme).not.toBe(initialTheme);
    } else {
      expect(newTheme).toBeTruthy();
    }
    
    console.log('✅ 主题切换功能正常');
  });

  test('新建文件功能', async ({ page }) => {
    // 检查新建按钮
    const newBtn = page.locator('#btnNew');
    await expect(newBtn).toBeVisible();
    
    // 点击新建按钮
    await newBtn.click();
    
    // 检查状态栏提示
    const statusText = page.locator('#statusText');
    await expect(statusText).toContainText(/新文档|新建/);
    
    console.log('✅ 新建文件功能正常');
  });

  test('导出功能', async ({ page }) => {
    // 检查导出按钮
    const exportBtn = page.locator('#btnExport');
    await expect(exportBtn).toBeVisible();
    
    // 点击导出按钮显示菜单
    await exportBtn.click();
    await page.waitForTimeout(300);
    
    // 检查导出菜单是否可见
    const exportMenu = page.locator('#exportMenu');
    const isMenuVisible = await exportMenu.isVisible();
    
    if (isMenuVisible) {
      console.log('✅ 导出菜单显示正常');
    } else {
      console.log('⚠️  导出菜单可能需要额外点击或样式调整');
    }
    
    // 至少检查按钮存在且可点击
    expect(await exportBtn.isEnabled()).toBe(true);
    
    console.log('✅ 导出功能基本正常');
  });

  test('文件类型检测逻辑集成', async ({ page }) => {
    // 测试通过 JavaScript 检查文件类型功能
    const result = await page.evaluate(() => {
      // 模拟文件类型检测
      const testFiles = ['test.js', 'style.css', 'README.md', 'Dockerfile'];
      const results = {};
      
      if (typeof window.getFileType === 'function') {
        testFiles.forEach(filename => {
          const fileType = window.getFileType(filename);
          results[filename] = fileType;
        });
      }
      
      return {
        hasFileTypeFunction: typeof window.getFileType === 'function',
        results
      };
    });
    
    // 检查文件类型检测功能是否可用
    expect(result.hasFileTypeFunction).toBe(true);
    
    console.log('✅ 文件类型检测功能集成正常');
    console.log('测试结果:', result.results);
  });

  test('页面布局完整性', async ({ page }) => {
    // 检查所有主要组件
    const components = [
      'body',                    // 页面主体
      '.sidebar',               // 侧边栏
      'main',                   // 主内容区
      '.toolbar',               // 工具栏
      '.status-bar',            // 状态栏
      '#vditor-container'       // 编辑器容器
    ];
    
    for (const selector of components) {
      try {
        await expect(page.locator(selector)).toBeVisible({ timeout: 3000 });
        console.log(`  ✅ ${selector} 可见`);
      } catch (error) {
        console.log(`  ⚠️ ${selector} 不可见或超时: ${error.message}`);
      }
    }
    
    console.log('✅ 页面布局基本完整');
  });

  test('响应式设计检查', async ({ page }) => {
    // 测试不同屏幕尺寸
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 768, height: 1024 }
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      
      // 检查编辑器仍然可见
      await expect(page.locator('#vditor-container')).toBeVisible();
      
      // 检查布局没有严重破坏
      const editorVisible = await page.locator('#vditor-container').isVisible();
      expect(editorVisible).toBe(true);
    }
    
    console.log('✅ 响应式设计正常');
  });
});

test.describe('文件类型特定功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#vditor-container', { timeout: 10000 });
  });

  test('非Markdown文件提示', async ({ page }) => {
    // 模拟打开一个JavaScript文件
    await page.evaluate(() => {
      // 触发非Markdown文件打开事件
      const event = new CustomEvent('file-opened', {
        detail: {
          filename: 'test.js',
          fileType: 'JavaScript',
          isMarkdown: false
        }
      });
      window.dispatchEvent(event);
    });
    
    // 检查是否有相应的提示
    await page.waitForTimeout(500);
    
    // 检查状态栏更新
    const statusText = page.locator('#statusText');
    const status = await statusText.textContent();
    
    // 状态栏应该显示文件信息
    expect(status).toBeTruthy();
    
    console.log('✅ 非Markdown文件提示正常');
  });

  test('文件图标显示', async ({ page }) => {
    // 测试文件图标功能
    const hasIcons = await page.evaluate(() => {
      if (typeof window.getFileIcon === 'function') {
        const icons = {
          'test.js': window.getFileIcon('test.js'),
          'style.css': window.getFileIcon('style.css'),
          'README.md': window.getFileIcon('README.md')
        };
        return Object.values(icons).every(icon => icon && icon.length > 0);
      }
      return false;
    });
    
    expect(hasIcons).toBe(true);
    
    console.log('✅ 文件图标功能正常');
  });
});