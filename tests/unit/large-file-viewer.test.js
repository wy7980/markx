import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

const HTML = `
<div id="root">
  <div id="logScroll">
    <div id="logSpacer"></div>
    <div id="logRows"></div>
  </div>
  <span id="logViewerStatus"></span>
  <button id="logSearchToggle"></button>
  <div id="logSearchBar" hidden>
    <input id="logSearchInput" />
    <input id="logSearchRegex" type="checkbox" />
    <input id="logSearchCase" type="checkbox" />
    <input id="logSearchWord" type="checkbox" />
  <button id="logSearchStart"></button>
  <button id="logSearchPrev" disabled></button>
  <button id="logSearchNext" disabled></button>
  <button id="logSearchCancel" hidden></button>
    <span id="logSearchStatus"></span>
  </div>
  <div id="logResults" hidden>
    <span id="logResultCount"></span>
    <div id="logResultList"></div>
  </div>
  <input id="logJumpInput" />
  <button id="logJumpBtn"></button>
  <button id="logReloadBtn" hidden></button>
</div>
`;

function makeInvoke(totalLines = 1000) {
  return vi.fn(async (cmd, args) => {
    if (cmd === 'large_file_open') {
      return {
        sessionId: '11111111-1111-4111-8111-111111111111',
        epoch: 1,
        size: 1024,
        totalLines: null,
        tail: [{ number: null, offset: 0, text: 'tail', truncated: false }]
      };
    }
    if (cmd === 'large_file_index_status') {
      return {
        state: 'ready',
        indexedBytes: 100,
        totalBytes: 100,
        totalLines,
        epoch: 1,
        error: null
      };
    }
    if (cmd === 'large_file_viewport') {
      const start = args.startLine;
      return {
        epoch: 1,
        totalLines,
        numbering: 'exact',
        hasMore: true,
        lines: Array.from({ length: args.count }, (_, index) => ({
          number: start + index,
          offset: (start + index) * 10,
          text: `line ${start + index}`,
          truncated: false
        }))
      };
    }
    if (cmd === 'large_file_poll') return null;
    if (cmd === 'large_file_search') return 'task-1';
    if (cmd === 'large_file_search_page') {
      return {
        taskId: args.taskId,
        epoch: 1,
        hits: [{ line: 123, lineExact: true, offset: 1230, column: 1, preview: 'line 123 ERROR' }],
        nextIndex: null,
        done: true,
        cancelled: false,
        error: null
      };
    }
    return true;
  });
}

let LargeFileViewer;

beforeAll(async () => {
  ({ LargeFileViewer } = await import('../../src/large-file-viewer.js'));
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
});

afterEach(() => {
  document.body.innerHTML = '';
});

function createViewer(totalLines = 1000) {
  document.body.innerHTML = HTML;
  const root = document.getElementById('root');
  const scroll = document.getElementById('logScroll');
  const spacer = document.getElementById('logSpacer');

  Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 400 });
  Object.defineProperty(spacer, 'offsetHeight', {
    configurable: true,
    get() {
      return parseFloat(this.style.height) || 0;
    }
  });

  const viewer = new LargeFileViewer(root, { invoke: makeInvoke(totalLines) });
  return { viewer, root, scroll };
}

