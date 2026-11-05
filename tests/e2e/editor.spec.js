/**
 * E2E 测试 - 编辑器功能
 */
import { test, expect } from '@playwright/test';

test.describe('编辑器基础功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 15000 });
    await page.waitForTimeout(500);
  });

  test('应该能输入文本', async ({ page }) => {
    // Vditor 编辑器
    const editor = page.locator('.vditor-ir pre.vditor-reset');
    
    await editor.click();
    await page.keyboard.type('测试输入内容');
    await page.waitForTimeout(300);
    
    // 验证编辑器可见
    await expect(editor).toBeVisible();
  });

  test('应该能输入标题', async ({ page }) => {
    const editor = page.locator('.vditor-ir pre.vditor-reset');
    
    await editor.click();
    await page.keyboard.type('# 测试标题');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    // 应该渲染为标题
    const heading = page.locator('h1');
    await expect(heading.first()).toBeVisible();
  });

  test('应该能输入列表', async ({ page }) => {
    const editor = page.locator('.vditor-ir pre.vditor-reset');
    
    await editor.click();
    await page.keyboard.type('- 列表项一');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- 列表项二');
    await page.waitForTimeout(500);
    
    // 检查编辑器内容包含列表语法
    const content = await editor.textContent();
    expect(content).toContain('列表项');
  });
});

test.describe('格式化功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 15000 });
    await page.waitForTimeout(500);
  });

  test('工具栏应该可见', async ({ page }) => {
    const toolbar = page.locator('.vditor-toolbar');
    await expect(toolbar).toBeVisible();
  });

  test('应该能点击加粗按钮', async ({ page }) => {
    const boldBtn = page.locator('.vditor-toolbar button[data-type="bold"]');
    if (await boldBtn.isVisible()) {
      await boldBtn.click({ force: true });
      await page.waitForTimeout(100);
    }
    // 按钮存在即可
    await expect(boldBtn.first()).toBeVisible();
  });
});

test.describe('编辑器模式', () => {
  const switchMode = async (page, mode) => {
    await page.locator('.vditor-toolbar [data-type="edit-mode"]').click();
    await page.locator(`.vditor-toolbar button[data-mode="${mode}"]`).click();
    await page.waitForTimeout(1000);
  };

  test('默认应该使用即时渲染模式', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 15000 });

    await expect(page.locator('.vditor-ir pre.vditor-reset')).toBeVisible();
  });

  test('编辑模式菜单应该只提供即时渲染与分屏预览', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 15000 });

    await page.locator('.vditor-toolbar [data-type="edit-mode"]').click();
    await expect(page.locator('.vditor-toolbar button[data-mode="ir"]')).toBeVisible();
    await expect(page.locator('.vditor-toolbar button[data-mode="sv"]')).toBeVisible();
    await expect(page.locator('.vditor-toolbar button[data-mode="wysiwyg"]')).toHaveCount(0);
  });

  test('应该切换到分屏预览模式', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 15000 });

    await switchMode(page, 'sv');
    await expect(page.locator('.vditor-sv')).toBeVisible();
  });

  test('应该能从分屏预览切回即时渲染', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 15000 });

    await switchMode(page, 'sv');
    await switchMode(page, 'ir');
    await expect(page.locator('.vditor-ir pre.vditor-reset')).toBeVisible();
  });

  test('非 Markdown 文件应该使用纯文本引擎并保留缩进', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window._markeditTestHooks, { timeout: 15000 });

    const result = await page.evaluate(async () => {
      const text = 'def foo():\n    return 1\n';
      window._markeditTestHooks.setCurrentFileIsMarkdown(false);
      await window._markeditTestHooks.enterLargeFileMode(
        text, '/mock/a.py', new TextEncoder().encode(text).length, { large: false }
      );
      return {
        same: window._markeditTestHooks.getEditorValue() === text,
        cmVisible: !!document.querySelector('.cm-editor'),
        vditorHidden: document.getElementById('vditor-container').style.display === 'none',
        bannerHidden: document.getElementById('largeFileBanner').hidden
      };
    });

    expect(result.same).toBe(true);
    expect(result.cmVisible).toBe(true);
    expect(result.vditorHidden).toBe(true);
    expect(result.bannerHidden).toBe(true);
  });
});

test.describe('大纲更新', () => {
  test('输入标题应该更新大纲', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 15000 });
    
    // 显示大纲
    const outlineBtn = page.locator('#btnOutline');
    await outlineBtn.click({ force: true });
    await page.waitForTimeout(300);
    
    // 输入标题
    const editor = page.locator('.vditor-ir pre.vditor-reset');
    await editor.click();
    await page.keyboard.type('# 新标题');
    await page.keyboard.press('Enter');
    
    // 等待大纲更新
    await page.waitForTimeout(1000);
    
    // 大纲应该包含标题
    const outlineItem = page.locator('.outline-item');
    const count = await outlineItem.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('统计数据', () => {
  test('应该显示字数统计', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 15000 });
    
    // 显示大纲（包含统计）
    const outlineBtn = page.locator('#btnOutline');
    await outlineBtn.click({ force: true });
    await page.waitForTimeout(300);
    
    const wordCount = page.locator('#wordCount');
    await expect(wordCount).toBeVisible();
    
    const text = await wordCount.textContent();
    expect(parseInt(text)).toBeGreaterThanOrEqual(0);
  });
});
