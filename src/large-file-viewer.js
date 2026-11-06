/**
 * 超大文件只读查看器（vanilla JS + Rust large-file-engine）。
 *
 * 设计要点：
 * - 不把 totalLines 映射为真实 DOM 高度：滚动条高度上限 MAX_SCROLL_PX，
 *   滚动位置按比例映射到行号（跳转仍精确）。
 * - 只渲染可视窗口 + overscan 行，行高固定 20px（与 style.css 一致）。
 * - 打开时先显示 Rust 返回的尾部行；索引完成后启用全文件滚动。
 * - 搜索走 Rust 任务接口，结果分页轮询，点击结果跳转。
 */

import { Channel, invoke } from '@tauri-apps/api/core';

const ROW_HEIGHT = 20;
const VIEW_LINES = 400;
const OVERSCAN = 20;
const MAX_SCROLL_PX = 4_000_000;
const PAGE_CACHE_MAX = 24;
const SEARCH_PAGE_LIMIT = 200;
const SEARCH_DISPLAY_MAX = 500;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatCount(value) {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : '?';
}

export class LargeFileViewer {
  constructor(root, options = {}) {
    this.root = root;
    this.onStatus = options.onStatus || (() => {});
    this.invoke = options.invoke || invoke;

    this.dom = {
      scroll: root.querySelector('#logScroll'),
      spacer: root.querySelector('#logSpacer'),
      rows: root.querySelector('#logRows'),
      status: root.querySelector('#logViewerStatus'),
      searchToggle: root.querySelector('#logSearchToggle'),
      searchBar: root.querySelector('#logSearchBar'),
      searchInput: root.querySelector('#logSearchInput'),
      searchRegex: root.querySelector('#logSearchRegex'),
      searchCase: root.querySelector('#logSearchCase'),
      searchWord: root.querySelector('#logSearchWord'),
      searchStart: root.querySelector('#logSearchStart'),
      searchPrev: root.querySelector('#logSearchPrev'),
      searchNext: root.querySelector('#logSearchNext'),
      searchCancel: root.querySelector('#logSearchCancel'),
      searchStatus: root.querySelector('#logSearchStatus'),
      results: root.querySelector('#logResults'),
      resultList: root.querySelector('#logResultList'),
      resultCount: root.querySelector('#logResultCount'),
      jumpInput: root.querySelector('#logJumpInput'),
      jumpBtn: root.querySelector('#logJumpBtn'),
      reloadBtn: root.querySelector('#logReloadBtn')
    };

    this.sessionId = null;
    this.path = '';
    this.epoch = 0;
    this.size = 0;
    this.totalLines = null;
    this.indexReady = false;
    this.closed = true;

    this.pages = new Map();
    this.pageToken = 0;
    this.renderToken = 0;
    this.indexToken = 0;
    this.renderTimer = 0;
    this.targetLine = null;

    this.searchTaskId = null;
    this.searchChannel = null;
    this.searchToken = 0;
    this.searchHits = [];
    this.searchHitLines = new Set();
    this.searchHitMap = new Map();
    this.searchCursor = -1;

    this.watchChannel = null;
    this.watchId = null;
    this.watchFallbackTimer = null;

    this.bindEvents();
  }

