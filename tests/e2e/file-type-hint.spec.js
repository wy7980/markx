/**
 * E2E 回归 - 文件类型提示条（"正在编辑 XX 文件"）
 *
 * 原始缺陷：
 *   1) 提示条插在 #vditor-container 之前（兄弟节点），去重却用
 *      editorContainer.querySelector('.file-type-hint')（只查子孙）→ 恒为 null
 *      → 每打开一次文件就多堆一条；
 *   2) 全代码没有移除逻辑 → 切到 Markdown 文件或大文件模式后旧提示条永久残留。
 *
 * 断言口径：提示条在整个生命周期内最多存在一条，且 Markdown 文件下必须为 0 条。
 * 通过 addInitScript mock window.__TAURI_INTERNALS__.invoke 注入虚拟文件系统（同 large-file.spec.js）。
 * 注意：@tauri-apps/api/path 的 basename/dirname 也走 IPC，必须一并 mock，
 *       否则文件名退化为“未知文件”、Markdown 判定失真（会让本用例失去意义）。
 */
import { test, expect } from '@playwright/test';

const HTML_CONTENT = '<!DOCTYPE html>\n<html>\n<body>\n<h1>hint-marker</h1>\n</body>\n</html>';
const MD_CONTENT = '# 标题\n\nmarkdown-content-marker。';
const LARGE_BYTES = 600 * 1024;   // > 512KB 阈值 → 大文件模式

async function setupMock(page) {
  await page.addInitScript(({ htmlContent, mdContent, largeBytes }) => {
    const largeHtml = (() => {
      const parts = ['<!DOCTYPE html>\n<html>\n<body>\n'];
      let bytes = 0;
      for (let i = 0; bytes < largeBytes; i++) {
        const block = '<p>正文 ' + i + ' paragraph line</p>\n';
        parts.push(block);
        bytes += block.length;
      }
      parts.push('</body>\n</html>\n');
      return parts.join('');
    })();
    const enc = new TextEncoder();
    const toEntry = (text) => {
      const bytes = enc.encode(text);
      return { size: bytes.length, bytes };
    };
    const store = {
      '/mock/page.html': toEntry(htmlContent),
      '/mock/small.html': toEntry(htmlContent),
      '/mock/small.md': toEntry(mdContent),
      '/mock/large.html': toEntry(largeHtml)
    };

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
          return f.bytes.slice().buffer; // ArrayBuffer，由 plugin-fs 侧解码
        }
        if (cmd === 'plugin:fs|read_dir') return [];
        // 路径类命令（@tauri-apps/api/path 走 IPC）：缺失会让 basename() 返回 null，
        // 使文件名退化为“未知文件”、Markdown 判定失真
        if (cmd === 'plugin:path|basename') {
          const base = String(args.path).replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
          return args.ext && base.endsWith(args.ext) ? base.slice(0, -args.ext.length) : base;
        }
        if (cmd === 'plugin:path|dirname') {
          const p = String(args.path).replace(/\\/g, '/');
          const i = p.lastIndexOf('/');
          return i <= 0 ? (p.startsWith('/') ? '/' : '') : p.slice(0, i);
        }
        if (cmd === 'plugin:path|extname') {
          const base = String(args.path).replace(/\\/g, '/').split('/').pop() || '';
          const i = base.lastIndexOf('.');
          return i > 0 ? base.slice(i) : '';
        }
        if (cmd === 'plugin:path|join') return args.paths.join('/');
        if (cmd === 'plugin:path|is_absolute') return String(args.path).startsWith('/');
        if (cmd === 'plugin:path|resolve_directory') return '/mock';
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
  }, { htmlContent: HTML_CONTENT, mdContent: MD_CONTENT, largeBytes: LARGE_BYTES });
}

/** 打开文件并返回当前提示条状态 */
async function openAndInspect(page, path) {
  return page.evaluate(async (p) => {
    await window._markeditTestHooks.loadFileIntoEditor(p);
    await new Promise(r => setTimeout(r, 200));
    const wrapper = document.querySelector('.editor-wrapper');
    const hints = wrapper ? Array.from(wrapper.querySelectorAll('.file-type-hint')) : [];
    return {
      count: hints.length,
      text: hints.length ? hints[0].textContent : '',
      // 提示条必须紧邻 #vditor-container 之前，且不可插进 vditor 内部
      siblingOk: hints.length === 0 || hints[0].nextElementSibling?.id === 'vditor-container',
      nestedCount: document.querySelectorAll('#vditor-container .file-type-hint').length
    };
  }, path);
}

test.describe('文件类型提示条', () => {
  test.beforeEach(async ({ page }) => {
    await setupMock(page);
    await page.goto('/');
    await page.waitForSelector('.vditor', { timeout: 20000 });
    await page.waitForTimeout(600);
  });

  test('P1 回归：同一个 HTML 文件反复打开，提示条始终保持 1 条（不堆叠）', async ({ page }) => {
    for (let i = 1; i <= 3; i++) {
      const s = await openAndInspect(page, '/mock/page.html');
      expect(s.count, `第 ${i} 次打开后的提示条数量`).toBe(1);
      expect(s.text).toContain('正在编辑 HTML 文件');
      expect(s.siblingOk).toBe(true);
      expect(s.nestedCount).toBe(0);
    }
  });

  test('P1 回归：切换到 Markdown 文件后提示条被移除（不再残留）', async ({ page }) => {
    const htmlState = await openAndInspect(page, '/mock/page.html');
    expect(htmlState.count).toBe(1);

    const mdState = await openAndInspect(page, '/mock/small.md');
    expect(mdState.count).toBe(0);

    // 再切回 HTML：仍只有 1 条
    const backState = await openAndInspect(page, '/mock/page.html');
    expect(backState.count).toBe(1);
  });

  test('Markdown 文件始终不显示提示条', async ({ page }) => {
    const s = await openAndInspect(page, '/mock/small.md');
    expect(s.count).toBe(0);
  });

  test('大文件模式：提示条不残留，切回小文件后恢复且不重复', async ({ page }) => {
    // 先打开小 HTML（产生提示条）
    const htmlState = await openAndInspect(page, '/mock/small.html');
    expect(htmlState.count).toBe(1);

    // 进入大文件模式：提示职责交给大文件横幅，旧提示条不得残留
    const largeState = await openAndInspect(page, '/mock/large.html');
    const mode = await page.evaluate(() => ({
      bannerVisible: !document.getElementById('largeFileBanner').hidden,
      vditorHidden: document.getElementById('vditor-container').style.display === 'none'
    }));
    expect(mode.bannerVisible).toBe(true);
    expect(mode.vditorHidden).toBe(true);
    expect(largeState.count).toBe(0);

    // 大文件模式下再开一次：仍为 0 条
    const againState = await openAndInspect(page, '/mock/large.html');
    expect(againState.count).toBe(0);

    // 切回小 Markdown 文件：退出大文件模式，仍无提示条
    const mdState = await openAndInspect(page, '/mock/small.md');
    expect(mdState.count).toBe(0);
    expect(await page.evaluate(() => document.getElementById('largeFileBanner').hidden)).toBe(true);

    // 再打开小 HTML：提示条恢复，且只有 1 条
    const backState = await openAndInspect(page, '/mock/small.html');
    expect(backState.count).toBe(1);
    expect(backState.text).toContain('正在编辑 HTML 文件');
  });
});