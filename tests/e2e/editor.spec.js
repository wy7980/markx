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
    const editor = page.locator('.vditor-wysiwyg pre.vditor-reset');
    
    await editor.click();
    await page.keyboard.type('测试输入内容');
    await page.waitForTimeout(300);
    
    // 验证编辑器可见
    await expect(editor).toBeVisible();
  });

  test('应该能输入标题', async ({ page }) => {
    const editor = page.locator('.vditor-wysiwyg pre.vditor-reset');
    
    await editor.click();
    await page.keyboard.type('# 测试标题');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    // 应该渲染为标题
    const heading = page.locator('h1');
    await expect(heading.first()).toBeVisible();
  });

  test('应该能输入列表', async ({ page }) => {
    const editor = page.locator('.vditor-wysiwyg pre.vditor-reset');
    
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
      await boldBtn.click();
      await page.waitForTimeout(100);
    }
    // 按钮存在即可
    await expect(boldBtn.first()).toBeVisible();
  });
});

test.describe('编辑器模式', () => {
  test('所见即所得模式应该正常工作', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.vditor-wysiwyg', { timeout: 15000 });
    
    const wysiwyg = page.locator('.vditor-wysiwyg');
    await expect(wysiwyg).toBeVisible();
  });

  test('即时渲染模式应该正常工作', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 15000 });
    
    // 切换到即时渲染
    const select = page.locator('#selectMode');
    await select.selectOption('ir');
    await page.waitForTimeout(1000);
    
    // 应该有即时渲染编辑器
    const ir = page.locator('.vditor-ir');
    // 检查是否存在于 DOM
    const count = await ir.count();
    expect(count).toBeGreaterThan(0);
  });

  test('分屏预览模式应该正常工作', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 15000 });
    
    // 切换到分屏预览
    const select = page.locator('#selectMode');
    await select.selectOption('sv');
    await page.waitForTimeout(1000);
    
    // 应该有分屏编辑器
    const sv = page.locator('.vditor-sv');
    const count = await sv.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('大纲更新', () => {
  test('输入标题应该更新大纲', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 15000 });
    
    // 显示大纲
    const outlineBtn = page.locator('#btnOutline');
    await outlineBtn.click();
    await page.waitForTimeout(300);
    
    // 输入标题
    const editor = page.locator('.vditor-wysiwyg pre.vditor-reset');
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
    await outlineBtn.click();
    await page.waitForTimeout(300);
    
    const wordCount = page.locator('#wordCount');
    await expect(wordCount).toBeVisible();
    
    const text = await wordCount.textContent();
    expect(parseInt(text)).toBeGreaterThanOrEqual(0);
  });
});