  bindEvents() {
    this.dom.scroll.addEventListener('scroll', () => this.scheduleRender());
    this.dom.searchToggle.addEventListener('click', () => this.toggleSearch());
    this.dom.searchStart.addEventListener('click', () => this.startSearch());
    this.dom.searchPrev.addEventListener('click', () => this.navigateSearch(-1));
    this.dom.searchNext.addEventListener('click', () => this.navigateSearch(1));
    this.dom.searchCancel.addEventListener('click', () => this.cancelSearch());
    this.dom.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.startSearch();
      }
    });
    this.dom.jumpBtn.addEventListener('click', () => this.jumpFromInput());
    this.dom.reloadBtn.addEventListener('click', () => void this.reload());
    this.dom.jumpInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.jumpFromInput();
      }
    });
    this.dom.resultList.addEventListener('click', (event) => {
      const item = event.target.closest('.log-result');
      if (!item) return;
      const line = Number(item.dataset.line);
      if (Number.isFinite(line) && line > 0) {
        const index = this.searchHits.findIndex((hit) => hit.line === line);
        if (index >= 0) this.searchCursor = index;
        this.jumpToLine(line);
      }
    });

    this.root.addEventListener('keydown', (event) => {
      if (!this.root.hidden && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        this.toggleSearch(true);
      } else if (event.key === 'F3') {
        event.preventDefault();
        this.navigateSearch(event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape' && !this.dom.searchBar.hidden) {
        this.dom.searchBar.hidden = true;
        this.dom.searchInput.blur();
      }
    });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.closed) return;
        this.updateSpacer();
        this.scheduleRender();
      });
      this.resizeObserver.observe(this.dom.scroll);
    }
  }

  async open(path) {
    if (!this.closed) await this.close();

    this.path = path;
    this.root.hidden = false;
    this.root.style.display = '';
    this.closed = false;
    this.pages.clear();
    this.searchChannel = null;
    this.searchHits = [];
    this.searchHitLines.clear();
    this.searchHitMap.clear();
    this.searchCursor = -1;
    this.updateSearchNav();
    this.targetLine = null;
    this.totalLines = null;
    this.indexReady = false;
    this.dom.rows.replaceChildren();
    this.dom.spacer.style.height = '0px';
    this.dom.results.hidden = true;
    this.dom.searchBar.hidden = true;
    this.dom.searchCancel.hidden = true;
    this.dom.reloadBtn.hidden = true;
    this.setSearchStatus('');
    this.dom.resultList.replaceChildren();
    this.dom.resultCount.textContent = '0';

    const info = await this.invoke('large_file_open', { path });
    if (!info.sessionId) {
      throw new Error('文件小于只读大文件阈值');
    }

    this.sessionId = info.sessionId;
    this.epoch = info.epoch;
    this.size = info.size;
    this.setStatus(`只读日志模式 · ${formatBytes(info.size)} · 索引中…`);
    this.renderTail(info.tail);
    this.pollIndex(++this.indexToken);
    void this.startWatch();
  }

  async close() {
    this.closed = true;
    this.indexToken += 1;
    this.searchToken += 1;
    this.pageToken += 1;
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = 0;
    }
    await this.stopWatch();

    if (this.searchTaskId) {
      try {
        await this.invoke('large_file_search_cancel', { taskId: this.searchTaskId });
      } catch {
        /* 会话关闭时任务可能已结束 */
      }
      this.searchTaskId = null;
    }
    this.searchChannel = null;
    if (this.sessionId) {
      try {
        await this.invoke('large_file_close', { sessionId: this.sessionId });
      } catch {
        /* 忽略关闭竞态 */
      }
    }

    this.sessionId = null;
    this.totalLines = null;
    this.indexReady = false;
    this.pages.clear();
    this.dom.rows.replaceChildren();
    this.dom.spacer.style.height = '0px';
    this.dom.results.hidden = true;
    this.dom.reloadBtn.hidden = true;
    this.root.hidden = true;
    this.path = '';
    this.setStatus('');
    this.setSearchStatus('');
  }

  isActive() {
    return !this.closed && Boolean(this.sessionId);
  }

  // ── 文件变化 / 轮转 ────────────────────────────────────

  async startWatch() {
    if (!this.sessionId) return;
    if (typeof Channel !== 'function') {
      this.startWatchFallback();
      return;
    }
    try {
      const channel = new Channel();
      channel.onmessage = (event) => this.handleFileEvent(event);
      const watchId = await this.invoke('large_file_watch', {
        sessionId: this.sessionId,
        channel
      });
      if (this.closed) {
        try {
          await this.invoke('large_file_unwatch', { watchId });
        } catch {
          /* ignore */
        }
        return;
      }
      if (!watchId) {
        this.watchChannel = null;
        this.watchId = null;
        this.startWatchFallback();
        return;
      }
      this.watchChannel = channel;
      this.watchId = watchId;
    } catch {
      // 浏览器/测试环境没有 Tauri Channel：降级为定时 poll_file。
      this.watchChannel = null;
      this.watchId = null;
      this.startWatchFallback();
    }
  }

  startWatchFallback() {
    if (this.watchFallbackTimer || !this.sessionId) return;
    this.watchFallbackTimer = setInterval(async () => {
      if (this.closed || !this.sessionId) return;
      try {
        const event = await this.invoke('large_file_poll', { sessionId: this.sessionId });
        if (event) this.handleFileEvent(event);
      } catch {
        /* 下一轮重试 */
      }
    }, 1500);
  }

  stopWatchFallback() {
    if (!this.watchFallbackTimer) return;
    clearInterval(this.watchFallbackTimer);
    this.watchFallbackTimer = null;
  }

  async stopWatch() {
    this.stopWatchFallback();
    const watchId = this.watchId;
    this.watchId = null;
    this.watchChannel = null;
    if (!watchId) return;
    try {
      await this.invoke('large_file_unwatch', { watchId });
    } catch {
      /* ignore */
    }
  }

  handleFileEvent(event) {
    if (!event || !event.kind) return;
    if (event.sessionId && event.sessionId !== this.sessionId) return;

    if (event.kind === 'appended') {
      const wasAtBottom =
        this.indexReady &&
        this.dom.scroll.scrollTop >= this.maxScrollTop() - ROW_HEIGHT * 2;
      if (event.newSize) this.size = event.newSize;
      if (event.totalLines != null) {
        this.totalLines = event.totalLines;
        this.indexReady = true;
        this.updateSpacer();
      }

      if (wasAtBottom && this.totalLines) {
        this.jumpToLine(
          Math.max(1, this.totalLines - this.visibleLines() + 1),
          false
        );
      } else {
        this.scheduleRender();
      }
      this.setStatus(
        `日志已追加 · ${formatBytes(this.size)} · ${formatCount(this.totalLines)} 行`
      );
      return;
    }

    if (event.kind === 'truncated' || event.kind === 'rotated' || event.kind === 'removed') {
      this.stopWatchFallback();
      this.dom.reloadBtn.hidden = false;
      this.setStatus(
        event.kind === 'truncated'
          ? '日志文件被截断，请重新加载'
          : event.kind === 'rotated'
            ? '日志文件已轮转，请重新加载'
            : '日志文件已删除'
      );
    }
  }

  async reload() {
    const path = this.path;
    if (!path) return;
    await this.close();
    try {
      await this.open(path);
    } catch (error) {
      this.setStatus(`重新加载失败: ${error}`);
    }
  }

  // ── 索引 / 滚动 ─────────────────────────────────────────

  async pollIndex(token) {
    while (!this.closed && token === this.indexToken && this.sessionId) {
      let status;
      try {
        status = await this.invoke('large_file_index_status', {
          sessionId: this.sessionId
        });
      } catch (error) {
        this.setStatus(`索引状态获取失败: ${error}`);
        return;
      }
      if (this.closed || token !== this.indexToken) return;

      if (status.state === 'ready') {
        this.totalLines = status.totalLines || 0;
        this.indexReady = true;
        this.updateSpacer();
        this.setStatus(
          `只读日志模式 · ${formatBytes(this.size)} · ${formatCount(this.totalLines)} 行`
        );
        this.jumpToLine(Math.max(1, this.totalLines - this.visibleLines() + 1), false);
        return;
      }
      if (status.state === 'failed') {
        this.setStatus(`索引失败: ${status.error || 'unknown'}`);
        return;
      }

      const percent = status.totalBytes
        ? Math.min(100, Math.floor((status.indexedBytes / status.totalBytes) * 100))
        : 0;
      this.setStatus(`只读日志模式 · ${formatBytes(this.size)} · 索引 ${percent}%`);
      await delay(300);
    }
  }

  visibleLines() {
    return Math.max(1, Math.ceil(this.dom.scroll.clientHeight / ROW_HEIGHT));
  }

  maxScrollTop() {
    return Math.max(0, this.dom.spacer.offsetHeight - this.dom.scroll.clientHeight);
  }

  maxFirstLine() {
    if (!this.totalLines) return 1;
    return Math.max(1, this.totalLines - this.visibleLines() + 1);
  }

  updateSpacer() {
    if (!this.indexReady || !this.totalLines) {
      this.dom.spacer.style.height = `${this.dom.scroll.clientHeight}px`;
      return;
    }
    const totalPx = this.totalLines * ROW_HEIGHT;
    const height = Math.max(
      this.dom.scroll.clientHeight,
      Math.min(totalPx, MAX_SCROLL_PX)
    );
    this.dom.spacer.style.height = `${height}px`;
  }

  lineFromScrollTop(top) {
    if (!this.indexReady || !this.totalLines) return 1;
    const maxTop = this.maxScrollTop();
    if (maxTop <= 0) return 1;
    const maxFirst = this.maxFirstLine();
    if (maxFirst <= 1) return 1;
    const ratio = Math.max(0, Math.min(1, top / maxTop));
    return Math.max(1, Math.min(maxFirst, Math.floor(1 + ratio * (maxFirst - 1))));
  }

  scrollTopForLine(line) {
    const maxTop = this.maxScrollTop();
    const maxFirst = this.maxFirstLine();
    if (maxTop <= 0 || maxFirst <= 1) return 0;
    const ratio = Math.max(0, Math.min(1, (line - 1) / (maxFirst - 1)));
    return Math.round(ratio * maxTop);
  }

  scheduleRender() {
    if (this.closed || !this.indexReady) return;
    if (this.renderTimer) return;
    // 不用 requestAnimationFrame：部分 WebView/后台标签会节流 rAF，导致滚动不刷新。
    this.renderTimer = setTimeout(() => {
      this.renderTimer = 0;
      void this.renderWindow();
    }, 16);
  }

  async renderWindow() {
    if (this.closed || !this.indexReady || !this.totalLines) return;

    const token = ++this.renderToken;
    const top = this.dom.scroll.scrollTop;
    const first = this.lineFromScrollTop(top);
    const visible = this.visibleLines();
    const start = Math.max(1, first - OVERSCAN);
    const end = Math.min(this.totalLines + 1, first + visible + OVERSCAN);

    await this.ensureRange(start, end);

    if (this.closed || token !== this.renderToken) return;
    // 行高固定 20px，而滚动条是比例映射；必须把 first 行钉在视口顶部，
    // 不能用 start 行的比例位置（否则 overscan 会被放大成几百 px 偏移）。
    const rowsTop = Math.max(0, top - (first - start) * ROW_HEIGHT);
    this.renderRows(start, end, rowsTop);
  }

  jumpFromInput() {
    const value = Number(this.dom.jumpInput.value);
    if (!Number.isFinite(value) || value <= 0) return;
    this.jumpToLine(value);
  }

  async jumpToOffset(offset) {
    if (!this.sessionId) return null;
    const page = await this.invoke('large_file_jump_to_offset', {
      sessionId: this.sessionId,
      offset: Math.max(0, Math.floor(offset)),
      count: VIEW_LINES
    });
    const first = page?.lines?.[0];
    if (first?.number) this.jumpToLine(first.number);
    return page;
  }

  jumpToLine(line, highlight = true) {
    if (!this.indexReady || !this.totalLines) {
      this.setStatus('索引尚未完成，暂时无法按行跳转');
      return;
    }
    const target = Math.max(1, Math.min(Math.floor(line), this.totalLines));
    const start = Math.max(1, target - Math.floor(this.visibleLines() / 2));
    this.targetLine = highlight ? target : null;
    this.dom.scroll.scrollTop = this.scrollTopForLine(start);
    void this.renderWindow();
  }

  // ── 分页缓存 ────────────────────────────────────────────

  pageCovering(line) {
    for (const page of this.pages.values()) {
      if (line >= page.start && line < page.start + page.lines.length) return page;
    }
    return null;
  }

  getLine(line) {
    const page = this.pageCovering(line);
    if (!page) return null;
    return page.lines[line - page.start] || null;
  }

  putPage(start, lines) {
    this.pages.delete(start);
    this.pages.set(start, { start, lines });
    while (this.pages.size > PAGE_CACHE_MAX) {
      const oldest = this.pages.keys().next().value;
      this.pages.delete(oldest);
    }
  }

  async ensureRange(start, end) {
    if (this.pageCovering(start) && this.pageCovering(Math.max(start, end - 1))) {
      return;
    }
    const token = ++this.pageToken;
    try {
      const page = await this.invoke('large_file_viewport', {
        sessionId: this.sessionId,
        startLine: start,
        count: VIEW_LINES
      });
      if (this.closed || token !== this.pageToken || page.epoch !== this.epoch) return;
      this.putPage(start, page.lines);
    } catch (error) {
      if (!this.closed) {
        this.setStatus(`读取视口失败: ${error}`);
      }
    }
  }

  // ── 渲染 ────────────────────────────────────────────────

  renderTail(tail) {
    this.dom.rows.style.transform = 'translateY(0px)';
    this.dom.rows.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const line of tail) {
      fragment.appendChild(this.createRow(line, false));
    }
    this.dom.rows.appendChild(fragment);
  }

  renderRows(start, end, top) {
    const fragment = document.createDocumentFragment();
    for (let line = start; line < end; line += 1) {
      const row = this.getLine(line);
      fragment.appendChild(this.createRow(row, row ? false : true, line));
    }
    this.dom.rows.style.transform = `translateY(${top}px)`;
    this.dom.rows.replaceChildren(fragment);
  }

  createRow(line, placeholder, forcedLine) {
    const row = document.createElement('div');
    row.className = 'log-row';

    const number = line?.number ?? forcedLine ?? null;
    if (number && this.searchHitLines.has(number)) row.classList.add('is-hit');
    if (number && number === this.targetLine) row.classList.add('is-target');

    const numberEl = document.createElement('span');
    numberEl.className = 'log-line-no';
    numberEl.textContent = number ? String(number) : '~';

    const textEl = document.createElement('span');
    textEl.className = 'log-line-text';
    if (placeholder) {
      textEl.classList.add('log-placeholder');
      textEl.textContent = '加载中…';
    } else {
      const text = (line?.text ?? '') + (line?.truncated ? ' …' : '');
      const hits = number ? this.searchHitMap.get(number) || [] : [];
      this.renderLineText(textEl, text, hits);
    }

    row.append(numberEl, textEl);
    return row;
  }

  renderLineText(container, text, hits) {
    if (!hits.length) {
      container.textContent = text;
      return;
    }

    const chars = Array.from(text);
    const ranges = hits
      .map((hit) => {
        const start = Math.max(0, Math.min(chars.length, (hit.column || 1) - 1));
        const length = Math.max(1, hit.matchLength || 1);
        return { start, end: Math.min(chars.length, start + length) };
      })
      .filter((range) => range.end > range.start)
      .sort((a, b) => a.start - b.start);

    let cursor = 0;
    let appended = false;
    for (const range of ranges) {
      if (range.start < cursor) continue;
      if (range.start > cursor) {
        container.append(document.createTextNode(chars.slice(cursor, range.start).join('')));
      }
      const mark = document.createElement('mark');
      mark.className = 'log-match';
      mark.textContent = chars.slice(range.start, range.end).join('');
      container.append(mark);
      cursor = range.end;
      appended = true;
    }

    if (cursor < chars.length) {
      container.append(document.createTextNode(chars.slice(cursor).join('')));
    }
    if (!appended && !container.hasChildNodes()) {
      container.textContent = text;
    }
  }

  // ── 搜索 ────────────────────────────────────────────────

  toggleSearch(forceOpen) {
    const shouldOpen = forceOpen ?? this.dom.searchBar.hidden;
    this.dom.searchBar.hidden = !shouldOpen;
    if (shouldOpen) this.dom.searchInput.focus();
  }

  setSearchStatus(text) {
    this.dom.searchStatus.textContent = text;
  }

  async startSearch() {
    if (!this.sessionId) return;
    const pattern = this.dom.searchInput.value;
    if (!pattern) return;
    if (this.searchTaskId) await this.cancelSearch();

    this.searchHits = [];
    this.searchHitLines.clear();
    this.searchHitMap.clear();
    this.searchCursor = -1;
    this.updateSearchNav();
    this.targetLine = null;
    this.dom.resultList.replaceChildren();
    this.dom.resultCount.textContent = '0';
    this.dom.results.hidden = false;
    this.dom.searchCancel.hidden = false;
    this.setSearchStatus('搜索中…');

    const token = ++this.searchToken;
    this.searchChannel = null;
    const request = {
      sessionId: this.sessionId,
      pattern,
      regex: this.dom.searchRegex.checked,
      caseSensitive: this.dom.searchCase.checked,
      wholeWord: this.dom.searchWord.checked,
      maxResults: 5000,
      fromOffset: null
    };

    try {
      // 优先使用 Channel 流式结果；失败时回退到 search + 轮询。
      if (typeof Channel === 'function') {
        try {
          const channel = new Channel();
          channel.onmessage = (event) => {
            if (this.closed || token !== this.searchToken) return;
            this.handleSearchEvent(event);
          };
          const taskId = await this.invoke('large_file_search_stream', {
            request,
            channel
          });
          if (this.closed || token !== this.searchToken) {
            try {
              await this.invoke('large_file_search_cancel', { taskId });
            } catch {
              /* ignore */
            }
            return;
          }
          this.searchTaskId = taskId;
          this.searchChannel = channel;
          return;
        } catch {
          // 无 Channel 能力时继续走轮询。
        }
      }

      const taskId = await this.invoke('large_file_search', { request });
      if (this.closed || token !== this.searchToken) {
        await this.invoke('large_file_search_cancel', { taskId });
        return;
      }
      this.searchTaskId = taskId;
      this.pollSearch(taskId, token);
    } catch (error) {
      this.setSearchStatus(`搜索失败: ${error}`);
      this.dom.searchCancel.hidden = true;
    }
  }

  handleSearchEvent(event) {
    if (!event || !event.kind) return;

    if (event.kind === 'batch') {
      this.dom.results.hidden = false;
      this.dom.searchCancel.hidden = false;
      if (event.hits?.length) {
        for (const hit of event.hits) this.addSearchHit(hit);
        this.renderSearchResults();
        this.updateSearchNav();
        this.renderWindow();
      }
      return;
    }

    if (event.kind === 'done') {
      this.searchTaskId = null;
      this.searchChannel = null;
      this.dom.searchCancel.hidden = true;
      if (event.error) {
        this.setSearchStatus(`搜索失败: ${event.error}`);
      } else {
        const total = event.total ?? this.searchHits.length;
        this.setSearchStatus(`${total} 条${event.cancelled ? '（已取消）' : ''}`);
      }
      if (event.taskId) {
        void this.invoke('large_file_search_release', { taskId: event.taskId }).catch(() => {});
      }
    }
  }

  async pollSearch(taskId, token) {
    while (!this.closed && token === this.searchToken) {
      let page;
      try {
        page = await this.invoke('large_file_search_page', {
          taskId,
          start: this.searchHits.length,
          limit: SEARCH_PAGE_LIMIT
        });
      } catch (error) {
        this.setSearchStatus(`搜索失败: ${error}`);
        break;
      }
      if (this.closed || token !== this.searchToken) return;

      if (page.hits?.length) {
        for (const hit of page.hits) this.addSearchHit(hit);
        this.renderSearchResults();
        this.updateSearchNav();
        this.renderWindow();
      }

      if (page.done) {
        this.searchTaskId = null;
        this.dom.searchCancel.hidden = true;
        const suffix = page.cancelled ? '（已取消）' : '';
        this.setSearchStatus(`${this.searchHits.length} 条${suffix}`);
        void this.invoke('large_file_search_release', { taskId }).catch(() => {});
        return;
      }
      await delay(150);
    }
  }

  async cancelSearch() {
    this.searchToken += 1;
    this.searchChannel = null;
    if (this.searchTaskId) {
      const taskId = this.searchTaskId;
      try {
        await this.invoke('large_file_search_cancel', { taskId });
        await this.invoke('large_file_search_release', { taskId });
      } catch {
        /* ignore */
      }
      this.searchTaskId = null;
    }
    this.dom.searchCancel.hidden = true;
    this.setSearchStatus('已取消');
  }

  addSearchHit(hit) {
    this.searchHits.push(hit);
    if (!hit.line) return;
    this.searchHitLines.add(hit.line);
    const hits = this.searchHitMap.get(hit.line) || [];
    hits.push(hit);
    this.searchHitMap.set(hit.line, hits);
  }

  updateSearchNav() {
    const disabled = this.searchHits.length === 0;
    this.dom.searchPrev.disabled = disabled;
    this.dom.searchNext.disabled = disabled;
  }

  navigateSearch(delta) {
    if (!this.searchHits.length) return;
    const total = this.searchHits.length;
    if (this.searchCursor < 0) {
      this.searchCursor = delta > 0 ? 0 : total - 1;
    } else {
      this.searchCursor = (this.searchCursor + delta + total) % total;
    }
    const hit = this.searchHits[this.searchCursor];
    if (hit?.line) this.jumpToLine(hit.line);
    this.setSearchStatus(`第 ${this.searchCursor + 1} / ${total} 条`);
  }

  renderSearchResults() {
    const shown = this.searchHits.slice(0, SEARCH_DISPLAY_MAX);
    this.dom.resultCount.textContent = String(this.searchHits.length);
    const fragment = document.createDocumentFragment();

    for (const hit of shown) {
      const item = document.createElement('div');
      item.className = 'log-result';
      item.dataset.line = hit.line ? String(hit.line) : '';

      const lineEl = document.createElement('span');
      lineEl.className = 'log-result__line';
      lineEl.textContent = hit.line ? `L${hit.line}` : 'L?';

      const textEl = document.createElement('span');
      textEl.className = 'log-result__text';
      textEl.textContent = hit.preview || '';

      item.append(lineEl, textEl);
      fragment.appendChild(item);
    }

    if (this.searchHits.length > shown.length) {
      const more = document.createElement('div');
      more.className = 'log-result';
      more.textContent = `仅显示前 ${SEARCH_DISPLAY_MAX} 条，请细化搜索条件`;
      fragment.appendChild(more);
    }

    this.dom.resultList.replaceChildren(fragment);
  }

  setStatus(text) {
    this.dom.status.textContent = text;
    this.onStatus(text);
  }
}