describe('LargeFileViewer', () => {
  it('打开后显示尾部并在索引完成后启用滚动', async () => {
    const { viewer, root } = createViewer(100000);
    await viewer.open('/mock/big.log');
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(root.hidden).toBe(false);
    expect(viewer.indexReady).toBe(true);
    expect(viewer.totalLines).toBe(100000);
    expect(document.querySelectorAll('.log-row').length).toBeGreaterThan(0);
  });

  it('按行跳转会把目标行渲染出来', async () => {
    const { viewer } = createViewer(100000);
    await viewer.open('/mock/big.log');
    await new Promise((resolve) => setTimeout(resolve, 30));

    viewer.jumpToLine(50000);
    await new Promise((resolve) => setTimeout(resolve, 30));

    const target = document.querySelector('.log-row.is-target');
    expect(target).toBeTruthy();
    expect(target.textContent).toContain('50000');
  });

  it('搜索任务完成后展示结果并可跳转', async () => {
    const { viewer } = createViewer(100000);
    await viewer.open('/mock/big.log');
    await new Promise((resolve) => setTimeout(resolve, 30));

    document.getElementById('logSearchInput').value = 'ERROR';
    await viewer.startSearch();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(document.getElementById('logResults').hidden).toBe(false);
    expect(document.getElementById('logResultCount').textContent).toBe('1');
    expect(document.querySelectorAll('.log-result').length).toBe(1);

    document.querySelector('.log-result').click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector('.log-row.is-target').textContent).toContain('123');
  });

  it('处理流式搜索批次与结束事件', async () => {
    const { viewer } = createViewer(1000);
    await viewer.open('/mock/big.log');
    await new Promise((resolve) => setTimeout(resolve, 30));

    viewer.handleSearchEvent({
      kind: 'batch',
      taskId: 'task-1',
      epoch: 1,
      total: 1,
      hits: [{ line: 42, lineExact: true, offset: 420, column: 1, preview: 'line 42 ERROR' }]
    });
    expect(document.getElementById('logResultCount').textContent).toBe('1');
    expect(document.querySelectorAll('.log-result').length).toBe(1);

    viewer.handleSearchEvent({
      kind: 'done',
      taskId: 'task-1',
      epoch: 1,
      total: 1,
      cancelled: false,
      error: null
    });
    expect(document.getElementById('logSearchStatus').textContent).toBe('1 条');
    expect(document.getElementById('logSearchCancel').hidden).toBe(true);
  });

  it('精确高亮搜索命中并支持上一个/下一个', async () => {
    const { viewer } = createViewer(1000);
    await viewer.open('/mock/big.log');
    await new Promise((resolve) => setTimeout(resolve, 30));

    viewer.handleSearchEvent({
      kind: 'batch',
      taskId: 'task-1',
      epoch: 1,
      total: 2,
      hits: [
        { line: 10, lineExact: true, offset: 100, column: 1, matchLength: 4, preview: 'line 10' },
        { line: 20, lineExact: true, offset: 200, column: 1, matchLength: 4, preview: 'line 20' }
      ]
    });

    viewer.jumpToLine(10);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector('.log-row.is-hit .log-match')?.textContent).toBe('line');

    viewer.navigateSearch(1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector('.log-row.is-target')?.textContent).toContain('10');

    viewer.navigateSearch(1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector('.log-row.is-target')?.textContent).toContain('20');
  });

  it('处理追加与轮转事件', async () => {
    const { viewer } = createViewer(1000);
    await viewer.open('/mock/big.log');
    await new Promise((resolve) => setTimeout(resolve, 30));

    viewer.handleFileEvent({
      kind: 'appended',
      sessionId: '11111111-1111-4111-8111-111111111111',
      oldSize: 1000,
      newSize: 2048,
      totalLines: 1200
    });
    expect(viewer.totalLines).toBe(1200);
    expect(document.getElementById('logViewerStatus').textContent).toContain('追加');

    viewer.handleFileEvent({
      kind: 'rotated',
      sessionId: '11111111-1111-4111-8111-111111111111'
    });
    expect(document.getElementById('logReloadBtn').hidden).toBe(false);
    expect(document.getElementById('logViewerStatus').textContent).toContain('轮转');
  });

  it('关闭后隐藏并清空会话', async () => {
    const { viewer, root } = createViewer(1000);
    await viewer.open('/mock/big.log');
    await new Promise((resolve) => setTimeout(resolve, 30));

    await viewer.close();
    expect(root.hidden).toBe(true);
    expect(viewer.isActive()).toBe(false);
    expect(document.querySelectorAll('.log-row').length).toBe(0);
  });
});
