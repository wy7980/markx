/**
 * E2E 测试 - 大文件双引擎（方案 v2）
 *
 * 通过 addInitScript mock window.__TAURI_INTERNALS__.invoke 注入虚拟文件系统，
 * 使 loadFileIntoEditor 的完整链路（size 守卫 → 读取 → 引擎选择 → 状态切换）
 * 可以在纯浏览器环境（Playwright）下验证。
 */
import { test, expect } from '@playwright/test';

const SMALL_CONTENT = '# 小文件\n\n这是小文件内容 small-content-marker。';
const LARGE_BYTES = 600 * 1024;   // > 512KB 阈值
const HUGE_SIZE = 21 * 1024 * 1024; // > 20MB 硬上限

// 在页面加载前注入 Tauri IPC mock
async function setupMock(page) {
  await page.addInitScript(({ smallContent, largeBytes, hugeSize }) => {
    const largeContent = (() => {
      const parts = [];
      let bytes = 0;
      for (let i = 0; bytes < largeBytes; i++) {
        const block = (i % 5 === 0)
          ? '## 大文件标题 ' + i + ' Heading\n\n正文 ' + i + '.\n\n'
          : '正文内容 ' + i + '.\n\n';
        parts.push(block);
        bytes += block.length;
      }
      return parts.join('');
    })();
    const store = {
      '/mock/small.md': { size: smallContent.length, bytes: new TextEncoder().encode(smallContent) },
      '/mock/large.md': { size: largeContent.length, bytes: new TextEncoder().encode(largeContent) },
      '/mock/huge.md': { size: hugeSize, bytes: new Uint8Array(0) }
    };
    window.__mockLargeContent = largeContent;   // 供精确往返断言使用
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        if (cmd === 'plugin:fs|size') {
          const f = store[args.path];
          if (!f) throw new Error('not found: ' + args.path);
          return f.size;
        }
        if (cmd === 'plugin:fs|read_text_file') {
          const f = store[args.path];
          if (!f) throw new Error('not found: ' + args.path);
          return f.bytes.slice().buffer; // ArrayBuffer
        }
        if (cmd === 'plugin:fs|read_dir') return [];
        if (cmd === 'get_initial_file') return null;
        if (cmd === 'get_current_dir') return '/mock';
        if (cmd === 'close_splashscreen') return null;
        return null;
      },
      transformCallback: (cb) => {
        const id = Math.floor(Math.random() * 1e9);
        window['_mockCb' + id] = cb;
        return id;
      },
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } }
    };
  }, { smallContent: SMALL_CONTENT, largeBytes: LARGE_BYTES, hugeSize: HUGE_SIZE });
}

test.describe('大文件双引擎', () => {
  test.beforeEach(async ({ page }) => {
    await setupMock(page);
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 20000 });
    await page.waitForTimeout(600);
  });

  test('大文件打开：进入大文件模式（横幅/CM6/vditor 隐藏/取值一致）', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const result = await window._markeditTestHooks.loadFileIntoEditor('/mock/large.md');
      await new Promise(r2 => setTimeout(r2, 600));
      return {
        opened: !!result,
        bytes: result ? result.bytes : 0,
        bannerVisible: !document.getElementById('largeFileBanner').hidden,
        vditorHidden: document.getElementById('vditor-container').style.display === 'none',
        cmRendered: !!document.querySelector('#largeFileEditor .cm-editor'),
        // CM6 原样保源：与 mock 内容逐字符一致（UTF-8 字节数 ≠ UTF-16 字符数，不能拿 bytes 比长度）
        valueIdentical: window._markeditTestHooks.getEditorValue() === window.__mockLargeContent,
        valueHasHeading: window._markeditTestHooks.getEditorValue().includes('大文件标题')
      };
    });
    expect(r.opened).toBe(true);
    expect(r.bytes).toBeGreaterThanOrEqual(LARGE_BYTES);
    expect(r.bannerVisible).toBe(true);
    expect(r.vditorHidden).toBe(true);
    expect(r.cmRendered).toBe(true);
    expect(r.valueIdentical).toBe(true);
    expect(r.valueHasHeading).toBe(true);
  });

  test('P1 回归：大文件之后打开小文件，必须退出大文件模式且取值为小文件内容', async ({ page }) => {
    // 先进入大文件模式
    await page.evaluate(() => window._markeditTestHooks.loadFileIntoEditor('/mock/large.md'));
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => !document.getElementById('largeFileBanner').hidden)).toBe(true);

    // 再打开小文件
    await page.evaluate(() => window._markeditTestHooks.loadFileIntoEditor('/mock/small.md'));
    await page.waitForTimeout(400);

    const state = await page.evaluate(() => ({
      bannerHidden: document.getElementById('largeFileBanner').hidden,
      vditorVisible: document.getElementById('vditor-container').style.display !== 'none',
      valueOk: window._markeditTestHooks.getEditorValue().includes('small-content-marker'),
      notLargeResidue: !window._markeditTestHooks.getEditorValue().includes('大文件标题')
    }));
    expect(state.bannerHidden).toBe(true);
    expect(state.vditorVisible).toBe(true);
    expect(state.valueOk).toBe(true);          // 内容是小文件的
    expect(state.notLargeResidue).toBe(true);  // 不是大文件残留
  });

  test('超大文件（>20MB）被拒绝打开', async ({ page }) => {
    let dialogMessage = '';
    page.on('dialog', async (d) => {
      dialogMessage = d.message();
      await d.accept();
    });
    const r = await page.evaluate(async () => {
      const result = await window._markeditTestHooks.loadFileIntoEditor('/mock/huge.md');
      return { opened: !!result };
    });
    expect(r.opened).toBe(false);
    expect(dialogMessage).toContain('文件过大');
    expect(await page.evaluate(() => document.getElementById('largeFileBanner').hidden)).toBe(true);
  });

  test('大文件模式：大纲渲染与点击跳转', async ({ page }) => {
    await page.evaluate(() => window._markeditTestHooks.loadFileIntoEditor('/mock/large.md'));
    await page.waitForTimeout(500);

    const items = await page.evaluate(() => {
      const list = document.querySelectorAll('#largeFileOutlineList .large-file-outline__item');
      return { count: list.length };
    });
    expect(items.count).toBeGreaterThan(0);

    const scroll = await page.evaluate(async () => {
      const scroller = document.querySelector('#largeFileEditor .cm-scroller');
      const before = scroller.scrollTop;
      const list = document.querySelectorAll('#largeFileOutlineList .large-file-outline__item');
      list[Math.min(30, list.length - 1)].click();
      await new Promise(r => setTimeout(r, 300));
      return { before, after: scroller.scrollTop };
    });
    expect(scroll.after).toBeGreaterThan(scroll.before);
  });

  test('小文件路径回归：仍走 Vditor 引擎（大文件模式关闭）', async ({ page }) => {
    await page.evaluate(() => window._markeditTestHooks.loadFileIntoEditor('/mock/small.md'));
    await page.waitForTimeout(400);
    const state = await page.evaluate(() => ({
      bannerHidden: document.getElementById('largeFileBanner').hidden,
      vditorVisible: document.getElementById('vditor-container').style.display !== 'none',
      // vditor IR 的 setValue→getValue 会做 markdown 规范化（改动前行为即如此），用内容标记断言
      valueOk: window._markeditTestHooks.getEditorValue().includes('small-content-marker')
    }));
    expect(state.bannerHidden).toBe(true);
    expect(state.vditorVisible).toBe(true);
    expect(state.valueOk).toBe(true);
  });
});