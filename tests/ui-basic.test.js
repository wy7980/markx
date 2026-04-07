const { test, expect } = require('@playwright/test');

test.describe('MarkEdit UI 基本功能测试', () => {
  test.beforeEach(async ({ page }) => {
    // 打开应用
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(1000);
  });

  test('1. 应用正常启动', async ({ page }) => {
    // 验证标题
    await expect(page).toHaveTitle('MarkEdit');
    
    // 验证侧边栏存在
    const sidebar = await page.$('#sidebar');
    expect(sidebar).toBeTruthy();
    
    // 验证编辑器区域存在
    const editor = await page.$('#vditor');
    expect(editor).toBeTruthy();
    
    // 验证工具栏存在
    const toolbar = await page.$('.toolbar');
    expect(toolbar).toBeTruthy();
  });

  test('2. 新建文档功能', async ({ page }) => {
    // 查找并点击新建按钮
    const newButton = await page.$('#btnNew');
    expect(newButton).toBeTruthy();
    
    // 截图：点击前
    await page.screenshot({ path: 'test-results/01-before-new-click.png', fullPage: true });
    
    // 点击新建按钮
    await newButton.click();
    await page.waitForTimeout(500);
    
    // 截图：点击后
    await page.screenshot({ path: 'test-results/02-after-new-click.png', fullPage: true });
    
    // 验证状态栏显示正确
    const statusText = await page.textContent('#statusText');
    expect(statusText).toMatch(/就绪|新建|ready/i);
  });

  test('3. 编辑器输入功能', async ({ page }) => {
    // 先新建文档
    const newButton = await page.$('#btnNew');
    await newButton.click();
    await page.waitForTimeout(500);
    
    // 查找编辑器
    const editor = await page.$('#vditor');
    expect(editor).toBeTruthy();
    
    // 点击编辑器获得焦点
    await editor.click();
    await page.waitForTimeout(300);
    
    // 输入测试文本
    const testText = '# 测试标题\n\n这是一个测试段落。\n\n- 列表项1\n- 列表项2';
    await page.keyboard.type(testText);
    await page.waitForTimeout(500);
    
    // 截图：输入后
    await page.screenshot({ path: 'test-results/03-after-input.png', fullPage: true });
    
    // 验证编辑器内容（通过检查DOM）
    const editorContent = await page.$eval('#vditor', el => el.innerHTML);
    expect(editorContent).toBeTruthy();
    
    // 验证状态栏字数统计更新
    const wordCount = await page.textContent('#wordCount');
    expect(parseInt(wordCount) || 0).toBeGreaterThan(0);
  });

  test('4. 保存功能', async ({ page }) => {
    // 新建并输入内容
    await page.click('#btnNew');
    await page.waitForTimeout(300);
    
    const editor = await page.$('#vditor');
    await editor.click();
    await page.keyboard.type('# 保存测试\n测试保存功能');
    await page.waitForTimeout(500);
    
    // 查找保存按钮
    const saveButton = await page.$('#btnSave');
    expect(saveButton).toBeTruthy();
    
    // 验证保存按钮的title属性
    const saveTitle = await saveButton.getAttribute('title');
    expect(saveTitle).toMatch(/保存|save/i);
    
    // 截图：保存前
    await page.screenshot({ path: 'test-results/04-before-save.png', fullPage: true });
    
    // 点击保存按钮
    await saveButton.click();
    await page.waitForTimeout(1000);
    
    // 截图：保存后
    await page.screenshot({ path: 'test-results/05-after-save.png', fullPage: true });
    
    // 验证状态栏显示保存状态
    const statusText = await page.textContent('#statusText');
    expect(statusText).toMatch(/保存|saved/i);
  });

  test('5. 打开文件功能（模拟）', async ({ page }) => {
    // 查找打开按钮
    const openButton = await page.$('#btnOpen');
    expect(openButton).toBeTruthy();
    
    // 验证打开按钮的title属性
    const openTitle = await openButton.getAttribute('title');
    expect(openTitle).toMatch(/打开|open/i);
    
    // 截图：打开按钮
    await openButton.screenshot({ path: 'test-results/06-open-button.png' });
    
    // 点击打开按钮（在Tauri环境中会触发对话框）
    await openButton.click();
    await page.waitForTimeout(500);
    
    // 注意：由于安全限制，Playwright无法模拟文件对话框
    // 这里我们只验证按钮点击后应用没有崩溃
    const statusText = await page.textContent('#statusText');
    expect(statusText).toBeTruthy();
  });

  test('6. 主题切换功能', async ({ page }) => {
    // 查找主题切换按钮
    const themeButton = await page.$('#btnTheme');
    expect(themeButton).toBeTruthy();
    
    // 截图：主题切换前
    await page.screenshot({ path: 'test-results/07-before-theme-change.png', fullPage: true });
    
    // 点击主题切换按钮
    await themeButton.click();
    await page.waitForTimeout(1000);
    
    // 截图：主题切换后
    await page.screenshot({ path: 'test-results/08-after-theme-change.png', fullPage: true });
    
    // 验证应用没有崩溃
    const editor = await page.$('#vditor');
    expect(editor).toBeTruthy();
  });

  test('7. 编辑模式切换', async ({ page }) => {
    // 查找编辑模式选择器
    const modeSelect = await page.$('#selectMode');
    expect(modeSelect).toBeTruthy();
    
    // 获取当前模式
    const currentMode = await modeSelect.inputValue();
    
    // 切换模式
    await modeSelect.selectOption('ir'); // 即时渲染模式
    await page.waitForTimeout(1000);
    
    // 截图：模式切换后
    await page.screenshot({ path: 'test-results/09-after-mode-change.png', fullPage: true });
    
    // 验证编辑器仍然可用
    const editor = await page.$('#vditor');
    await editor.click();
    await page.keyboard.type('模式切换测试');
    await page.waitForTimeout(500);
    
    // 切换回原模式
    await modeSelect.selectOption(currentMode);
  });

  test('8. 侧边栏切换', async ({ page }) => {
    // 查找侧边栏切换按钮
    const sidebarToggle = await page.$('#btnToggleSidebar');
    expect(sidebarToggle).toBeTruthy();
    
    // 截图：侧边栏显示状态
    await page.screenshot({ path: 'test-results/10-sidebar-visible.png', fullPage: true });
    
    // 点击切换侧边栏
    await sidebarToggle.click();
    await page.waitForTimeout(1000);
    
    // 截图：侧边栏隐藏状态
    await page.screenshot({ path: 'test-results/11-sidebar-hidden.png', fullPage: true });
    
    // 再次点击恢复
    await sidebarToggle.click();
    await page.waitForTimeout(500);
  });

  test('9. 大纲功能', async ({ page }) => {
    // 先输入一些有结构的内容
    await page.click('#btnNew');
    await page.waitForTimeout(300);
    
    const editor = await page.$('#vditor');
    await editor.click();
    await page.keyboard.type('# 标题1\n\n## 标题2\n\n### 标题3\n\n普通段落');
    await page.waitForTimeout(1000);
    
    // 查找大纲按钮
    const outlineButton = await page.$('#btnOutline');
    if (outlineButton) {
      // 截图：大纲显示前
      await page.screenshot({ path: 'test-results/12-before-outline.png', fullPage: true });
      
      // 点击大纲按钮
      await outlineButton.click();
      await page.waitForTimeout(1000);
      
      // 截图：大纲显示后
      await page.screenshot({ path: 'test-results/13-after-outline.png', fullPage: true });
      
      // 验证大纲列表有内容
      const outlineList = await page.$('#outlineList');
      if (outlineList) {
        const outlineItems = await outlineList.$$('*');
        expect(outlineItems.length).toBeGreaterThan(0);
      }
    }
  });

  test('10. 导出功能按钮检查', async ({ page }) => {
    // 查找导出按钮
    const exportButton = await page.$('#btnExport');
    expect(exportButton).toBeTruthy();
    
    // 验证导出按钮的title属性
    const exportTitle = await exportButton.getAttribute('title');
    expect(exportTitle).toMatch(/导出|export/i);
    
    // 截图：导出按钮
    await exportButton.screenshot({ path: 'test-results/14-export-button.png' });
    
    // 验证按钮状态
    const isEnabled = await exportButton.isEnabled();
    expect(isEnabled).toBe(true);
  });
});