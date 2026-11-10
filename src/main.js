/**
 * MarkEdit - 核心功能简化版
 * 解决构建问题，确保应用正常工作
 */
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, readDir, rename, remove, size as fileSize } from '@tauri-apps/plugin-fs';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { dirname, basename, extname, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, currentMonitor, LogicalPosition, LogicalSize } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import Vditor from 'vditor';
import 'vditor/dist/index.css';

// 导入文件类型检测模块
import { 
  getFileType, 
  isMarkdownFile, 
  getEditorMode, 
  getFileLanguage,
  getFileIcon,
  getAllFileTypes,
  getSupportedExtensions 
} from './file-types.js';

console.log('🚀 MarkEdit 启动中...');

// macOS检测和调试
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
if (isMac) {
  document.documentElement.classList.add('is-mac');
  console.log('✅ 检测到macOS系统，应用macOS特定修复');
  console.log('📱 用户代理:', navigator.userAgent);
}

// 检查SVG支持
const svgSupported = !!document.createElementNS && !!document.createElementNS('http://www.w3.org/2000/svg', 'svg').createSVGRect;
console.log(`✅ SVG支持: ${svgSupported ? '是' : '否'}`);

// 基础变量
let currentFilePath = null;
let currentFileIsMarkdown = true;   // 当前文档是否为 Markdown（决定编辑器引擎与 SV 预览面板）
let editorInstance = null;
let contextTargetFile = null; // 用于存储当前右击的目标文件

// 目录监视状态（轮询自动刷新）
let currentWatchedDir = null;     // 当前被监视的目录路径
let dirWatchInterval = null;      // 轮询定时器 ID
let lastFileSnapshot = new Set(); // 上次文件列表快照（文件名集合）

// ── 大文件模式（双引擎架构，方案见 .project/specs/large-file-optimization-plan.md）──
const LARGE_FILE_MODE_THRESHOLD = 512 * 1024;  // ≥ 此字节数进入大文件模式（跳过富文本渲染）
const HUGE_FILE_LIMIT = 20 * 1024 * 1024;      // 超过则进入只读日志模式（Rust large-file-engine）
const WORDCOUNT_SKIP_THRESHOLD = 512 * 1024;   // 字数统计门阔（UTF-8 字节）
let largeFileMode = false;       // 当前是否使用 CodeMirror 文本引擎（大文件 / 非 Markdown 文件）
let largeFileIsLarge = false;    // 文本引擎下当前文档是否超过大文件阈值（决定横幅与实时统计）
let largeFileEditor = null;      // CodeMirror 6 引擎实例（惰性创建）
let lastLoadedByteLen = 0;       // 最近一次打开文件的字节数（实时统计门阔）
let largeFileSession = 0;        // 大文件模式会话序号（一次性统计归属判定）
let textWordCountTimer = null;   // 文本引擎下字数统计防抖定时器
let logViewer = null;            // 超大文件只读查看器（惰性创建）
let logViewerActive = false;     // 当前是否由只读查看器接管

// 多标签页 / 文档状态
let documentTabs = [];
let activeTabId = null;
let tabSeq = 0;
let switchingTab = false;        // 切换标签时抑制 dirty 标记

// 会话与自动保存
const SESSION_KEY = 'markedit-session-v2';
const SESSION_CONTENT_BUDGET = 8 * 1024 * 1024;
const AUTOSAVE_MAX_BYTES = 2 * 1024 * 1024;
let sessionPersistTimer = null;
let autosaveTimer = null;
let restoringSession = false;

// 快速打开面板
let quickOpenItems = [];
let quickOpenFiltered = [];
let quickOpenIndex = 0;

// 标签页交互
let draggedTabId = null;
let tabContextTargetId = null;

// 规范化来自系统事件/命令行的文件路径
function normalizeIncomingFilePath(rawPath) {
  if (!rawPath) return null;

  let filePath = String(rawPath).trim();
  if (!filePath) return null;

  if (filePath.startsWith('file://')) {
    filePath = filePath.replace(/^file:\/\/(localhost)?/i, '');
    if (!filePath.startsWith('/')) {
      filePath = `/${filePath}`;
    }
  }

  if (filePath.includes('%')) {
    try {
      filePath = decodeURIComponent(filePath);
    } catch (e) {
      console.warn('⚠️ 路径 URL 解码失败，使用原始路径:', filePath, e);
    }
  }

  return filePath;
}

async function resolveToAbsolutePath(inputPath) {
  const normalized = normalizeIncomingFilePath(inputPath);
  if (!normalized) return null;

  if (normalized.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(normalized)) {
    return normalized;
  }

  try {
    const currentDir = await invoke('get_current_dir');
    return await join(currentDir, normalized);
  } catch (error) {
    console.warn('⚠️ 解析相对路径失败，使用原始路径:', normalized, error);
    return normalized;
  }
}

// 处理通过命令行打开的文件
async function handleInitialFile() {
  if (window._pendingMacOSFile) {
    const filePath = normalizeIncomingFilePath(window._pendingMacOSFile);
    delete window._pendingMacOSFile;
    console.log('🍎 优先处理待处理文件:', filePath);
    try {
      await openFileFromPath(filePath);
      return;
    } catch (error) {
      console.error('❌ 处理待处理文件失败:', error);
    }
  }

  try {
    console.log('🔍 检查是否有通过命令行打开的文件...');
    console.log('🔍 调用 invoke("get_initial_file")...');
    
    const initialFileRaw = await invoke('get_initial_file');
    const initialFile = normalizeIncomingFilePath(initialFileRaw);
    console.log('🔍 invoke 调用完成');
    console.log(`📊 返回值类型: ${typeof initialFile}`);
    console.log(`📊 返回值:`, initialFile);

    if (initialFile !== null && initialFile !== undefined && initialFile !== '') {
      console.log(`✅ 获取到文件路径: "${initialFile}"`);
      console.log(`📁 文件路径类型: ${typeof initialFile}`);
      console.log(`📁 文件路径长度: ${initialFile.length}`);
      console.log(`📁 文件路径原始值:`, initialFile);
      console.log(`📁 文件路径字符:`, Array.from(initialFile).map(c => `${c} (${c.charCodeAt(0)})`).join(' '));

      // 检查路径是否有效
      try {
        console.log(`🚀 尝试打开文件: ${initialFile}`);
        await openFileFromPath(initialFile);
        console.log(`✅ 文件打开成功: ${initialFile}`);
      } catch (error) {
        console.error('❌ 打开文件失败:', error);
        console.error('❌ 错误名称:', error.name);
        console.error('❌ 错误消息:', error.message);
        console.error('❌ 错误堆栈:', error.stack);

        // 尝试其他可能的路径格式
        if (initialFile.startsWith('file://')) {
          console.log('💡 尝试处理file:// URL格式...');
          const filePath = initialFile.replace('file://', '');
          console.log(`💡 转换后路径: ${filePath}`);
          try {
            await openFileFromPath(filePath);
            return;
          } catch (e) {
            console.error('❌ file://格式打开失败:', e);
          }
        } else if (!initialFile.includes('/') && !initialFile.includes('\\')) {
          console.log('💡 尝试在当前目录下查找文件...');
          // 可能是相对路径
          const currentDir = await invoke('get_current_dir');
          console.log(`📂 当前目录: ${currentDir}`);
          const fullPath = `${currentDir}/${initialFile}`;
          console.log(`💡 完整路径: ${fullPath}`);
          try {
            await openFileFromPath(fullPath);
            return;
          } catch (e) {
            console.error('❌ 相对路径打开失败:', e);
          }
        } else {
          // 尝试其他可能的修复
          console.log('💡 尝试其他修复方法...');
          
          // 1. 检查是否是URL编码的路径
          if (initialFile.includes('%')) {
            console.log('💡 检测到URL编码字符');
            const decodedPath = decodeURIComponent(initialFile);
            console.log(`💡 URL解码后路径: ${decodedPath}`);
            try {
              await openFileFromPath(decodedPath);
              return;
            } catch (e) {
              console.error('❌ URL解码后打开失败:', e);
            }
          }
          
          // 2. 检查路径分隔符
          if (initialFile.includes('\\')) {
            console.log('💡 检测到Windows路径分隔符');
            const unixPath = initialFile.replace(/\\/g, '/');
            console.log(`💡 转换路径分隔符: ${unixPath}`);
            try {
              await openFileFromPath(unixPath);
              return;
            } catch (e) {
              console.error('❌ 转换分隔符后打开失败:', e);
            }
          }
          
          // 3. 检查是否是绝对路径
          if (initialFile.startsWith('/')) {
            console.log('💡 检测到绝对路径');
            try {
              // 统一入口（含大小守卫与引擎选择）
              const result = await loadFileIntoEditor(initialFile);
              if (result) return;
            } catch (e) {
              console.error('❌ 绝对路径打开失败:', e);
            }
          }
          
          // 显示错误给用户
          console.error('❌ 所有尝试都失败');
          updateStatus(`无法打开文件: ${error.message}`);
          alert(`无法打开文件:\n${initialFile}\n\n错误: ${error.message}\n\n请检查文件是否存在且有读取权限。`);
        }
      }
    } else {
      console.log('ℹ️  没有通过命令行传入的文件');
      console.log('ℹ️  初始文件值为:', initialFile);
      
      // 尝试其他可能的文件获取方式
      console.log('💡 尝试其他文件获取方式...');
      
      // 方法1: 检查URL参数（如果是Web环境）
      if (typeof window !== 'undefined' && window.location) {
        const urlParams = new URLSearchParams(window.location.search);
        const fileParam = urlParams.get('file');
        if (fileParam) {
          console.log(`💡 从URL参数获取文件: ${fileParam}`);
          try {
            await openFileFromPath(fileParam);
            return;
          } catch (error) {
            console.error('❌ URL参数文件打开失败:', error);
          }
        }
      }
      
      // 方法2: 检查localStorage（如果是之前打开的文件）
      try {
        const lastOpenedFile = localStorage.getItem('lastOpenedFile');
        if (lastOpenedFile) {
          console.log(`💡 从localStorage获取上次打开的文件: ${lastOpenedFile}`);
          // 这里可以添加逻辑来重新打开上次的文件
        }
      } catch (e) {
        console.log('ℹ️  无法访问localStorage:', e);
      }
      
      // 方法3: 延迟检查（macOS有时会延迟传递参数）
      setTimeout(async () => {
        console.log('💡 延迟检查文件路径...');
        try {
          const delayedFileRaw = await invoke('get_initial_file');
          const delayedFile = normalizeIncomingFilePath(delayedFileRaw);
          if (delayedFile && delayedFile !== initialFile) {
            console.log(`💡 延迟后获取到文件: ${delayedFile}`);
            await openFileFromPath(delayedFile);
          }
        } catch (error) {
          console.log('ℹ️  延迟检查未获取到文件');
        }
      }, 1000);
    }
  } catch (error) {
    console.error('❌ 获取初始文件失败:', error);
    console.error('❌ 错误名称:', error.name);
    console.error('❌ 错误详情:', error.message);
    console.error('❌ 错误堆栈:', error.stack);
    console.error('❌ 错误完整对象:', error);
  }
}

// 从文件路径打开文件（统一入口包装，供命令行/second-instance/Finder 打开方式调用）
async function openFileFromPath(filePath) {
  const resolvedPath = await resolveToAbsolutePath(filePath);
  if (!resolvedPath) {
    throw new Error('无效文件路径');
  }
  const result = await loadFileIntoEditor(resolvedPath);
  if (!result) {
    throw new Error('文件未打开');
  }
  return result;
}

// ── 多标签页 / 文档状态 ────────────────────────────────

function getActiveTab() {
  return documentTabs.find((tab) => tab.id === activeTabId) || null;
}

function findTabByPath(path) {
  if (!path) return null;
  return documentTabs.find((tab) => tab.path === path) || null;
}

function detectEol(text) {
  const value = String(text || '');
  const crlf = (value.match(/\r\n/g) || []).length;
  const lf = (value.match(/\n/g) || []).length;
  return crlf > 0 && crlf >= lf - crlf ? 'CRLF' : 'LF';
}

function createTabRecord({
  path = null,
  name = '未命名',
  fileInfo = null,
  kind = 'vditor',
  content = '',
  byteLen = null,
  isMarkdown = true
}) {
  const text = String(content || '');
  const info = fileInfo || getFileType(name.endsWith('.md') ? name : '未命名.md');
  return {
    id: `tab-${++tabSeq}`,
    path,
    name,
    fileInfo: info,
    kind,
    content: text,
    byteLen: byteLen == null ? new TextEncoder().encode(text).length : byteLen,
    isMarkdown,
    eol: kind === 'viewer' ? null : detectEol(text),
    dirty: false,
    cursor: null,
    scrollTop: 0,
    cm6State: null
  };
}

function syncTabGlobals(tab) {
  currentFilePath = tab.path;
  currentFileIsMarkdown = tab.isMarkdown;
  lastLoadedByteLen = tab.byteLen;
}

function updateDocumentStatus() {
  const tab = getActiveTab();
  const language = document.getElementById('statusLanguage');
  const encoding = document.getElementById('statusEncoding');
  const eol = document.getElementById('statusEol');
  const cursor = document.getElementById('statusCursor');
  if (!language || !encoding || !eol || !cursor) return;

  if (!tab) {
    language.textContent = '—';
    encoding.textContent = '—';
    eol.textContent = '—';
    cursor.textContent = 'Ln —, Col —';
    return;
  }

  language.textContent = tab.fileInfo?.name || '文本';
  encoding.textContent = 'UTF-8';
  eol.textContent = tab.eol || '—';

  if (tab.kind === 'cm6' && largeFileEditor) {
    const position = largeFileEditor.getCursor();
    cursor.textContent = `Ln ${position.line}, Col ${position.col}`;
  } else if (tab.kind === 'vditor') {
    const position = getVditorCursor();
    cursor.textContent = position
      ? `Ln ${position.line}, Col ${position.col}`
      : 'Ln —, Col —';
  } else {
    cursor.textContent = 'Ln —, Col —';
  }
}

/** 从 Vditor IR/SV 的 DOM 选区估算光标行列（块按行、br 按软换行）。 */
function getVditorCursor() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);

  const root =
    document.querySelector('.vditor-ir pre.vditor-reset') ||
    document.querySelector('.vditor-sv');
  if (!root || !root.contains(range.startContainer)) return null;

  const startElement =
    range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : range.startContainer;
  const block = startElement?.closest?.('[data-block]') || startElement;
  if (!block) return null;

  const blocks = [...root.children].filter(
    (element) => element.nodeType === Node.ELEMENT_NODE
  );
  const blockIndex = blocks.indexOf(block);

  try {
    const before = document.createRange();
    before.selectNodeContents(block);
    before.setEnd(range.startContainer, range.startOffset);
    const fragment = before.cloneContents();
    const holder = document.createElement('div');
    holder.appendChild(fragment);
    holder.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    const text = holder.textContent || '';
    const lines = text.split('\n');
    return {
      line: (blockIndex >= 0 ? blockIndex + 1 : 1) + lines.length - 1,
      col: lines[lines.length - 1].length + 1
    };
  } catch {
    return null;
  }
}

function renderTabs() {
  const bar = document.getElementById('documentTabs');
  const list = document.getElementById('tabList');
  if (!bar || !list) return;

  bar.hidden = documentTabs.length === 0;
  list.replaceChildren();

  for (const tab of documentTabs) {
    const tabEl = document.createElement('div');
    tabEl.className = `doc-tab${tab.id === activeTabId ? ' active' : ''}${tab.dirty ? ' dirty' : ''}`;
    tabEl.dataset.tabId = tab.id;
    tabEl.title = tab.path || tab.name;

    const dirty = document.createElement('span');
    dirty.className = 'doc-tab__dirty';

    const name = document.createElement('span');
    name.className = 'doc-tab__name';
    name.textContent = tab.name;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'doc-tab__close';
    close.textContent = '×';
    close.title = `关闭 ${tab.name}`;
    close.setAttribute('aria-label', `关闭 ${tab.name}`);
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      void closeTab(tab.id);
    });

    tabEl.append(dirty, name, close);
    tabEl.draggable = true;
    close.draggable = false;
    tabEl.addEventListener('click', () => void activateTab(tab.id));
    tabEl.addEventListener('auxclick', (event) => {
      if (event.button === 1) {
        event.preventDefault();
        void closeTab(tab.id);
      }
    });
    tabEl.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showTabContextMenu(event, tab);
    });
    tabEl.addEventListener('dragstart', (event) => {
      draggedTabId = tab.id;
      tabEl.classList.add('dragging');
      event.dataTransfer?.setData('text/plain', tab.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    tabEl.addEventListener('dragend', () => {
      draggedTabId = null;
      tabEl.classList.remove('dragging');
    });
    tabEl.addEventListener('dragover', (event) => {
      if (!draggedTabId || draggedTabId === tab.id) return;
      event.preventDefault();
      tabEl.classList.add('drag-over');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    tabEl.addEventListener('dragleave', () => {
      tabEl.classList.remove('drag-over');
    });
    tabEl.addEventListener('drop', (event) => {
      event.preventDefault();
      tabEl.classList.remove('drag-over');
      const fromId = draggedTabId || event.dataTransfer?.getData('text/plain');
      if (fromId && fromId !== tab.id) reorderTab(fromId, tab.id);
    });
    list.appendChild(tabEl);
  }

  const activeEl = list.querySelector('.doc-tab.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  updateWindowTitle();
  requestAnimationFrame(updateTabOverflow);
}

function reorderTab(fromId, toId) {
  const from = documentTabs.findIndex((tab) => tab.id === fromId);
  const to = documentTabs.findIndex((tab) => tab.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = documentTabs.splice(from, 1);
  documentTabs.splice(to, 0, moved);
  renderTabs();
  scheduleSessionPersist();
}

function updateTabOverflow() {
  const list = document.getElementById('tabList');
  const btn = document.getElementById('tabOverflowBtn');
  const menu = document.getElementById('tabOverflowMenu');
  if (!list || !btn || !menu) return;
  const overflow = list.scrollWidth > list.clientWidth + 1;
  btn.hidden = !overflow;
  if (!overflow) {
    btn.classList.remove('active');
    menu.hidden = true;
  }
}

function renderTabOverflowMenu() {
  const menu = document.getElementById('tabOverflowMenu');
  if (!menu) return;
  menu.replaceChildren();
  for (const tab of documentTabs) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `tab-overflow-item${tab.id === activeTabId ? ' active' : ''}`;
    const name = document.createElement('span');
    name.className = 'tab-overflow-item__name';
    name.textContent = tab.name;
    item.appendChild(name);
    if (tab.dirty) {
      const dot = document.createElement('span');
      dot.className = 'tab-overflow-item__dirty';
      item.appendChild(dot);
    }
    item.addEventListener('click', () => {
      menu.hidden = true;
      document.getElementById('tabOverflowBtn')?.classList.remove('active');
      void activateTab(tab.id);
    });
    menu.appendChild(item);
  }
}

function showTabContextMenu(event, tab) {
  const menu = document.getElementById('tabContextMenu');
  if (!menu) return;
  tabContextTargetId = tab.id;
  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(event.clientX, window.innerWidth - rect.width - 8);
  const top = Math.min(event.clientY, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(4, left)}px`;
  menu.style.top = `${Math.max(4, top)}px`;
}

function hideTabContextMenu() {
  const menu = document.getElementById('tabContextMenu');
  if (menu) menu.hidden = true;
  tabContextTargetId = null;
}

async function closeTabsWithConfirm(ids) {
  const tabs = ids
    .map((id) => documentTabs.find((tab) => tab.id === id))
    .filter(Boolean);
  if (tabs.length === 0) return;
  const dirty = tabs.filter((tab) => tab.dirty);
  if (dirty.length > 0) {
    const names = dirty.slice(0, 5).map((tab) => tab.name).join('、');
    if (!confirm(`以下文档有未保存修改：${names}。\n关闭将丢失这些修改，是否继续？`)) return;
  }
  for (const tab of tabs) {
    await closeTab(tab.id, { force: true });
  }
}

function closeOtherTabs(id) {
  return closeTabsWithConfirm(documentTabs.filter((tab) => tab.id !== id).map((tab) => tab.id));
}

function closeTabsToRight(id) {
  const index = documentTabs.findIndex((tab) => tab.id === id);
  if (index < 0) return Promise.resolve();
  return closeTabsWithConfirm(documentTabs.slice(index + 1).map((tab) => tab.id));
}

function updateWindowTitle() {
  const title = document.getElementById('windowTitle');
  const divider = document.getElementById('windowTitleDivider');
  const tab = getActiveTab();
  const dirty = tab?.dirty ? '● ' : '';

  if (title) {
    title.hidden = !tab;
    title.textContent = tab ? `${dirty}${tab.name}` : '';
    title.title = tab?.path || tab?.name || 'MarkEdit';
  }
  if (divider) divider.hidden = !tab;

  document.title = tab
    ? `${dirty}${tab.name} - MarkEdit`
    : 'MarkEdit';
}

function updateFileListActive(path) {
  document.querySelectorAll('.file-item').forEach((item) => {
    item.classList.toggle('active', Boolean(path && item.dataset.path === path));
  });
}

function dropPristineUntitledTab() {
  if (documentTabs.length !== 1) return;
  const tab = documentTabs[0];
  if (!tab.path && !tab.dirty && tab.kind === 'vditor') {
    documentTabs = [];
    activeTabId = null;
    renderTabs();
  }
}

function ensureInitialTab() {
  if (documentTabs.length > 0) return;
  const content = editorInstance ? editorInstance.getValue() : '';
  const tab = createTabRecord({
    name: '未命名',
    fileInfo: getFileType('未命名.md'),
    kind: 'vditor',
    content,
    isMarkdown: true
  });
  documentTabs.push(tab);
  activeTabId = tab.id;
  syncTabGlobals(tab);
  renderTabs();
  updateDocumentStatus();
}

function snapshotActiveTab() {
  const tab = getActiveTab();
  if (!tab || tab.kind === 'viewer') return;

  let content = null;
  if (tab.kind === 'cm6' && largeFileEditor) {
    content = largeFileEditor.getValue();
    tab.cursor = largeFileEditor.getCursor();
    tab.scrollTop = largeFileEditor.getScrollTop();
    tab.cm6State = largeFileEditor.getState();
  } else if (editorInstance) {
    content = editorInstance.getValue();
    const scrollHost = document.querySelector('.vditor-content');
    if (scrollHost) tab.scrollTop = scrollHost.scrollTop;
  }
  if (content == null) return;

  tab.content = content;
  tab.byteLen = new TextEncoder().encode(content).length;
}

function markActiveTabDirty() {
  if (switchingTab) return;
  const tab = getActiveTab();
  if (!tab || tab.kind === 'viewer') return;
  if (!tab.dirty) {
    tab.dirty = true;
    renderTabs();
  }
  scheduleAutosave();
  scheduleSessionPersist();
}

function markTabSaved(tab, content) {
  if (!tab) return;
  tab.content = content;
  tab.byteLen = new TextEncoder().encode(content).length;
  tab.eol = detectEol(content);
  tab.dirty = false;
  renderTabs();
  if (tab.id === activeTabId) updateDocumentStatus();
  scheduleSessionPersist();
}

function markActiveTabSaved() {
  const tab = getActiveTab();
  if (!tab) return;
  markTabSaved(tab, getEditorValue());
}

function isAutosaveEnabled() {
  return appSettings.autosave !== false;
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  if (!isAutosaveEnabled()) return;
  autosaveTimer = setTimeout(() => {
    void autosaveActiveTab();
  }, 1800);
}

async function autosaveActiveTab() {
  if (restoringSession || saveInFlight || logViewerActive) return;
  const tab = getActiveTab();
  if (!tab || !tab.dirty || tab.kind === 'viewer' || !tab.path) return;
  if (tab.byteLen > AUTOSAVE_MAX_BYTES) return;

  const content = getEditorValue();
  if (content === tab.content) return;

  saveInFlight = true;
  try {
    await writeTextFile(tab.path, content);
    if (!documentTabs.includes(tab)) return;
    markTabSaved(tab, content);
    updateStatus('已自动保存');
  } catch (error) {
    console.warn('自动保存失败:', error);
    updateStatus('自动保存失败，请手动保存');
  } finally {
    saveInFlight = false;
  }
}

function scheduleSessionPersist() {
  if (restoringSession) return;
  clearTimeout(sessionPersistTimer);
  sessionPersistTimer = setTimeout(persistSessionNow, 500);
}

function collectSessionSnapshot() {
  if (!switchingTab) snapshotActiveTab();
  const active = getActiveTab();
  let budget = SESSION_CONTENT_BUDGET;

  const tabs = documentTabs.map((tab) => {
    let content = null;
    if (tab.kind !== 'viewer' && (tab.dirty || !tab.path)) {
      const text = tab.content || '';
      if (text.length <= budget) {
        content = text;
        budget -= text.length;
      }
    }
    return {
      path: tab.path || null,
      name: tab.name,
      kind: tab.kind,
      isMarkdown: tab.isMarkdown,
      byteLen: tab.byteLen,
      eol: tab.eol,
      dirty: Boolean(tab.dirty),
      cursor: tab.cursor,
      scrollTop: tab.scrollTop,
      content
    };
  });

  return {
    version: 2,
    savedAt: Date.now(),
    activeIndex: active ? documentTabs.indexOf(active) : 0,
    activePath: active?.path || null,
    activeName: active?.name || null,
    sidebarRoot: currentWatchedDir,
    tabs
  };
}

function persistSessionNow() {
  if (restoringSession) return;
  const snapshot = collectSessionSnapshot();
  if (snapshot.tabs.length === 0) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch (error) {
    // 超配额时优先保留未命名文档内容，文件类标签退化为只存路径。
    try {
      const compact = {
        ...snapshot,
        tabs: snapshot.tabs.map((tab) => (tab.path ? { ...tab, content: null } : tab))
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(compact));
    } catch (fallbackError) {
      console.warn('保存会话失败:', fallbackError || error);
    }
  }
}

async function restoreSession() {
  let data = null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    data = JSON.parse(raw);
  } catch (error) {
    console.warn('读取会话失败:', error);
    return false;
  }

  if (!data || data.version !== 2 || !Array.isArray(data.tabs) || data.tabs.length === 0) {
    return false;
  }

  restoringSession = true;
  try {
    documentTabs = [];
    activeTabId = null;

    for (const entry of data.tabs) {
      if (!entry || (!entry.path && entry.content == null)) continue;

      if (entry.content != null) {
        const name = entry.name || (entry.path ? entry.path.split(/[\\/]/).pop() : '未命名');
        const fileInfo = getFileType(name);
        const kind = entry.kind === 'cm6' ? 'cm6' : 'vditor';
        const tab = createTabRecord({
          path: entry.path || null,
          name,
          fileInfo,
          kind,
          content: entry.content,
          byteLen: entry.byteLen,
          isMarkdown: entry.isMarkdown !== false
        });
        tab.dirty = Boolean(entry.dirty || !entry.path);
        if (entry.eol) tab.eol = entry.eol;
        if (entry.cursor) tab.cursor = entry.cursor;
        if (Number.isFinite(entry.scrollTop)) tab.scrollTop = entry.scrollTop;
        documentTabs.push(tab);
      } else if (entry.path) {
        try {
          await loadFileIntoEditor(entry.path);
        } catch (error) {
          console.warn('恢复文件失败:', entry.path, error);
        }
      }
    }

    if (documentTabs.length === 0) return false;

    // 恢复侧栏根目录：优先用户上次选择的目录，否则取首个文件所在目录
    if (data.sidebarRoot) {
      try {
        await populateFileList(data.sidebarRoot, null);
        startDirWatch(data.sidebarRoot);
      } catch (error) {
        console.warn('恢复侧栏目录失败:', data.sidebarRoot, error);
      }
    } else {
      const firstPathTab = documentTabs.find((tab) => tab.path);
      if (firstPathTab) {
        try {
          const dir = await dirname(firstPathTab.path);
          await populateFileList(dir, firstPathTab.name);
          startDirWatch(dir);
        } catch (error) {
          console.warn('恢复侧栏目录失败:', dir, error);
        }
      }
    }

    const byPath = data.activePath
      ? documentTabs.find((tab) => tab.path === data.activePath)
      : null;
    const byName = data.activeName
      ? documentTabs.find((tab) => !tab.path && tab.name === data.activeName)
      : null;
    const index = Number.isInteger(data.activeIndex)
      ? Math.min(Math.max(data.activeIndex, 0), documentTabs.length - 1)
      : 0;
    const target = byPath || byName || documentTabs[index] || documentTabs[0];
    await activateTab(target.id);
    updateStatus(`已恢复 ${documentTabs.length} 个标签页`);
    return true;
  } finally {
    restoringSession = false;
    scheduleSessionPersist();
  }
}

async function applyTabToEditor(tab) {
  switchingTab = true;
  try {
    syncTabGlobals(tab);
    updateFileInfoDisplay(tab.name, tab.fileInfo);

    if (tab.kind === 'viewer') {
      await openLargeFileViewer(tab.path);
    } else {
      await closeLargeFileViewer();
      if (tab.kind === 'cm6') {
        await enterLargeFileMode(tab.content, tab.path || tab.name, tab.byteLen, {
          large: tab.byteLen >= LARGE_FILE_MODE_THRESHOLD
        });
        if (largeFileEditor) {
          if (tab.cm6State) {
            largeFileEditor.setState(tab.cm6State);
          } else {
            if (tab.cursor) largeFileEditor.setCursor(tab.cursor.line, tab.cursor.col);
            requestAnimationFrame(() => largeFileEditor?.setScrollTop(tab.scrollTop || 0));
          }
        }
      } else {
        await exitLargeFileModeIfActive();
        if (editorInstance) {
          if (editorInstance.getCurrentMode && editorInstance.getCurrentMode() !== 'ir') {
            switchEditorMode('ir');
          }
          editorInstance.setValue(tab.content);
          updateWordCount(tab.content);
          adjustEditorForFileType(tab.name);
          applyPreviewModeForCurrentFile();
          requestAnimationFrame(() => {
            const scrollHost = document.querySelector('.vditor-content');
            if (scrollHost) scrollHost.scrollTop = tab.scrollTop || 0;
          });
        }
      }
    }

    if (tab.path) {
      // 侧栏根目录保持用户选择（打开文件夹/首次打开），不随文件所在层级下钻
      if (!currentWatchedDir) {
        const dir = await dirname(tab.path);
        await populateFileList(dir, tab.name);
        startDirWatch(dir);
      } else {
        updateFileListActive(tab.path);
      }
    } else {
      updateFileListActive(null);
    }
  } finally {
    switchingTab = false;
    updateDocumentStatus();
  }
}

async function activateTab(id) {
  if (id === activeTabId) return;
  const current = getActiveTab();
  if (current) snapshotActiveTab();

  const tab = documentTabs.find((item) => item.id === id);
  if (!tab) return;

  activeTabId = tab.id;
  renderTabs();
  try {
    await applyTabToEditor(tab);
  } catch (error) {
    console.error('❌ 切换标签失败:', error);
    updateStatus(`切换标签失败: ${error}`);
  }
  scheduleSessionPersist();
}

async function createNewTab() {
  const content = '# 新文档\n\n开始编辑...';
  const tab = createTabRecord({
    name: '未命名',
    fileInfo: getFileType('未命名.md'),
    kind: 'vditor',
    content,
    isMarkdown: true
  });
  documentTabs.push(tab);
  await activateTab(tab.id);
  scheduleSessionPersist();
  updateStatus('已创建新文档 (未保存)');
}

async function closeTab(id, { force = false } = {}) {
  const index = documentTabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const tab = documentTabs[index];

  if (tab.dirty && !force) {
    const confirmed = confirm(`“${tab.name}”有未保存修改，关闭将丢失。是否继续？`);
    if (!confirmed) return;
  }

  const wasActive = tab.id === activeTabId;
  if (wasActive && tab.kind === 'viewer') {
    await closeLargeFileViewer();
  }

  documentTabs.splice(index, 1);

  if (!wasActive) {
    renderTabs();
    scheduleSessionPersist();
    return;
  }

  const next = documentTabs[index] || documentTabs[index - 1] || null;
  activeTabId = null;
  if (next) {
    await activateTab(next.id);
  } else {
    renderTabs();
    await createNewTab();
  }
  scheduleSessionPersist();
}

// ── 快速打开（Ctrl/Cmd+P）──────────────────────────────

const RECENT_FILES_KEY = 'markedit-recent-files';
const QUICK_OPEN_MAX_ITEMS = 3000;

function getRecentFiles() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_FILES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((path) => typeof path === 'string') : [];
  } catch {
    return [];
  }
}

function rememberRecentFile(path) {
  if (!path) return;
  const next = [path, ...getRecentFiles().filter((entry) => entry !== path)].slice(0, 30);
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(next));
  } catch {
    /* 忽略配额错误 */
  }
}

async function scanQuickOpenFiles(dirPath, depth, output) {
  if (!dirPath || depth > 4 || output.length >= QUICK_OPEN_MAX_ITEMS) return;
  let entries = [];
  try {
    entries = await readDir(dirPath);
  } catch {
    return;
  }
  const directories = entries.filter((entry) => entry.isDirectory);
  const files = entries.filter((entry) => !entry.isDirectory && isSupportedFileName(entry.name));
  for (const file of files) {
    if (output.length >= QUICK_OPEN_MAX_ITEMS) return;
    try {
      output.push({ kind: 'file', name: file.name, path: await join(dirPath, file.name) });
    } catch {
      /* 忽略无法拼接的路径 */
    }
  }
  for (const directory of directories.sort((a, b) => a.name.localeCompare(b.name))) {
    if (output.length >= QUICK_OPEN_MAX_ITEMS) return;
    try {
      await scanQuickOpenFiles(await join(dirPath, directory.name), depth + 1, output);
    } catch {
      /* 忽略不可访问目录 */
    }
  }
}

function getQuickCommands() {
  return [
    { kind: 'command', command: 'new', name: '新建文档', path: 'Ctrl/Cmd+N' },
    { kind: 'command', command: 'open-file', name: '打开文件', path: 'Ctrl/Cmd+O' },
    { kind: 'command', command: 'open-folder', name: '打开文件夹', path: '工作区' },
    { kind: 'command', command: 'toggle-theme', name: '切换主题', path: '亮色 / 暗色' },
    { kind: 'command', command: 'settings', name: '打开设置', path: '偏好设置' }
  ];
}

function fuzzyScore(text, query) {
  if (!query) return 0;
  const source = String(text).toLowerCase();
  const needle = String(query).toLowerCase();
  let start = 0;
  let score = 0;
  let streak = 0;
  for (const char of needle) {
    const index = source.indexOf(char, start);
    if (index < 0) return -1;
    score += 20 - Math.min(15, index - start);
    streak = index === start ? streak + 1 : 0;
    score += streak * 3;
    start = index + 1;
  }
  return score - source.length * 0.01;
}

async function openQuickOpen() {
  const overlay = document.getElementById('quickOpen');
  const input = document.getElementById('quickOpenInput');
  if (!overlay || !input) return;

  const items = [];
  for (const tab of documentTabs) {
    items.push({ kind: 'tab', name: tab.name, path: tab.path || '', tabId: tab.id });
  }

  for (const path of getRecentFiles()) {
    const name = path.split(/[\\/]/).pop() || path;
    items.push({ kind: 'file', name, path, recent: true });
  }

  if (currentWatchedDir) {
    await scanQuickOpenFiles(currentWatchedDir, 0, items);
  }
  items.push(...getQuickCommands());

  const seen = new Set();
  quickOpenItems = items.filter((item) => {
    const key = item.kind === 'command'
      ? `command:${item.command}`
      : item.kind === 'tab'
        ? `tab:${item.tabId}`
        : `file:${item.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  quickOpenFiltered = quickOpenItems.slice(0, 500);
  quickOpenIndex = 0;

  overlay.hidden = false;
  input.value = '';
  renderQuickOpen();
  input.focus();
}

function closeQuickOpen() {
  const overlay = document.getElementById('quickOpen');
  if (overlay) overlay.hidden = true;
}

function renderQuickOpen() {
  const list = document.getElementById('quickOpenList');
  if (!list) return;
  list.replaceChildren();

  if (quickOpenFiltered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'quick-open__empty';
    empty.textContent = '没有匹配的文件或标签页';
    list.appendChild(empty);
    return;
  }

  quickOpenIndex = Math.max(0, Math.min(quickOpenIndex, quickOpenFiltered.length - 1));
  quickOpenFiltered.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = `quick-open__item${index === quickOpenIndex ? ' active' : ''}`;

    const kind = document.createElement('span');
    kind.className = 'quick-open__kind';
    kind.textContent = item.kind === 'tab' ? 'TAB' : item.kind === 'command' ? 'CMD' : item.recent ? 'RECENT' : 'FILE';

    const name = document.createElement('span');
    name.className = 'quick-open__name';
    name.textContent = item.name;

    const path = document.createElement('span');
    path.className = 'quick-open__path';
    path.textContent = item.path || '未保存';

    row.append(kind, name, path);
    row.addEventListener('mouseenter', () => {
      quickOpenIndex = index;
      list.querySelectorAll('.quick-open__item').forEach((el, i) => {
        el.classList.toggle('active', i === index);
      });
    });
    row.addEventListener('click', () => void openQuickItem(item));
    list.appendChild(row);
  });
}

function updateQuickOpenFilter() {
  const input = document.getElementById('quickOpenInput');
  if (!input) return;
  const raw = input.value.trim();
  const commandMode = raw.startsWith('>');
  const query = (commandMode ? raw.slice(1) : raw).trim().toLowerCase();

  let candidates = quickOpenItems;
  if (commandMode) candidates = candidates.filter((item) => item.kind === 'command');

  quickOpenFiltered = candidates
    .map((item) => ({
      item,
      score: query ? fuzzyScore(`${item.name} ${item.path}`, query) : 0
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 500)
    .map((entry) => entry.item);
  quickOpenIndex = 0;
  renderQuickOpen();
}

async function executeQuickCommand(command) {
  if (command === 'new') await createNewTab();
  else if (command === 'open-file') document.getElementById('btnOpen')?.click();
  else if (command === 'open-folder') document.getElementById('btnOpenFolder')?.click();
  else if (command === 'toggle-theme') document.getElementById('btnTheme')?.click();
  else if (command === 'settings') document.getElementById('btnSettings')?.click();
}

async function openQuickItem(item) {
  closeQuickOpen();
  try {
    if (item.kind === 'command') {
      await executeQuickCommand(item.command);
    } else if (item.kind === 'tab') {
      await activateTab(item.tabId);
    } else {
      await loadFileIntoEditor(item.path);
    }
  } catch (error) {
    console.error('快速打开失败:', error);
    updateStatus(`打开失败: ${error}`);
  }
}

/**
 * 统一的文件加载入口（方案 v2 §4.1，所有打开路径收敛于此）。
 * 流程：size() 守卫（读取前）→ 按阈值选择引擎：
 *   - > HUGE_FILE_LIMIT：Rust 只读日志查看器（不把全文读进 JS）
 *   - ≥ LARGE_FILE_MODE_THRESHOLD：CodeMirror 6 纯文本编辑
 *   - 否则：Vditor 引擎（Markdown 即时渲染；plain/code 已由 CM6 接管）
 * @returns {Promise<{text: string, bytes: number}|null>} 成功返回内容信息，失败/取消返回 null
 */
async function loadFileIntoEditor(filePath) {
  try {
    const existingTab = findTabByPath(filePath);
    if (existingTab) {
      await activateTab(existingTab.id);
      return { text: existingTab.content, bytes: existingTab.byteLen };
    }

    snapshotActiveTab();
    switchingTab = true;

    // 1. 大小守卫（必须在读取前判定，否则守卫无意义）
    let bytes = null;
    try {
      bytes = await fileSize(filePath);
    } catch (sizeError) {
      // 权限/平台异常时降级为"未知大小"，按常规路径打开（行为同现状，不会更糟）
      console.warn('⚠️ 获取文件大小失败，按常规路径打开:', sizeError);
    }

    // 大小未知：先让 Rust 侧 metadata 判断模式，避免盲目 readTextFile 把超大文件读进 JS。
    if (bytes === null) {
      let probe;
      try {
        probe = await invoke('large_file_probe', { path: filePath });
      } catch (error) {
        console.warn('⚠️ 无法确认文件大小，已取消打开:', error);
        updateStatus('无法确认文件大小，已取消打开');
        alert(`无法确认文件大小，已取消打开：${error?.message || error}`);
        return null;
      }
      bytes = probe.size;
      if (probe.mode === 'readOnly') {
        return await loadReadOnlyViewerFile(filePath, probe.size);
      }
    }

    // 超过编辑上限：不再拒绝，交给 Rust 只读引擎分块读取（不会把 1GB 读进 JS）
    if (bytes !== null && bytes > HUGE_FILE_LIMIT) {
      return await loadReadOnlyViewerFile(filePath, bytes);
    }

    await closeLargeFileViewer();

    const useLargeMode = bytes !== null && bytes >= LARGE_FILE_MODE_THRESHOLD;
    if (useLargeMode) {
      // 先给出可见提示并让出一帧，再进入重操作（同步渲染期间无法再绘制 UI）
      updateStatus(`正在打开大文件（${(bytes / 1048576).toFixed(1)} MB）…`);
      await frame();
    }

    // 2. 读取文本（O(n)，非渲染，memcpy 级）
    console.log(`尝试读取文件: ${filePath}`);
    const text = await readTextFile(filePath);
    const byteLen = new TextEncoder().encode(text).length;   // 与实测口径统一的字节数
    const prevByteLen = lastLoadedByteLen;                   // 旧文档大小（决定模式切换前是否先释放旧内容）
    console.log(`成功读取文件，字节: ${byteLen}`);

    const fileName = await basename(filePath);
    const fileInfo = getFileType(fileName);
    const editorMode = getEditorMode(fileName);
    // 先更新文件类型，后续模式切换（switchEditorMode）会据此决定预览面板显隐
    currentFileIsMarkdown = isMarkdownFile(fileName);

    console.log(`📁 文件类型: ${fileInfo.name}`);
    console.log(`📝 编辑器模式: ${editorMode}`);

    // 3. 引擎选择：非 Markdown 文本统一走 CodeMirror（纯文本 + 语法高亮），
    //    避免 Vditor 把代码按 Markdown 解析（缩进会被吃掉）；Markdown 仅在超大时才降级为纯文本
    const isLarge = useLargeMode || byteLen >= LARGE_FILE_MODE_THRESHOLD;

    dropPristineUntitledTab();
    const tabKind = (isLarge || !currentFileIsMarkdown) ? 'cm6' : 'vditor';
    const tab = createTabRecord({
      path: filePath,
      name: fileName,
      fileInfo,
      kind: tabKind,
      content: text,
      byteLen,
      isMarkdown: currentFileIsMarkdown
    });
    documentTabs.push(tab);
    activeTabId = tab.id;
    syncTabGlobals(tab);
    renderTabs();

    if (isLarge || !currentFileIsMarkdown) {
      await enterLargeFileMode(text, filePath, byteLen, { large: isLarge });
    } else {
      await exitLargeFileModeIfActive();
      if (editorInstance) {
        // 旧文档是大文件（可能正以富文本兑底方式驻留在 Vditor 中，且模式可能不同）：
        // 必须先释放旧内容，否则紧随其后的模式切换会让 vditor 对旧大文档做全量重渲染（可达数十秒冻结）
        if (prevByteLen >= LARGE_FILE_MODE_THRESHOLD) {
          editorInstance.setValue('');
        }
        const targetMode = 'ir';
        if (editorInstance.getCurrentMode && editorInstance.getCurrentMode() !== targetMode) {
          switchEditorMode(targetMode);
        }
        editorInstance.setValue(String(text || ''));
        updateWordCount(String(text || ''));
        adjustEditorForFileType(fileName);
        // 已在 SV 模式下打开新文件时不会再走 switchEditorMode，这里补一次预览面板策略
        applyPreviewModeForCurrentFile();
      }
    }

    currentFilePath = filePath;
    lastLoadedByteLen = byteLen;   // 成功打开后才提交门阔状态（失败路径不污染）

    // 4. 界面与侧边栏（根目录未设置时才定位到文件所在目录，之后保持不变）
    updateFileInfoDisplay(fileName, fileInfo);
    if (!currentWatchedDir) {
      const dirPath = await dirname(filePath);
      await populateFileList(dirPath, fileName);
      startDirWatch(dirPath);
    } else {
      updateFileListActive(filePath);
    }

    updateStatus(isLarge
      ? `大文件模式：${fileName}（${(byteLen / 1024).toFixed(0)} KB）`
      : '就绪');
    updateDocumentStatus();
    rememberRecentFile(filePath);
    scheduleSessionPersist();
    return { text, bytes: byteLen };
  } catch (error) {
    console.error('❌ 打开文件失败:', error);
    updateStatus(`打开文件失败: ${error}`);
    alert(`无法打开文件: ${error}\n路径: ${normalizeIncomingFilePath(filePath) || filePath}`);
    return null;
  } finally {
    switchingTab = false;
  }
}

// ── 大文件模式（CodeMirror 6 引擎，方案 v2 §4.2）──────────────────────

/** 让出一帧：先绘制状态提示，再进入同步阻塞操作 */
function frame(ms = 60) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureLargeFileEditor() {
  if (!largeFileEditor) {
    // 动态 import：CM6 不进首屏 bundle（评审 P3，实测主 chunk 879KB→328KB）
    const { LargeFileEditor } = await import('./large-file-editor.js');
    largeFileEditor = new LargeFileEditor(document.getElementById('largeFileEditor'));
    largeFileEditor.setOnCursorChange(() => updateDocumentStatus());
    largeFileEditor.setOnChange(() => {
      markActiveTabDirty();
      // 大文档打开时已做一次性统计，输入期间不再 O(n) 扫描
      if (!largeFileMode || largeFileIsLarge) return;
      clearTimeout(textWordCountTimer);
      textWordCountTimer = setTimeout(() => {
        if (largeFileMode && !largeFileIsLarge) updateWordCount();
      }, 300);
    });
  }
  return largeFileEditor;
}

/** 打开只读日志查看器并更新文件信息/侧边栏。 */
async function loadReadOnlyViewerFile(filePath, size) {
  const fileName = await basename(filePath);
  const fileInfo = getFileType(fileName);
  currentFileIsMarkdown = isMarkdownFile(fileName);

  dropPristineUntitledTab();
  const tab = createTabRecord({
    path: filePath,
    name: fileName,
    fileInfo,
    kind: 'viewer',
    content: '',
    byteLen: size,
    isMarkdown: currentFileIsMarkdown
  });
  documentTabs.push(tab);
  activeTabId = tab.id;
  syncTabGlobals(tab);
  renderTabs();

  try {
    await openLargeFileViewer(filePath);
  } catch (error) {
    documentTabs = documentTabs.filter((item) => item.id !== tab.id);
    activeTabId = null;
    renderTabs();
    throw error;
  }

  currentFilePath = filePath;
  lastLoadedByteLen = size;
  updateFileInfoDisplay(fileName, fileInfo);
  if (!currentWatchedDir) {
    const dirPath = await dirname(filePath);
    await populateFileList(dirPath, fileName);
    startDirWatch(dirPath);
  } else {
    updateFileListActive(filePath);
  }
  updateDocumentStatus();
  rememberRecentFile(filePath);
  scheduleSessionPersist();
  return { text: '', bytes: size };
}

/**
 * 打开超大文件（> 20MB）的只读日志查看器。
 * 文件内容完全由 Rust 引擎按块读取，前端不持有全文。
 */
async function openLargeFileViewer(filePath) {
  await exitLargeFileModeIfActive();

  if (editorInstance) {
    editorInstance.setValue('');
    const vditorContainer = document.getElementById('vditor-container');
    if (vditorContainer) vditorContainer.style.display = 'none';
  }
  removeFileTypeHint();
  setLargeOutlineVisible(false);

  try {
    if (!logViewer) {
      const { LargeFileViewer } = await import('./large-file-viewer.js');
      logViewer = new LargeFileViewer(document.getElementById('logViewer'), {
        onStatus: (text) => {
          if (text) updateStatus(text);
        }
      });
    }

    await logViewer.open(filePath);
    logViewerActive = true;
    setWordCountDisplay('—', '—');
  } catch (error) {
    if (logViewer) {
      try {
        await logViewer.close();
      } catch {
        /* 忽略清理失败 */
      }
    }
    const vditorContainer = document.getElementById('vditor-container');
    if (vditorContainer) vditorContainer.style.display = '';
    const message =
      error && typeof error === 'object'
        ? error.message || error.code || JSON.stringify(error)
        : String(error);
    throw new Error(message);
  }
}

/** 关闭只读日志查看器并恢复 Vditor 容器。 */
async function closeLargeFileViewer() {
  if (!logViewerActive) return;
  logViewerActive = false;
  if (logViewer) {
    try {
      await logViewer.close();
    } catch (error) {
      console.warn('⚠️ 关闭日志查看器失败:', error);
    }
  }
  const vditorContainer = document.getElementById('vditor-container');
  if (vditorContainer) vditorContainer.style.display = '';
}

/**
 * 文本引擎入口（CodeMirror）：大文件、以及全部非 Markdown 文本 / 代码文件。
 * options.large 决定横幅、「用富文本打开」按钮、一次性字数统计等大文件专属行为。
 */
async function enterLargeFileMode(text, filePath, byteLen, { large = true } = {}) {
  largeFileMode = true;
  largeFileIsLarge = large;
  const session = ++largeFileSession;   // 会话令牌：区分一次性统计归属，防止大→大快速切换时旧统计覆盖新文档

  // 1. Vditor 容器隐藏并清空内容（实例保留避免重建成本，同时释放旧文档内存）
  if (editorInstance) {
    editorInstance.setValue('');
    document.getElementById('vditor-container').style.display = 'none';
  }

  // 文本引擎下提示职责由横幅（大文件）或状态栏（普通文本）承担，
  // 未清除的旧提示条会错位悬浮在编辑区顶部
  removeFileTypeHint();

  // 2. 显示文本编辑区并填充（O(n) 字符串操作，无 Markdown 解析、无全量 DOM）
  const lfe = await ensureLargeFileEditor();
  const fileName = String(filePath || '').split(/[\\/]/).pop() || '';
  lfe.setLanguage(currentFileIsMarkdown ? 'markdown' : getFileLanguage(fileName));
  lfe.setTheme(document.documentElement.getAttribute('data-theme') === 'dark');
  lfe.show();
  lfe.setValue(text, byteLen);

  // 3. 横幅只给大文件；「用富文本打开」只对 Markdown 大文件有意义
  const banner = document.getElementById('largeFileBanner');
  if (banner) banner.hidden = !large;
  const richBtn = document.getElementById('btnRichTextMode');
  if (richBtn) richBtn.hidden = !(large && currentFileIsMarkdown);

  // 4. 字数：大文件首帧后做一次性统计；普通文本文件按当前内容即时统计
  if (large) {
    setTimeout(() => {
      if (largeFileMode && session === largeFileSession) oneTimeWordCount(text);
    }, 0);
  } else {
    updateWordCount(text);
  }

  // 5. 大纲：仅 Markdown 有意义；代码/纯文本不渲染 Markdown 标题结构
  if (currentFileIsMarkdown) {
    renderLargeFileOutline(text);
  } else {
    setLargeOutlineVisible(false);
  }
}

/** 退出文本引擎，恢复 Vditor 容器（Markdown 编辑器） */
async function exitLargeFileModeIfActive() {
  if (!largeFileMode) return;
  largeFileMode = false;
  largeFileIsLarge = false;
  clearTimeout(textWordCountTimer);
  const banner = document.getElementById('largeFileBanner');
  if (banner) banner.hidden = true;
  setLargeOutlineVisible(false);
  if (largeFileEditor) {
    largeFileEditor.setValue('');   // 释放 CM6 持有的文档内存（含撤销栈），避免大文本长期驻留
    largeFileEditor.hide();
  }
  const vc = document.getElementById('vditor-container');
  if (vc) vc.style.display = '';
}

/** 大文件大纲显隐的唯一入口：同步面板与编辑区宿主的让位（避免悬浮面板遮盖正文） */
function setLargeOutlineVisible(visible) {
  const panel = document.getElementById('largeFileOutline');
  if (panel) panel.hidden = !visible;
  const host = document.getElementById('largeFileEditor');
  if (host) host.classList.toggle('with-outline', visible);
}

/** 值读取统一抽象：保存/导出路径的唯一分支点 */
function getEditorValue() {
  if (logViewerActive) return '';
  if (largeFileMode && largeFileEditor) return largeFileEditor.getValue();
  return editorInstance ? editorInstance.getValue() : '';
}

/**
 * 导出 HTML：大文件模式下按需渲染（用户主动操作才付出全量渲染成本）
 */
async function getHtmlForExport() {
  if (largeFileMode && !currentFileIsMarkdown) {
    // 代码/纯文本导出为转义后的 <pre>，不按 Markdown 渲染
    const escaped = getEditorValue()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre><code>${escaped}</code></pre>`;
  }
  if (!largeFileMode) return editorInstance.getHTML();
  updateStatus('大文件模式：正在渲染 HTML（大文档可能较慢），请稍候…');
  await frame();
  const holder = document.createElement('div');
  // vditor.preview 内部脚本（mermaid/katex 等）加载失败时会 reject 且不调用 after：
  // 必须接住拒绝并加超时，否则导出无声挂死
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('HTML 渲染超时')), 120000);
    Promise.resolve(Vditor.preview(holder, getEditorValue(), {
      cdn: '/vditor',
      speech: { enable: false }
    })).then(() => {
      clearTimeout(timer);
      resolve();
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  updateStatus('HTML 渲染完成');
  return holder.innerHTML;
}

/**
 * 编辑模式切换：vditor 3.11.2 无 setMode 公开 API（原代码调用会 TypeError），
 * 通过内置 edit-mode 子菜单按钮触发；兑底：内置快捷键 Ctrl/Cmd+Alt+8/9
 *
 * 方案 A：仅保留即时渲染（IR）与分屏预览（SV），wysiwyg 已移除，见 disableWysiwygMode()
 */
function switchEditorMode(mode) {
  if (!editorInstance) return false;
  if (mode === 'wysiwyg') {
    console.warn('⚠️ 所见即所得模式已移除，仅支持即时渲染 / 分屏预览');
    return false;
  }
  if (editorInstance.getCurrentMode && editorInstance.getCurrentMode() === mode) return true;

  const editBtn = document.querySelector('.vditor-toolbar [data-type="edit-mode"]');
  const panel = editBtn ? editBtn.parentElement : null;
  const targetBtn = panel ? panel.querySelector(`button[data-mode="${mode}"]`) : null;
  if (targetBtn) {
    targetBtn.click();
    applyPreviewModeForCurrentFile();
    return true;
  }

  try {
    editorInstance.focus();
    const digit = mode === 'sv' ? '9' : '8';
    // vditor 的 keydown 监听绑在内层可编辑元素上；DOM 事件只向上冒泡，
    // 派发到外层 .vditor-content 永远到不了监听器
    const host = document.querySelector('.vditor-content [contenteditable="true"]')
      || document.querySelector('.vditor-content');
    if (host) {
      host.dispatchEvent(new KeyboardEvent('keydown', {
        key: digit, code: `Digit${digit}`, altKey: true, ctrlKey: true, bubbles: true, cancelable: true
      }));
      applyPreviewModeForCurrentFile();
      return true;
    }
  } catch (e) {
    console.warn('⚠️ switchEditorMode 兑底快捷键失败:', e);
  }
  console.warn('⚠️ switchEditorMode 未能定位模式切换入口:', mode);
  return false;
}

/**
 * SV 模式预览面板策略：Markdown 显示左侧源码 + 右侧预览；
 * 纯文本 / 代码文件只看源码（内容不是 Markdown，预览没有意义，还可能把 <div> 等当 HTML 渲染）。
 * 注意：Vditor 的 setPreviewMode 会把 SV 容器置为 display:block，
 * 因此只能在当前已经是 SV 时调用，否则会在 IR 模式下错误地把源码面板显示出来。
 */
function applyPreviewModeForCurrentFile() {
  if (!editorInstance || typeof editorInstance.setPreviewMode !== 'function') return;
  if (typeof editorInstance.getCurrentMode !== 'function') return;
  if (editorInstance.getCurrentMode() !== 'sv') return;
  editorInstance.setPreviewMode(currentFileIsMarkdown ? 'both' : 'editor');
}

/**
 * 方案 A：移除 Vditor 内置的“所见即所得”模式入口。
 * 1. 删掉 edit-mode 子菜单里的 wysiwyg 按钮（按钮由 Vditor 生成，无法通过配置关闭）；
 * 2. 在捕获阶段拦截 Ctrl/Cmd+Alt+7 —— Vditor 把该快捷键直接绑在内层可编辑元素上，
 *    仅隐藏按钮仍可通过快捷键切到已移除的模式。
 */
function disableWysiwygMode() {
  const editBtn = document.querySelector('.vditor-toolbar [data-type="edit-mode"]');
  const panel = editBtn ? editBtn.parentElement : null;
  const wysiwygBtn = panel ? panel.querySelector('button[data-mode="wysiwyg"]') : null;
  if (wysiwygBtn) {
    wysiwygBtn.remove();
  }

  document.addEventListener('keydown', (event) => {
    if (!event.altKey || event.shiftKey) return;
    if (!event.ctrlKey && !event.metaKey) return;
    if (event.code !== 'Digit7' && event.key !== '7') return;
    event.preventDefault();
    event.stopPropagation();
    updateStatus('所见即所得模式已移除，请使用即时渲染或分屏预览');
  }, true);
}

/**
 * 模式菜单 / 快捷键切换后同步预览面板策略。
 * 菜单按钮的点击由 Vditor 内部处理，不经过 switchEditorMode，所以需要单独挂监听；
 * 内置 Ctrl/Cmd+Alt+9 同理，且不能在捕获阶段拦截，只能在同一轮事件结束后补一次。
 */
function bindPreviewModeToModeSwitch() {
  const editBtn = document.querySelector('.vditor-toolbar [data-type="edit-mode"]');
  const panel = editBtn ? editBtn.parentElement : null;
  if (panel) {
    panel.querySelectorAll('button[data-mode]').forEach((btn) => {
      // Vditor 的点击处理器先注册，此处后执行，此时模式已经切换完成
      btn.addEventListener('click', () => applyPreviewModeForCurrentFile());
    });
  }

  document.addEventListener('keydown', (event) => {
    if (!event.altKey || event.shiftKey) return;
    if (!event.ctrlKey && !event.metaKey) return;
    if (event.code !== 'Digit9') return;
    setTimeout(applyPreviewModeForCurrentFile, 0);
  }, true);
}

/** 大文件模式大纲：逐行扫描提取标题（排除代码围栏内的 # 行；CRLF 安全；均摊 O(n)） */
function renderLargeFileOutline(text) {
  const panel = document.getElementById('largeFileOutline');
  const list = document.getElementById('largeFileOutlineList');
  if (!panel || !list) return;

  const OUTLINE_MAX = 500;
  const headings = [];
  let truncated = false;
  const lines = text.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*(```|~~~)/.test(raw)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^(#{1,6}) (.+)$/.exec(raw);
    if (m) {
      if (headings.length >= OUTLINE_MAX) { truncated = true; break; }
      headings.push({
        level: m[1].length,
        text: m[2].replace(/\r$/, '').slice(0, 80),
        line: i
      });
    }
  }

  list.innerHTML = '';
  headings.forEach(h => {
    const item = document.createElement('div');
    item.className = 'large-file-outline__item';
    item.setAttribute('data-level', String(h.level));
    item.textContent = h.text;
    item.title = h.text;
    item.addEventListener('click', () => {
      if (largeFileEditor) largeFileEditor.focusLine(h.line);
    });
    list.appendChild(item);
  });
  if (truncated) {
    const hint = document.createElement('div');
    hint.className = 'large-file-outline__item';
    hint.textContent = `（仅显示前 ${OUTLINE_MAX} 条）`;
    list.appendChild(hint);
  }
  setLargeOutlineVisible(headings.length > 0);
}

// 全局禁用浏览器默认右键菜单（侧边栏文件列表由自定义菜单接管）
document.addEventListener('contextmenu', (e) => {
  // 仅允许编辑器内容区域（Vditor 输入区）保留右键（用于复制粘贴等）
  const isEditorContent = e.target.closest('.vditor-ir, .vditor-sv, .vditor-wysiwyg');
  if (!isEditorContent) {
    e.preventDefault();
  }
});

// 监听全局点击以隐藏右键菜单
document.addEventListener('click', (e) => {
  const menu = document.getElementById('contextMenu');
  if (menu && menu.style.display === 'block') {
    menu.style.display = 'none';
  }
});

function showContextMenu(x, y, path, name) {
  const menu = document.getElementById('contextMenu');
  if (!menu) return;

  contextTargetFile = { path, name };
  console.log('🔍 showContextMenu: 设置 contextTargetFile =', { path, name });
  menu.style.display = 'block';

  const rect = menu.getBoundingClientRect();
  let px = x;
  let py = y;

  if (x + rect.width > window.innerWidth) px = window.innerWidth - rect.width;
  if (y + rect.height > window.innerHeight) py = window.innerHeight - rect.height;

  menu.style.left = `${px}px`;
  menu.style.top = `${py}px`;
}

function hideSplash() {
  // 关闭原生 Tauri splashscreen 窗口 + 显示主窗口
  invoke('close_splashscreen').catch(() => {
    console.log('ℹ️ 非 Tauri 环境，跳过原生 splash 关闭');
  });
  // 同时移除 CSS 内嵌的 splash（dev 模式兜底）
  const splash = document.getElementById('splashScreen');
  if (splash) {
    splash.classList.add('hidden');
    setTimeout(() => splash.remove(), 500);
  }
}

function initializeApp() {
  console.log('✅ 初始化应用');

  loadAppSettings();
  applyThemePreference(appSettings.theme);
  applyFontSizes();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (appSettings.theme === 'system') applyThemePreference('system');
  });

  setupMacOSFileOpenSupport();

  // 先绑定事件监听器（UI 骨架已经可交互）
  setupEventListeners();
  void setupWindowControls();
  void setupWindowState();
  void setupFileDrop();
  void setupCloseGuard();
  setupGlobalShortcuts();
  populateFileList();

  // 异步初始化 Vditor 编辑器
  initVditor().then(async () => {
    console.log('🎉 编辑器初始化完成');
    applyThemePreference(appSettings.theme);
    applyFontSizes();
    updateStatus('应用已就绪');

    // 恢复上次会话；没有会话时创建默认未命名标签
    const restored = await restoreSession();
    if (!restored) ensureInitialTab();
    hideSplash();

    // 处理通过命令行打开的文件
    handleInitialFile();
  }).catch(err => {
    console.error('❌ 编辑器初始化失败:', err);
    updateStatus('编辑器初始化失败');
    hideSplash();
  });

  // 安全兜底：10 秒后强制隐藏 splash
  setTimeout(hideSplash, 10000);
}

// 填充并刷新文件列表
function isSupportedFileName(name) {
  const parts = name.split('.');
  if (parts.length < 2) {
    return ['Dockerfile', 'Makefile', 'dockerfile', 'makefile'].includes(name);
  }
  const extension = parts[parts.length - 1].toLowerCase();
  return getSupportedExtensions().includes(extension);
}

async function renderFileTree(dirPath, container, activeFileName, depth = 0) {
  const entries = await readDir(dirPath);
  const directories = entries
    .filter((entry) => entry.isDirectory)
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = entries
    .filter((entry) => !entry.isDirectory && isSupportedFileName(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const directory of directories) {
    const folder = document.createElement('div');
    folder.className = 'file-tree-folder';
    folder.style.paddingLeft = `${8 + depth * 14}px`;

    const chevron = document.createElement('span');
    chevron.className = 'file-tree-chevron';
    chevron.textContent = '▸';
    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = '📁';
    const label = document.createElement('span');
    label.className = 'file-name';
    label.textContent = directory.name;
    folder.append(chevron, icon, label);

    const children = document.createElement('div');
    children.className = 'file-tree-children';
    folder.addEventListener('click', async () => {
      const expanded = children.classList.toggle('expanded');
      chevron.textContent = expanded ? '▾' : '▸';
      if (expanded && !children.dataset.loaded) {
        children.dataset.loaded = '1';
        const childPath = await join(dirPath, directory.name);
        await renderFileTree(childPath, children, activeFileName, depth + 1);
      }
    });
    container.append(folder, children);
  }

  for (const file of files) {
    const el = document.createElement('div');
    const isActive = file.name === activeFileName;
    el.className = `file-item ${isActive ? 'active' : ''}`;
    el.style.paddingLeft = `${8 + depth * 14}px`;

    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = getFileIcon(file.name);
    const name = document.createElement('span');
    name.className = 'file-name';
    name.title = file.name;
    name.textContent = file.name;
    el.dataset.path = await join(dirPath, file.name);
    const badge = document.createElement('span');
    badge.className = 'file-type-badge';
    badge.textContent = getFileType(file.name).name;
    el.append(icon, name, badge);

    el.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const filePath = await join(dirPath, file.name);
      showContextMenu(e.clientX, e.clientY, filePath, file.name);
    });
    el.addEventListener('click', async () => {
      try {
        const filePath = await join(dirPath, file.name);
        const result = await loadFileIntoEditor(filePath);
        if (result) {
          updateFileListActive(filePath);
        }
      } catch (error) {
        console.error('❌ 读取文件失败:', error);
        updateStatus(`读取文件失败: ${error}`);
      }
    });
    container.appendChild(el);
  }
}

async function populateFileList(dirPath, activeFileName) {
  const fileList = document.getElementById('fileList');
  const sidebarFolder = document.getElementById('sidebarFolder');
  const folderNameSpan = document.getElementById('folderName');
  if (!fileList) return;

  if (!dirPath) {
    fileList.innerHTML = '<div style="padding: 15px; color: var(--text-secondary, #666); text-align: center; font-size: 13px;">请打开文件或文件夹以显示列表</div>';
    if (sidebarFolder) sidebarFolder.style.display = 'none';
    return;
  }

  try {
    const folderName = await basename(dirPath);
    if (sidebarFolder && folderNameSpan) {
      sidebarFolder.style.display = 'flex';
      folderNameSpan.textContent = folderName;
    }

    fileList.innerHTML = '';
    await renderFileTree(dirPath, fileList, activeFileName, 0);
    if (fileList.childElementCount === 0) {
      fileList.innerHTML = '<div style="padding: 15px; color: var(--text-secondary, #666); text-align: center; font-size: 13px;">此文件夹没有对应的文本文件</div>';
    }
  } catch (error) {
    console.error('❌ 读取目录失败:', error);
  }
}

// ── 目录变化监视（轮询）──────────────────────────────────────

/**
 * 停止当前目录监视
 */
function stopDirWatch() {
  if (dirWatchInterval !== null) {
    clearInterval(dirWatchInterval);
    dirWatchInterval = null;
  }
  currentWatchedDir = null;
  lastFileSnapshot = new Set();
}

/**
 * 启动对 dirPath 的轮询监视（每 2 秒检查一次文件列表变化）。
 * 若已在监视同一目录则不重新创建定时器。
 * @param {string} dirPath 要监视的目录绝对路径
 */
async function startDirWatch(dirPath) {
  if (!dirPath) { stopDirWatch(); return; }

  // 同目录无需重置定时器
  if (dirPath === currentWatchedDir && dirWatchInterval !== null) return;

  // 先停止旧的监视
  if (dirWatchInterval !== null) clearInterval(dirWatchInterval);

  currentWatchedDir = dirPath;

  // 初始化快照
  try {
    const entries = await readDir(dirPath);
    lastFileSnapshot = new Set(entries.filter(e => !e.isDirectory).map(e => e.name));
  } catch (_) {
    lastFileSnapshot = new Set();
  }

  const supportedExtensions = getSupportedExtensions();
  const specialFiles = new Set(['Dockerfile', 'Makefile', 'dockerfile', 'makefile']);

  const isSupportedFile = (name) => {
    const parts = name.split('.');
    if (parts.length < 2) return specialFiles.has(name);
    return supportedExtensions.includes(parts[parts.length - 1].toLowerCase());
  };

  dirWatchInterval = setInterval(async () => {
    // 不再监视同一目录时自动停止
    if (currentWatchedDir !== dirPath) { clearInterval(dirWatchInterval); dirWatchInterval = null; return; }

    try {
      const entries = await readDir(dirPath);
      const currentFiles = new Set(
        entries.filter(e => !e.isDirectory && isSupportedFile(e.name)).map(e => e.name)
      );

      // 对比快照
      const changed =
        currentFiles.size !== lastFileSnapshot.size ||
        [...currentFiles].some(name => !lastFileSnapshot.has(name)) ||
        [...lastFileSnapshot].some(name => !currentFiles.has(name));

      if (changed) {
        lastFileSnapshot = currentFiles;
        const activeFileName = currentFilePath ? await basename(currentFilePath) : null;
        await populateFileList(dirPath, activeFileName);
        console.log('🔄 侧边栏文件列表已自动刷新');
      }
    } catch (_) {
      // 目录不可访问时静默忽略
    }
  }, 2000);
}

// ── 以上为目录监视逻辑 ──────────────────────────────────────

// 初始化Vditor编辑器
function initVditor() {
  return new Promise((resolve) => {
    const defaultContent = `# 欢迎使用 MarkEdit

这是一个轻量级的Markdown编辑器。

## 功能
- 三种编辑模式：源码、阅读、所见即所得
- 大纲导航功能
- 文件操作：新建、打开、保存
- 主题切换：浅色/深色模式`;

    editorInstance = new Vditor('vditor-container', {
      height: '100%',
      mode: 'ir',
      theme: 'classic',
      icon: 'material',
      cdn: '/vditor', // 强制指定本地静态挂载目录加载 Lute 引擎和字典
      cache: {
        enable: false,
      },
      value: defaultContent,
      toolbar: [
        'headings', 'bold', 'italic', 'strike', '|',
        'line', 'quote', 'list', 'ordered-list', 'check', '|',
        'code', 'inline-code', '|',
        'link', 'table', '|',
        'undo', 'redo', '|',
        'outline',  // 大纲功能
        {
          name: 'edit-mode',
          tipPosition: 'ne',
          icon: '<svg viewBox="0 0 24 24"><path d="M10 2v20H2V2h8zm12 0h-8v9h8V2zm0 11h-8v9h8v-9z"/></svg>'
        }
      ],
      outline: {
        enable: true,
        position: 'right'
      },
      input: (() => {
        let _timer = null;
        return () => {
          markActiveTabDirty();
          clearTimeout(_timer);
          _timer = setTimeout(() => {
            // 大文档门阔：跳过实时统计（O(全文) 的 getValue + 正则流水线）
            if (largeFileMode || lastLoadedByteLen >= LARGE_FILE_MODE_THRESHOLD) return;
            updateWordCount();
          }, 300);
        };
      })(),
      after: () => {
        console.log('✅ Vditor 编辑器已加载');
        disableWysiwygMode();
        bindPreviewModeToModeSwitch();
        updateWordCount();
        // 初始标签在会话恢复后再创建；此处编辑器已带默认内容。
        // Vditor 渲染完成后才能找到 .vditor-outline，在此时初始化拖动条
        initOutlineResizer();
        resolve();
      }
    });
  });
}

function syncOutlineResizerVisibility(outlineEl, resizerEl) {
  if (!outlineEl || !resizerEl) return;
  const isVisible = getComputedStyle(outlineEl).display !== 'none';
  resizerEl.style.display = isVisible ? 'block' : 'none';
}

// 设置事件监听器
let appWindow = null;

/** Windows 无边框窗口控制；macOS 保留原生标题栏与交通灯。 */
async function snapWindow(mode) {
  if (!appWindow) return;
  try {
    if (mode === 'maximize') {
      await appWindow.maximize();
      return;
    }
    if (mode === 'restore') {
      await appWindow.unmaximize();
      return;
    }
    const monitor = await currentMonitor();
    const scale = await appWindow.scaleFactor();
    if (!monitor) return;
    const work = monitor.workArea;
    const width = work.size.width / scale;
    const height = work.size.height / scale;
    await appWindow.unmaximize();
    await appWindow.setSize(new LogicalSize(width / 2, height));
    await appWindow.setPosition(
      new LogicalPosition(
        work.position.x / scale + (mode === 'right' ? width / 2 : 0),
        work.position.y / scale
      )
    );
  } catch (error) {
    console.warn('分屏失败:', error);
  }
}

async function setupWindowControls() {
  const titlebar = document.getElementById('windowTitlebar');
  if (!titlebar) return;

  const isWindows = navigator.platform.toLowerCase().includes('win');
  if (!isWindows || !('__TAURI_INTERNALS__' in window)) return;

  try {
    appWindow = getCurrentWindow();
    titlebar.hidden = false;
    document.documentElement.classList.add('has-custom-titlebar');
    updateWindowTitle();

    const dragRegion = document.getElementById('windowTitleDrag');
    dragRegion?.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      event.preventDefault();
      if (event.detail === 2) {
        void appWindow.toggleMaximize();
      } else {
        void appWindow.startDragging();
      }
    });

    const resizeHandles = document.getElementById('windowResizeHandles');
    if (resizeHandles) {
      resizeHandles.hidden = false;
      resizeHandles.querySelectorAll('[data-resize]').forEach((handle) => {
        handle.addEventListener('mousedown', (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          void appWindow.startResizeDragging(handle.dataset.resize);
        });
      });
    }

    const minimize = document.getElementById('btnWindowMinimize');
    const maximize = document.getElementById('btnWindowMaximize');
    const close = document.getElementById('btnWindowClose');

    minimize?.addEventListener('click', () => {
      void appWindow.minimize();
    });
    maximize?.addEventListener('click', () => {
      void appWindow.toggleMaximize();
    });
    close?.addEventListener('click', () => {
      void appWindow.close();
    });

    const snapMenu = document.getElementById('snapMenu');
    let snapTimer = null;
    const hideSnapMenu = () => {
      clearTimeout(snapTimer);
      if (snapMenu) snapMenu.hidden = true;
    };
    const showSnapMenu = () => {
      if (!snapMenu || !maximize) return;
      const rect = maximize.getBoundingClientRect();
      snapMenu.hidden = false;
      snapMenu.style.top = `${Math.round(rect.bottom + 4)}px`;
      snapMenu.style.left = `${Math.round(Math.max(4, rect.right - 220))}px`;
    };
    maximize?.addEventListener('mouseenter', () => {
      clearTimeout(snapTimer);
      snapTimer = setTimeout(showSnapMenu, 320);
    });
    maximize?.addEventListener('mouseleave', () => {
      clearTimeout(snapTimer);
      snapTimer = setTimeout(hideSnapMenu, 260);
    });
    snapMenu?.addEventListener('mouseenter', () => clearTimeout(snapTimer));
    snapMenu?.addEventListener('mouseleave', hideSnapMenu);
    snapMenu?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-snap]');
      if (!button) return;
      hideSnapMenu();
      void snapWindow(button.dataset.snap);
    });

    const syncMaximized = async () => {
      if (!appWindow) return;
      try {
        const maximized = await appWindow.isMaximized();
        titlebar.classList.toggle('is-maximized', maximized);
        if (resizeHandles) resizeHandles.hidden = maximized;
        if (maximize) {
          const label = maximized ? '还原' : '最大化';
          maximize.title = label;
          maximize.setAttribute('aria-label', label);
        }
      } catch {
        /* 窗口状态查询失败不影响使用 */
      }
    };

    await syncMaximized();
    await appWindow.onResized(() => {
      void syncMaximized();
    });
  } catch (error) {
    console.warn('窗口控制初始化失败:', error);
    titlebar.hidden = true;
  }
}

let saveInFlight = false;

async function setupFileDrop() {
  if (!('__TAURI_INTERNALS__' in window)) return;
  try {
    const webview = getCurrentWebview();
    await webview.onDragDropEvent(async (event) => {
      if (event.payload.type !== 'drop') return;
      const paths = Array.isArray(event.payload.paths) ? event.payload.paths : [];
      if (paths.length === 0) return;
      updateStatus(`正在打开拖入的 ${paths.length} 个文件…`);
      for (const filePath of paths) {
        try {
          await loadFileIntoEditor(filePath);
        } catch (error) {
          console.warn('拖放打开失败:', filePath, error);
        }
      }
    });
  } catch (error) {
    console.warn('拖放文件初始化失败:', error);
  }
}

const WINDOW_STATE_KEY = 'markedit-window-v1';
const SETTINGS_KEY = 'markedit-settings-v1';
let appSettings = { autosave: true, theme: 'system', fontSize: 13, uiFontSize: 13 };
let windowStateTimer = null;

/** 记住并恢复窗口位置、大小与最大化状态。 */
async function setupWindowState() {
  if (!('__TAURI_INTERNALS__' in window)) return;

  try {
    const win = appWindow || getCurrentWindow();
    appWindow = win;
    const scale = await win.scaleFactor();
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(WINDOW_STATE_KEY) || 'null');
    } catch {
      saved = null;
    }

    const monitor = await currentMonitor();
    const work = monitor?.workArea;
    const maxWidth = work ? work.size.width / scale - 40 : Infinity;
    const maxHeight = work ? work.size.height / scale - 40 : Infinity;

    if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height)) {
      const width = Math.max(800, Math.min(saved.width, maxWidth));
      const height = Math.max(560, Math.min(saved.height, maxHeight));
      await win.setSize(new LogicalSize(width, height));

      if (Number.isFinite(saved.x) && Number.isFinite(saved.y) && work) {
        const minX = work.position.x / scale;
        const minY = work.position.y / scale;
        const x = Math.max(minX, Math.min(saved.x, minX + maxWidth - width));
        const y = Math.max(minY, Math.min(saved.y, minY + maxHeight - height));
        await win.setPosition(new LogicalPosition(x, y));
      }
      if (saved.maximized) await win.maximize();
    }

    const saveState = async () => {
      try {
        const [size, position, factor, maximized] = await Promise.all([
          win.innerSize(),
          win.outerPosition(),
          win.scaleFactor(),
          win.isMaximized()
        ]);
        localStorage.setItem(
          WINDOW_STATE_KEY,
          JSON.stringify({
            width: size.width / factor,
            height: size.height / factor,
            x: position.x / factor,
            y: position.y / factor,
            maximized
          })
        );
      } catch {
        /* 窗口状态保存失败不影响使用 */
      }
    };

    const scheduleSave = () => {
      clearTimeout(windowStateTimer);
      windowStateTimer = setTimeout(() => void saveState(), 500);
    };
    await win.onResized(scheduleSave);
    await win.onMoved(scheduleSave);
    window.addEventListener('beforeunload', () => void saveState());
  } catch (error) {
    console.warn('窗口状态恢复失败:', error);
  }
}

/** 保存当前文档；forceDialog 用于另存为。 */
async function saveActiveDocument({ forceDialog = false, silent = false } = {}) {
  if (saveInFlight) return false;
  if (logViewerActive) {
    if (!silent) updateStatus('只读日志模式不支持保存');
    return false;
  }
  if (largeFileMode && !largeFileEditor) return false;
  if (!largeFileMode && !editorInstance) return false;

  const tab = getActiveTab();
  const content = getEditorValue();
  const targetPath = forceDialog ? null : tab?.path || currentFilePath;

  saveInFlight = true;
  try {
    if (targetPath) {
      await writeTextFile(targetPath, content);
      markTabSaved(tab, content);
      if (tab && tab.id === activeTabId) currentFilePath = targetPath;
      if (!silent) updateStatus('已保存');
      return true;
    }

    const defaultFilename = await getDefaultSaveFilename(tab?.path || null, content);
    const selectedPath = await save({
      title: '保存新文档',
      defaultPath: defaultFilename,
      filters: getSupportedFileFilters()
    });
    if (!selectedPath) return false;

    await writeTextFile(selectedPath, content);
    const fileName = await basename(selectedPath);
    const dirPath = await dirname(selectedPath);
    const fileInfo = getFileType(fileName);
    if (tab) {
      tab.path = selectedPath;
      tab.name = fileName;
      tab.fileInfo = fileInfo;
      tab.isMarkdown = isMarkdownFile(fileName);
      tab.content = content;
      tab.byteLen = new TextEncoder().encode(content).length;
      tab.eol = detectEol(content);
      tab.dirty = false;
    }
    if (tab && tab.id === activeTabId) {
      currentFilePath = selectedPath;
      syncTabGlobals(tab);
      document.getElementById('filePath').textContent = currentFilePath;
      updateFileInfoDisplay(fileName, fileInfo);
    }
    renderTabs();
    updateDocumentStatus();
    if (!silent) updateStatus(`已保存至: ${fileName}`);
    if (!currentWatchedDir) {
      await populateFileList(dirPath, fileName);
      startDirWatch(dirPath);
    } else {
      updateFileListActive(selectedPath);
    }
    return true;
  } catch (error) {
    console.error('❌ 保存文件失败:', error);
    if (String(error).includes('__TAURI_IPC__') || String(error).includes('Tauri')) {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = tab?.name || '未命名文档.md';
      a.click();
      URL.revokeObjectURL(url);
      updateStatus('已通过浏览器下载保存');
    } else {
      updateStatus('保存出错');
      if (!silent) alert(`保存文件失败: ${error}`);
    }
    return false;
  } finally {
    saveInFlight = false;
  }
}

function hasDirtyTabs() {
  return documentTabs.some((tab) => tab.dirty);
}

function confirmCloseAll() {
  const dirty = documentTabs.filter((tab) => tab.dirty);
  if (dirty.length === 0) return true;
  const names = dirty.slice(0, 5).map((tab) => tab.name).join('、');
  const suffix = dirty.length > 5 ? ` 等 ${dirty.length} 个` : '';
  return confirm(`有未保存的文档：${names}${suffix}。\n关闭应用将丢失这些修改，是否继续？`);
}

async function setupCloseGuard() {
  if ('__TAURI_INTERNALS__' in window) {
    try {
      const win = appWindow || getCurrentWindow();
      appWindow = win;
      await win.onCloseRequested((event) => {
        persistSessionNow();
        if (!confirmCloseAll()) event.preventDefault();
      });
      return;
    } catch (error) {
      console.warn('关闭保护初始化失败:', error);
    }
  }

  // 浏览器开发模式不注册 beforeunload，避免 HMR/刷新被未保存提示阻断；
  // 真实桌面应用由 Tauri 的 onCloseRequested 负责。
  if (import.meta.env.DEV) return;

  window.addEventListener('beforeunload', (event) => {
    persistSessionNow();
    if (!hasDirtyTabs()) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

function countOccurrences(text, query, caseSensitive = false) {
  if (!query) return 0;
  const source = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = source.indexOf(needle, index)) >= 0) {
    count += 1;
    index += needle.length;
  }
  return count;
}

function currentSearchText() {
  if (logViewerActive) return '';
  if (largeFileMode && largeFileEditor) return largeFileEditor.getValue();
  if (editorInstance) return editorInstance.getValue();
  return '';
}

function updateFindStatus() {
  const input = document.getElementById('findInput');
  const status = document.getElementById('findStatus');
  if (!input || !status) return;
  const query = input.value;
  if (!query) {
    status.textContent = '0 处';
    return;
  }
  status.textContent = `${countOccurrences(currentSearchText(), query)} 处`;
}

function openFindBar(replaceMode = false) {
  if (logViewerActive) {
    document.getElementById('logSearchToggle')?.click();
    setTimeout(() => document.getElementById('logSearchInput')?.focus(), 0);
    return;
  }
  const bar = document.getElementById('findBar');
  const input = document.getElementById('findInput');
  const replaceInput = document.getElementById('replaceInput');
  if (!bar || !input) return;
  bar.hidden = false;
  updateFindStatus();
  (replaceMode ? replaceInput : input)?.focus();
  input.select();
}

function closeFindBar() {
  const bar = document.getElementById('findBar');
  if (bar) bar.hidden = true;
}

function findInVditor(query, backward) {
  if (!editorInstance || !query) return false;
  editorInstance.focus();
  return window.find(query, false, backward, true, false, false, false);
}

function findNextMatch(backward = false) {
  const input = document.getElementById('findInput');
  const query = input?.value.trim();
  if (!query) return;
  if (largeFileMode && largeFileEditor) {
    largeFileEditor.find(query, { backward });
  } else if (editorInstance) {
    findInVditor(query, backward);
  }
  updateFindStatus();
}

function replaceCurrentMatch() {
  const input = document.getElementById('findInput');
  const replacement = document.getElementById('replaceInput')?.value ?? '';
  const query = input?.value;
  if (!query) return;
  if (largeFileMode && largeFileEditor) {
    largeFileEditor.replace(query, replacement, { all: false });
  } else if (editorInstance) {
    if (findInVditor(query, false)) {
      document.execCommand('insertText', false, replacement);
    }
  }
  updateFindStatus();
}

function replaceAllMatches() {
  const input = document.getElementById('findInput');
  const replacement = document.getElementById('replaceInput')?.value ?? '';
  const query = input?.value;
  if (!query) return;
  if (largeFileMode && largeFileEditor) {
    largeFileEditor.replace(query, replacement, { all: true });
  } else if (editorInstance) {
    const current = editorInstance.getValue();
    const next = current.split(query).join(replacement);
    editorInstance.setValue(next);
    markActiveTabDirty();
  }
  updateFindStatus();
  updateStatus('已全部替换');
}

function cycleTab(step) {
  if (documentTabs.length < 2) return;
  const current = documentTabs.findIndex((tab) => tab.id === activeTabId);
  const start = current < 0 ? 0 : current;
  const next = (start + step + documentTabs.length) % documentTabs.length;
  void activateTab(documentTabs[next].id);
}

function setupGlobalShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    const mod = event.ctrlKey || event.metaKey;
    if (!mod || event.altKey) return;

    const key = event.key.toLowerCase();
    if (key === 'f') {
      event.preventDefault();
      event.stopPropagation();
      openFindBar(false);
      return;
    }
    if (key === 'h') {
      event.preventDefault();
      event.stopPropagation();
      openFindBar(true);
      return;
    }
    if (event.key === ',') {
      event.preventDefault();
      event.stopPropagation();
      openSettingsDialog();
      return;
    }
    if (key === 's') {
      event.preventDefault();
      event.stopPropagation();
      void saveActiveDocument({ forceDialog: event.shiftKey });
      return;
    }
    if (key === 'w') {
      event.preventDefault();
      event.stopPropagation();
      if (!document.getElementById('quickOpen')?.hidden) {
        closeQuickOpen();
      } else if (activeTabId) {
        void closeTab(activeTabId);
      }
      return;
    }
    if (key === 'n') {
      event.preventDefault();
      event.stopPropagation();
      closeQuickOpen();
      void createNewTab();
      return;
    }
    if (key === 'o') {
      event.preventDefault();
      event.stopPropagation();
      closeQuickOpen();
      document.getElementById('btnOpen')?.click();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      cycleTab(event.shiftKey ? -1 : 1);
    }
  }, true);
}

function setupEventListeners() {
  console.log('🛠️ 设置事件监听器');

  // 打开文件夹
  const btnOpenFolder = document.getElementById('btnOpenFolder');
  if (btnOpenFolder) {
    btnOpenFolder.addEventListener('click', async () => {
      try {
        const selected = await open({ directory: true, multiple: false });
        const dirPath = selected?.path || selected;
        if (!dirPath) return;
        currentWatchedDir = dirPath;
        document.getElementById('sidebar')?.classList.remove('collapsed');
        await populateFileList(dirPath, null);
        startDirWatch(dirPath);
        updateStatus(`已打开文件夹: ${await basename(dirPath)}`);
      } catch (error) {
        console.error('打开文件夹失败:', error);
        updateStatus(`打开文件夹失败: ${error}`);
      }
    });
  }

  // 手动刷新文件夹按钮
  const btnRefreshFolder = document.getElementById('btnRefreshFolder');
  if (btnRefreshFolder) {
    btnRefreshFolder.addEventListener('click', async () => {
      if (!currentWatchedDir) return;
      btnRefreshFolder.classList.add('spinning');
      try {
        const activeFileName = currentFilePath ? await basename(currentFilePath) : null;
        await populateFileList(currentWatchedDir, activeFileName);
        // 刷新快照
        const entries = await readDir(currentWatchedDir);
        lastFileSnapshot = new Set(entries.filter(e => !e.isDirectory).map(e => e.name));
        updateStatus('文件列表已刷新');
      } catch (e) {
        console.error('刷新失败:', e);
      } finally {
        setTimeout(() => btnRefreshFolder.classList.remove('spinning'), 600);
      }
    });
  }

  // 右键菜单动作事件绑定
  const menuRename = document.getElementById('menuRename');
  const menuCopyPath = document.getElementById('menuCopyPath');
  const menuReveal = document.getElementById('menuReveal');
  const menuDelete = document.getElementById('menuDelete');

  if (menuRename) {
    menuRename.addEventListener('click', async () => {
      if (!contextTargetFile) return;
      const newName = prompt('重命名文件为:', contextTargetFile.name);
      if (newName && newName !== contextTargetFile.name) {
        try {
          const dir = await dirname(contextTargetFile.path);
          const newPath = await join(dir, newName);
          await rename(contextTargetFile.path, newPath);
          updateStatus(`已重命名: ${newName}`);
          const renamedTab = findTabByPath(contextTargetFile.path);
          if (renamedTab) {
            renamedTab.path = newPath;
            renamedTab.name = newName;
            renamedTab.fileInfo = getFileType(newName);
            renamedTab.isMarkdown = isMarkdownFile(newName);
            if (renamedTab.id === activeTabId) syncTabGlobals(renamedTab);
            renderTabs();
          }
          if (currentFilePath === contextTargetFile.path) {
            currentFilePath = newPath;
            document.getElementById('filePath').textContent = newPath;
          }
          await populateFileList(dir, currentFilePath ? await basename(currentFilePath) : null);
        } catch (e) {
          alert('重命名失败: ' + e);
        }
      }
    });
  }

  if (menuCopyPath) {
    menuCopyPath.addEventListener('click', async () => {
      if (!contextTargetFile) return;
      try {
        await navigator.clipboard.writeText(contextTargetFile.path);
        updateStatus('路径已复制到剪贴板');
      } catch (e) {
        console.error(e);
        updateStatus('复制路径失败');
      }
    });
  }

  if (menuReveal) {
    menuReveal.addEventListener('click', async () => {
      console.log('🔍 menuReveal clicked: contextTargetFile =', contextTargetFile);
      if (!contextTargetFile) {
        console.error('❌ menuReveal: contextTargetFile 为 null');
        updateStatus('错误: 未选择文件');
        return;
      }
      try {
        console.log('📂 正在获取目录:', contextTargetFile.path);
        const dir = await dirname(contextTargetFile.path);
        console.log('📁 目录路径:', dir);
        console.log('🚀 正在调用 shellOpen...');
        
        // 尝试使用 Tauri shellOpen
        try {
          await shellOpen(dir);
          console.log('✅ shellOpen 调用成功');
          updateStatus('已在资源管理器中打开');
        } catch (shellError) {
          console.warn('⚠️  shellOpen 失败，尝试备用方法:', shellError);
          
          // 备用方法：如果是 Web 环境，尝试使用 window.open
          if (typeof window !== 'undefined' && window.open) {
            // 注意：这只有在应用在浏览器中运行时才有效
            // 对于 file:// 协议可能无法工作
            try {
              // 尝试打开文件系统的父目录
              // 对于桌面应用，这可能需要特殊处理
              console.log('🔄 尝试备用打开方法');
              updateStatus('正在尝试备用方法打开目录...');
              
              // 这里可以添加平台特定的备用方案
              const isWindows = navigator.platform.toLowerCase().includes('win');
              const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
              
              if (isWindows) {
                // Windows: 尝试使用 explorer
                updateStatus('Windows: 请手动在资源管理器中打开');
              } else if (isMac) {
                // macOS: 尝试使用 open 命令
                updateStatus('macOS: 请手动在 Finder 中打开');
              } else {
                // Linux/其他
                updateStatus('请手动在文件管理器中打开');
              }
              
              alert(`无法自动打开目录。请手动在文件管理器中打开:\n${dir}`);
            } catch (fallbackError) {
              console.error('❌ 备用方法也失败:', fallbackError);
              alert(`打开目录失败:\n${shellError.message}\n\n目录路径: ${dir}`);
            }
          }
        }
      } catch (e) {
        console.error('❌ 打开目录失败:', e);
        updateStatus('打开目录失败');
        alert('打开目录失败: ' + e.message + '\n\n文件路径: ' + contextTargetFile.path);
      }
    });
  }

  if (menuDelete) {
    menuDelete.addEventListener('click', async () => {
      if (!contextTargetFile) return;
      if (confirm(`确定要永久删除 "${contextTargetFile.name}" 吗？此操作不可逆！`)) {
        try {
          await remove(contextTargetFile.path);
          updateStatus('已被删除: ' + contextTargetFile.name);
          const deletedTab = findTabByPath(contextTargetFile.path);
          if (deletedTab) {
            deletedTab.dirty = false;
            await closeTab(deletedTab.id);
          } else if (currentFilePath === contextTargetFile.path) {
            currentFilePath = null;
            document.getElementById('filePath').textContent = '未保存';
            await closeLargeFileViewer();
            await exitLargeFileModeIfActive();
            lastLoadedByteLen = 0;
            if (editorInstance) { editorInstance.setValue('', true); updateWordCount(''); }
          }
          const dir = await dirname(contextTargetFile.path);
          await populateFileList(dir, currentFilePath ? await basename(currentFilePath) : null);
        } catch (e) {
          alert('删除失败: ' + e);
        }
      }
    });
  }

  // 快速打开
  const btnQuickOpen = document.getElementById('btnQuickOpen');
  if (btnQuickOpen) {
    btnQuickOpen.addEventListener('click', () => void openQuickOpen());
  }

  const quickOpenInput = document.getElementById('quickOpenInput');
  if (quickOpenInput) {
    quickOpenInput.addEventListener('input', updateQuickOpenFilter);
    quickOpenInput.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        quickOpenIndex = Math.min(quickOpenIndex + 1, quickOpenFiltered.length - 1);
        renderQuickOpen();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        quickOpenIndex = Math.max(quickOpenIndex - 1, 0);
        renderQuickOpen();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const item = quickOpenFiltered[quickOpenIndex];
        if (item) void openQuickItem(item);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeQuickOpen();
      }
    });
  }

  const quickOpenOverlay = document.getElementById('quickOpen');
  if (quickOpenOverlay) {
    quickOpenOverlay.addEventListener('click', (event) => {
      if (event.target === quickOpenOverlay) closeQuickOpen();
    });
  }

  const tabOverflowBtn = document.getElementById('tabOverflowBtn');
  const tabOverflowMenu = document.getElementById('tabOverflowMenu');
  window.addEventListener('resize', updateTabOverflow);
  if (tabOverflowBtn && tabOverflowMenu) {
    tabOverflowBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (tabOverflowMenu.hidden) {
        renderTabOverflowMenu();
        tabOverflowMenu.hidden = false;
        tabOverflowBtn.classList.add('active');
      } else {
        tabOverflowMenu.hidden = true;
        tabOverflowBtn.classList.remove('active');
      }
    });
  }

  const tabContextMenu = document.getElementById('tabContextMenu');
  tabContextMenu?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-tab-action]');
    const id = tabContextTargetId;
    hideTabContextMenu();
    if (!item || !id) return;
    const action = item.dataset.tabAction;
    if (action === 'close') {
      void closeTab(id);
    } else if (action === 'close-others') {
      void closeOtherTabs(id);
    } else if (action === 'close-right') {
      void closeTabsToRight(id);
    } else if (action === 'copy-path') {
      const tab = documentTabs.find((entry) => entry.id === id);
      if (tab?.path && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(tab.path)
          .then(() => updateStatus('已复制路径'))
          .catch(() => updateStatus('复制路径失败'));
      } else {
        updateStatus('当前标签没有物理路径');
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#tabOverflowBtn, #tabOverflowMenu')) {
      tabOverflowMenu?.setAttribute('hidden', '');
      tabOverflowBtn?.classList.remove('active');
    }
    if (!event.target.closest('#tabContextMenu')) hideTabContextMenu();
  });
  window.addEventListener('resize', updateTabOverflow);
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar')?.classList.add('collapsed');
  }

  document.addEventListener('selectionchange', () => {
    const tab = getActiveTab();
    if (tab && tab.kind === 'vditor') updateDocumentStatus();
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      void openQuickOpen();
    }
  });

  // 查找 / 替换
  const findInput = document.getElementById('findInput');
  const replaceInput = document.getElementById('replaceInput');
  const findNextBtn = document.getElementById('findNext');
  const findPrevBtn = document.getElementById('findPrev');
  const findCloseBtn = document.getElementById('findClose');
  const replaceOneBtn = document.getElementById('replaceOne');
  const replaceAllBtn = document.getElementById('replaceAllBtn');
  let findStatusTimer = null;
  findInput?.addEventListener('input', () => {
    clearTimeout(findStatusTimer);
    findStatusTimer = setTimeout(updateFindStatus, 150);
  });
  findInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      findNextMatch(event.shiftKey);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeFindBar();
    }
  });
  replaceInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      replaceCurrentMatch();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeFindBar();
    }
  });
  findNextBtn?.addEventListener('click', () => findNextMatch(false));
  findPrevBtn?.addEventListener('click', () => findNextMatch(true));
  findCloseBtn?.addEventListener('click', closeFindBar);
  replaceOneBtn?.addEventListener('click', replaceCurrentMatch);
  replaceAllBtn?.addEventListener('click', replaceAllMatches);

  // 新建标签页按钮
  const tabNewBtn = document.getElementById('tabNewBtn');
  if (tabNewBtn) {
    tabNewBtn.addEventListener('click', () => {
      void createNewTab();
    });
  }


  // 新建文件按钮
  const btnNew = document.getElementById('btnNew');
  if (btnNew) {
    btnNew.addEventListener('click', async () => {
      console.log('📄 新建文件');
      await createNewTab();
    });
  }

  // 打开文件按钮
  const btnOpen = document.getElementById('btnOpen');
  if (btnOpen) {
    btnOpen.addEventListener('click', async () => {
      console.log('📁 打开文件');
      try {
        const fileFilters = getSupportedFileFilters();

        const selected = await open({
          multiple: true,
          filters: fileFilters,
          defaultPath: currentFilePath ? await dirname(currentFilePath) : undefined
        });

        const selectedPaths = Array.isArray(selected) ? selected : selected ? [selected] : [];
        for (const entry of selectedPaths) {
          // 兼容 Tauri API 的不同返回值（字符串 或 { path }）
          const filePath = entry?.path || entry;
          if (filePath) await loadFileIntoEditor(filePath);
        }
      } catch (error) {
        console.error('❌ 打开文件失败:', error);
        // 如果不在 Tauri 环境中运行，退回至 Web 方案
        if (String(error).includes('__TAURI_IPC__') || String(error).includes('Tauri')) {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.md,.txt';
          input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
              try {
                // 与 Tauri 主路径同规则：大小守卫 → 引擎选择 → 状态一致退出
                if (file.size > HUGE_FILE_LIMIT) {
                  updateStatus(`文件过大，已取消打开: ${file.name}`);
                  alert(`文件过大（${(file.size / 1048576).toFixed(0)} MB），超出本应用处理能力。`);
                  return;
                }
                const text = await file.text();
                currentFileIsMarkdown = isMarkdownFile(file.name);
                const byteLen = new TextEncoder().encode(text).length;
                const prevByteLen = lastLoadedByteLen;
                const fallbackIsLarge = byteLen >= LARGE_FILE_MODE_THRESHOLD;
                if (fallbackIsLarge || !currentFileIsMarkdown) {
                  await enterLargeFileMode(text, file.name, byteLen, { large: fallbackIsLarge });
                } else {
                  // 打开小文件必须退出大文件模式，否则 largeFileMode 仍为 true、
                  // getEditorValue() 会把旧大文件内容当成新文件保存（内容错配）
                  await exitLargeFileModeIfActive();
                  if (prevByteLen >= LARGE_FILE_MODE_THRESHOLD && editorInstance) {
                    editorInstance.setValue('');
                  }
                  if (editorInstance) {
                    editorInstance.setValue(text);
                    updateWordCount(text);
                    applyPreviewModeForCurrentFile();
                  }
                }
                lastLoadedByteLen = byteLen;   // 成功打开后才提交门阔状态
                updateStatus(`已打开: ${file.name}`);
              } catch (err) {
                console.error('❌ 读取文件失败:', err);
                updateStatus('读取文件失败');
              }
            }
          };
          input.click();
        } else {
          updateStatus('无法打开应用对话框');
        }
      }
    });
  }

  // 保存文件按钮
  const btnSave = document.getElementById('btnSave');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      void saveActiveDocument();
    });
  }

  // 导出文件按钮 - 多格式支持
  const btnExport = document.getElementById('btnExport');
  const exportMenu = document.getElementById('exportMenu');
  const exportMd = document.getElementById('exportMd');
  const exportHtml = document.getElementById('exportHtml');
  const exportPdf = document.getElementById('exportPdf');

  if (btnExport && exportMenu) {
    btnExport.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.style.display = exportMenu.style.display === 'block' ? 'none' : 'block';
    });

    // 全局点击关闭导出菜单
    document.addEventListener('click', (e) => {
      if (!exportMenu.contains(e.target) && e.target !== btnExport) {
        exportMenu.style.display = 'none';
      }
    });
  }

  // 导出 Markdown
  if (exportMd) {
    exportMd.addEventListener('click', async () => {
      exportMenu.style.display = 'none';
      if (logViewerActive) {
        updateStatus('只读日志模式不支持导出 Markdown');
        return;
      }
      if (!editorInstance) return;
      try {
        const defaultName = currentFilePath ? await basename(currentFilePath) : '未命名文档.md';
        const selectedPath = await save({
          title: '导出 Markdown',
          defaultPath: defaultName,
          filters: [{ name: 'Markdown 文件', extensions: ['md'] }]
        });
        if (selectedPath) {
          await writeTextFile(selectedPath, getEditorValue());
          updateStatus(`已导出 Markdown: ${await basename(selectedPath)}`);
        }
      } catch (e) {
        console.error('导出 Markdown 失败:', e);
        // Web 端兜底
        const blob = new Blob([getEditorValue()], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document.md';
        a.click();
        URL.revokeObjectURL(url);
        updateStatus('已通过浏览器下载导出 Markdown');
      }
    });
  }

  // 导出 HTML
  if (exportHtml) {
    exportHtml.addEventListener('click', async () => {
      exportMenu.style.display = 'none';
      if (logViewerActive) {
        updateStatus('只读日志模式不支持导出 HTML');
        return;
      }
      if (!editorInstance) return;
      let fullHtml = null;
      try {
        const htmlContent = await getHtmlForExport();
        fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${currentFilePath ? await basename(currentFilePath, '.md') : '文档'}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #333; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; }
    code { background: #f0f0f0; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; color: #666; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f5f5f5; }
    img { max-width: 100%; }
  </style>
</head>
<body>${htmlContent}</body>
</html>`;
      const selectedPath = await save({
        title: '导出 HTML',
        defaultPath: (currentFilePath ? await basename(currentFilePath, '.md') : '文档') + '.html',
        filters: [{ name: 'HTML 文件', extensions: ['html'] }]
      });
      if (selectedPath) {
        await writeTextFile(selectedPath, fullHtml);
        updateStatus(`已导出 HTML: ${await basename(selectedPath)}`);
      }
    } catch (e) {
        console.error('导出 HTML 失败:', e);
        if (!fullHtml) {
          // 渲染阶段就失败（无内容可兑底下载），明确报错而不是导出空文件
          updateStatus(`导出 HTML 失败: ${e.message || e}`);
          alert(`导出 HTML 失败: ${e.message || e}`);
          return;
        }
        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document.html';
        a.click();
        URL.revokeObjectURL(url);
        updateStatus('已通过浏览器下载导出 HTML');
      }
    });
  }

  // 导出 PDF (通过系统打印对话框)
  if (exportPdf) {
    exportPdf.addEventListener('click', () => {
      exportMenu.style.display = 'none';
      if (logViewerActive) {
        updateStatus('只读日志模式不支持导出 PDF');
        return;
      }
      if (!editorInstance) return;
      if (largeFileMode) {
        updateStatus(currentFileIsMarkdown
          ? '大文件模式暂不支持 PDF 导出，请先点击横幅中的"用富文本打开"'
          : '文本模式暂不支持 PDF 导出');
        return;
      }
      updateStatus('正在准备 PDF 导出...');
      // 短延迟确保菜单关闭后再触发打印
      setTimeout(() => {
        window.print();
        updateStatus('PDF 导出完成');
      }, 200);
    });
  }

  // 由于编辑器模式切换采用内置工具栏的功能更为稳定，这里已移除自定义模式下拉的绑定。

  // 主题切换按钮
  const btnTheme = document.getElementById('btnTheme');
  if (btnTheme) {
    btnTheme.addEventListener('click', toggleTheme);
  }

  // 设置面板
  document.getElementById('btnSettings')?.addEventListener('click', openSettingsDialog);
  document.getElementById('settingsClose')?.addEventListener('click', closeSettingsDialog);
  document.getElementById('settingsDialog')?.addEventListener('click', (event) => {
    if (event.target.id === 'settingsDialog') closeSettingsDialog();
  });
  document.getElementById('settingAutosave')?.addEventListener('change', (event) => {
    appSettings.autosave = event.target.checked;
    saveAppSettings();
    if (appSettings.autosave) scheduleAutosave();
  });
  document.getElementById('settingTheme')?.addEventListener('change', (event) => {
    appSettings.theme = event.target.value;
    saveAppSettings();
    applyThemePreference(appSettings.theme);
  });
  document.getElementById('settingFontSize')?.addEventListener('change', (event) => {
    appSettings.fontSize = Math.max(12, Math.min(22, Number(event.target.value) || 13));
    saveAppSettings();
    applyEditorFontSize();
  });
  document.getElementById('settingUiFontSize')?.addEventListener('change', (event) => {
    appSettings.uiFontSize = Math.max(12, Math.min(18, Number(event.target.value) || 13));
    saveAppSettings();
    applyUiFontSize();
  });

  // 侧边栏切换按钮
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      console.log('📐 切换侧边栏');
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        sidebar.classList.toggle('collapsed');
        updateStatus(`侧边栏${sidebar.classList.contains('collapsed') ? '折叠' : '展开'}`);
      }
    });
  }

  // 大纲按钮 - 触发 Vditor 内置的大纲控制功能
  const btnOutline = document.getElementById('btnOutline');
  if (btnOutline) {
    btnOutline.addEventListener('click', () => {
      console.log('📑 触发切换大纲');
      if (logViewerActive) {
        updateStatus('只读日志模式不支持大纲');
        return;
      }
      // 文本模式（CM6）：大纲只对 Markdown 有意义，vditor 的在隐藏容器内
      if (largeFileMode) {
        if (!currentFileIsMarkdown) {
          updateStatus('当前文件不是 Markdown，不支持大纲');
          return;
        }
        const largeOutline = document.getElementById('largeFileOutline');
        if (largeOutline) setLargeOutlineVisible(largeOutline.hidden);
        return;
      }
      const outlineEl = document.querySelector('.vditor-outline');
      const resizerEl = document.getElementById('outlineResizer');
      if (outlineEl) {
        const isVisible = getComputedStyle(outlineEl).display !== 'none';
        const nextDisplay = isVisible ? 'none' : 'block';
        outlineEl.style.display = nextDisplay;

        // 如果显示，确保宽度正确（恢复最后一次记录的宽度）
        if (nextDisplay === 'block') {
          const savedWidth = localStorage.getItem('markedit-outline-width') || '260px';
          outlineEl.style.width = savedWidth;
        }

        syncOutlineResizerVisibility(outlineEl, resizerEl);
      } else {
        // Fallback to native toggle
        const nativeOutlineBtn = document.querySelector('.vditor-toolbar [data-type="outline"]');
        if (nativeOutlineBtn) nativeOutlineBtn.click();
      }
    });
  }

  // 大文件模式：切换回富文本（用户主动承担全量渲染耗时，方案 v2 §4.3）
  const btnRichTextMode = document.getElementById('btnRichTextMode');
  if (btnRichTextMode) {
    btnRichTextMode.addEventListener('click', async () => {
      if (!largeFileMode || !largeFileEditor || !currentFileIsMarkdown) return;
      const text = largeFileEditor.getValue();
      const kb = Math.round(new TextEncoder().encode(text).length / 1024);
      const estimatedSec = Math.max(2, Math.round((kb / 1024) * 5));
      if (!confirm(`以富文本模式渲染当前文档（约 ${kb} KB）预计需要 ${estimatedSec} 秒左右，期间界面将暂时无响应。\n是否继续？`)) {
        return;
      }
      await exitLargeFileModeIfActive();
      await frame();
      if (editorInstance) {
        editorInstance.setValue(text);
        updateWordCount(text);
        applyPreviewModeForCurrentFile();
      }
      updateStatus(`已切换到富文本模式（${kb} KB）`);
    });
  }

}

/**
 * 初始化大纲栏宽度调节功能
 */
function initOutlineResizer() {
  const outline = document.querySelector('.vditor-outline');
  const container = document.querySelector('.vditor-content') || document.querySelector('.editor-container');
  
  if (!outline || !container) return;

  // 动态创建并注入拖动条，放置在原生排版中的大纲左侧
  let resizer = document.getElementById('outlineResizer');
  if (!resizer) {
    resizer = document.createElement('div');
    resizer.id = 'outlineResizer';
    resizer.className = 'outline-resizer';
    if (outline.parentNode) {
      outline.parentNode.insertBefore(resizer, outline);
    }
  }

  // 初始加载保存的宽度
  const savedWidth = localStorage.getItem('markedit-outline-width');
  if (savedWidth) {
    outline.style.width = savedWidth;
  }

  syncOutlineResizerVisibility(outline, resizer);

  const observer = new MutationObserver(() => {
    syncOutlineResizerVisibility(outline, resizer);
  });
  observer.observe(outline, { attributes: true, attributeFilter: ['style', 'class'] });

  let isDragging = false;

  resizer.addEventListener('mousedown', (e) => {
    isDragging = true;
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none'; // 防止拖动时选中文字
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    // 大纲在右侧，其宽度即为外层容器右边缘坐标与鼠标当前坐标差值
    const containerRect = container.getBoundingClientRect();
    const newWidth = containerRect.right - e.clientX;

    // 限制范围
    if (newWidth > 150 && newWidth < 600) {
      const widthStr = `${newWidth}px`;
      outline.style.width = widthStr;
      localStorage.setItem('markedit-outline-width', widthStr);
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      resizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

function loadAppSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      appSettings = { ...appSettings, ...saved };
    } else {
      const legacyTheme = localStorage.getItem('markedit-theme');
      if (legacyTheme === 'light' || legacyTheme === 'dark') appSettings.theme = legacyTheme;
    }
  } catch {
    /* 使用默认设置 */
  }
  appSettings.autosave = appSettings.autosave !== false;
  appSettings.theme = ['system', 'light', 'dark'].includes(appSettings.theme)
    ? appSettings.theme
    : 'system';
  appSettings.fontSize = Math.max(12, Math.min(22, Number(appSettings.fontSize) || 13));
  appSettings.uiFontSize = Math.max(12, Math.min(18, Number(appSettings.uiFontSize) || 13));
}

function saveAppSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
  } catch {
    /* 忽略配额错误 */
  }
}

function applyEditorTheme(theme) {
  if (editorInstance) {
    editorInstance.setTheme(
      theme === 'dark' ? 'dark' : 'classic',
      theme === 'dark' ? 'dark' : 'light',
      theme === 'dark' ? 'native' : 'github'
    );
  }
  if (largeFileEditor) largeFileEditor.setTheme(theme === 'dark');
}

function applyThemePreference(theme) {
  const resolved = theme === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.setAttribute('data-theme', resolved);
  applyEditorTheme(resolved);
}

function applyEditorFontSize() {
  document.documentElement.style.setProperty('--editor-font-size', `${appSettings.fontSize}px`);
}

function applyUiFontSize() {
  document.documentElement.style.setProperty('--ui-font-size', `${appSettings.uiFontSize}px`);
}

function applyFontSizes() {
  applyEditorFontSize();
  applyUiFontSize();
}

function openSettingsDialog() {
  const dialog = document.getElementById('settingsDialog');
  if (!dialog) return;
  const autosave = document.getElementById('settingAutosave');
  const theme = document.getElementById('settingTheme');
  const fontSize = document.getElementById('settingFontSize');
  const uiFontSize = document.getElementById('settingUiFontSize');
  if (autosave) autosave.checked = appSettings.autosave !== false;
  if (theme) theme.value = appSettings.theme;
  if (fontSize) fontSize.value = String(appSettings.fontSize);
  if (uiFontSize) uiFontSize.value = String(appSettings.uiFontSize);
  dialog.hidden = false;
}

function closeSettingsDialog() {
  const dialog = document.getElementById('settingsDialog');
  if (dialog) dialog.hidden = true;
}

// 切换主题
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  appSettings.theme = newTheme;
  saveAppSettings();
  applyThemePreference(newTheme);
  localStorage.setItem('markedit-theme', newTheme);
  updateStatus(`已切换到${newTheme === 'light' ? '浅色' : '深色'}主题`);
}

// 更新字数统计
// 优化（方案 v2 T3）：
// 1. 支持传入已读文本 —— 打开文件路径直接传参，省一次 IR 模式下 ~1s/MB 的 getValue 全量转换
// 2. 大文档门阔 —— 超过阈值跳过实时统计（显示 "—"），避免每次输入停顿触发 O(全文) 计算
function updateWordCount(content) {
  if (logViewerActive) {
    setWordCountDisplay('—', '—');
    return;
  }
  if (!editorInstance && !largeFileMode) return;

  if (largeFileMode) {
    // 文本引擎：小文本实时/按需统计；大文档由 enterLargeFileMode 做一次性统计
    const text = content !== undefined
      ? String(content || '')
      : (largeFileEditor ? largeFileEditor.getValue() : '');
    if (new TextEncoder().encode(text).length > WORDCOUNT_SKIP_THRESHOLD) {
      setWordCountDisplay('—', '—');
      return;
    }
    const textStats = computeWordStats(text);
    setWordCountDisplay(textStats.total, textStats.paragraphs);
    return;
  }

  let text;
  if (content !== undefined) {
    text = String(content || '');
  } else {
    text = editorInstance.getValue();   // IR 模式 = DOM→Markdown 全量转换（大文档时昂贵）
  }

  // 门阔：大文档跳过实时统计（UTF-8 字节口径与实测一致）
  if (new TextEncoder().encode(text).length > WORDCOUNT_SKIP_THRESHOLD) {
    setWordCountDisplay('—', '—');
    return;
  }

  const stats = computeWordStats(text);
  setWordCountDisplay(stats.total, stats.paragraphs);
}

/** 大文件模式打开后的一次性统计（此后不随输入更新） */
function oneTimeWordCount(text) {
  const stats = computeWordStats(text);
  setWordCountDisplay(stats.total, stats.paragraphs);
  console.log(`📊 大文件一次性统计完成: ${stats.total} 字 / ${stats.paragraphs} 段`);
}

function setWordCountDisplay(total, paragraphs) {
  const wordCount = document.getElementById('wordCount');
  const paraCount = document.getElementById('paraCount');
  if (wordCount) wordCount.textContent = String(total);
  if (paraCount) paraCount.textContent = String(paragraphs);
}

/** 字数统计计算（原 updateWordCount 正则流水线；代码块剥离只算一遍） */
function computeWordStats(content) {
  // ── 代码块/行内代码剥离（段落数与字数共用，只算一遍，行为与原实现一致）────
  const strippedCode = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '');

  // ── 段落数：去掉代码块后，按空行分割非空块 ──────────────────
  const paragraphs = strippedCode
    .split(/\n{2,}/)
    .filter(p => p.trim().length > 0)
    .length;

  // ── 字数：剥离 Markdown 语法符号后统计 ──────────────────────
  let plain = strippedCode
    // 去掉 HTML 标签
    .replace(/<[^>]+>/g, '')
    // 去掉图片 ![alt](url)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // 去掉链接 [text](url)，保留 text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 去掉标题符 #
    .replace(/^#{1,6}\s+/gm, '')
    // 去掉粗体/斜体符号 ** __ * _
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
    // 去掉删除线 ~~
    .replace(/~~(.*?)~~/g, '$1')
    // 去掉引用符 >
    .replace(/^>\s*/gm, '')
    // 去掉水平线
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // 去掉列表符号 - + * 及有序列表编号
    .replace(/^[\s]*[-+*]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '');

  // 统计中文字符数
  const chineseChars = (plain.match(/[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  // 去掉中文及标点后，统计英文单词数
  const withoutChinese = plain.replace(/[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff]/g, ' ');
  const englishWords = withoutChinese
    .trim()
    .split(/\s+/)
    .filter(w => w.match(/[a-zA-Z0-9]/)).length;

  return { paragraphs, total: chineseChars + englishWords };
}

// 更新状态信息
function updateStatus(message) {
  const statusText = document.getElementById('statusText');
  if (statusText) {
    statusText.textContent = message;
  }
  console.log('📢', message);
}

// 如果DOM已经加载完成，立即初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// 将文件类型函数暴露到全局，方便测试
window.getFileType = getFileType;
window.getFileIcon = getFileIcon;
window.isMarkdownFile = isMarkdownFile;
window.getEditorMode = getEditorMode;
window.getFileLanguage = getFileLanguage;

// 测试钩子：供 e2e/性能测试直接驱动大文件模式与预览策略（仅开发构建，不进生产包）
if (import.meta.env.DEV) {
  window._markeditTestHooks = {
    enterLargeFileMode,
    exitLargeFileModeIfActive,
    getEditorValue,
    loadFileIntoEditor,
    restoreSession,
    persistSessionNow,
    autosaveActiveTab,
    setEditorValue: (value) => {
      if (editorInstance) {
        editorInstance.setValue(String(value));
        markActiveTabDirty();
      }
    },
    getSaveState: () => ({ saveInFlight, autosaveTimer: Boolean(autosaveTimer), restoringSession }),
    getActiveTabInfo: () => {
      const tab = getActiveTab();
      return tab ? { id: tab.id, name: tab.name, path: tab.path, kind: tab.kind, dirty: tab.dirty, byteLen: tab.byteLen, contentLength: tab.content?.length } : null;
    },
    setupWindowControls,
    setCurrentFileIsMarkdown: (value) => {
      currentFileIsMarkdown = !!value;
      applyPreviewModeForCurrentFile();
    }
  };
}

// ============================================
// 新增函数：文件类型相关功能
// ============================================

/**
 * 根据文件类型调整编辑器配置
 * @param {string} filename - 文件名
 */
function adjustEditorForFileType(filename) {
  if (!editorInstance) return;

  const fileInfo = getFileType(filename);
  const isMarkdown = isMarkdownFile(filename);
  const editorMode = getEditorMode(filename);

  console.log(`🛠️  调整编辑器配置:`, {
    filename,
    type: fileInfo.name,
    isMarkdown,
    mode: editorMode
  });

  // 提示条与文件类型保持同步：非 Markdown 显示，Markdown 移除（幂等，见 syncFileTypeHint）
  syncFileTypeHint(filename);

  // 对于非 Markdown 文件，禁用一些 Markdown 特定的工具栏按钮
  if (!isMarkdown) {
    // 可以在这里添加逻辑来隐藏或禁用某些工具栏按钮
    console.log('ℹ️  非 Markdown 文件，已禁用 Markdown 特定功能');
  }

  // 模式切换（plain/code → SV 源码模式）已在 loadFileIntoEditor 中于 setValue 之前完成。
  // 原实现在此处调用不存在的 editorInstance.setMode('sv')（vditor 3.11.2 无此 API，触发即 TypeError），
  // 且每次打开文件都会重复挂载监听器 —— 两处问题均已修复（方案 v2 §4.6）。
  if (editorMode === 'plain' || editorMode === 'code') {
    console.log('ℹ️  非 Markdown 文件已使用源码模式打开（由统一入口处理）');
  }
}

/**
 * 查找已挂载的文件类型提示条
 * 注意：提示条是 #vditor-container 的“前置兄弟节点”（挂在 .editor-wrapper 下），
 * 查找作用域必须与插入位置一致；不能用 editorContainer.querySelector（那只查子孙，会永远查不到）。
 * @returns {HTMLElement|null}
 */
function findFileTypeHint() {
  const editorContainer = document.getElementById('vditor-container');
  const wrapper = editorContainer && editorContainer.parentNode;
  if (!wrapper) return null;

  for (const child of Array.from(wrapper.children)) {
    if (child.classList && child.classList.contains('file-type-hint')) return child;
  }
  return null;
}

/**
 * 移除文件类型提示条（幂等：不存在时为空操作）
 */
function removeFileTypeHint() {
  const hint = findFileTypeHint();
  if (hint) hint.remove();
}

/**
 * 同步“正在编辑 XX 文件”提示条（幂等）
 * - 非 Markdown：复用已有节点并更新文案，避免每打开一次就多堆一条
 * - Markdown：移除，避免切换文件后旧提示条残留
 * @param {string} filename - 文件名或完整路径（getFileType 会自行取 basename）
 */
function syncFileTypeHint(filename) {
  const editorContainer = document.getElementById('vditor-container');
  const wrapper = editorContainer && editorContainer.parentNode;
  if (!wrapper) return;

  if (isMarkdownFile(filename)) {
    removeFileTypeHint();
    return;
  }

  const fileInfo = getFileType(filename);
  let hint = findFileTypeHint();
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'file-type-hint';
    hint.style.cssText = `
      padding: 8px 12px;
      margin: 10px;
      background: #f0f0f0;
      border-left: 4px solid #4a90e2;
      border-radius: 4px;
      font-size: 14px;
      color: #333;
    `;
    // 插在 #vditor-container 之前（兄弟位置，与 findFileTypeHint 的查找作用域保持一致）
    wrapper.insertBefore(hint, editorContainer);
  }
  hint.textContent = `📄 正在编辑 ${fileInfo.name} 文件 (${fileInfo.icon})`;
}

/**
 * 更新文件信息显示
 * @param {string} filename - 文件名
 * @param {Object} fileInfo - 文件类型信息
 */
function updateFileInfoDisplay(filename, fileInfo) {
  // 更新文件路径显示
  const filePathElement = document.getElementById('filePath');
  if (filePathElement) {
    filePathElement.innerHTML = `
      <span class="file-icon">${fileInfo.icon || '📄'}</span>
      <span class="file-name">${filename}</span>
      <span class="file-type">(${fileInfo.name})</span>
    `;
  }

  // 更新标题
  document.title = `${filename} - MarkEdit`;

  // 更新状态栏信息
  const statusBar = document.querySelector('.status-bar');
  if (statusBar) {
    const typeInfo = statusBar.querySelector('.file-type-info');
    if (!typeInfo) {
      const typeInfoElement = document.createElement('span');
      typeInfoElement.className = 'file-type-info';
      typeInfoElement.style.marginLeft = '10px';
      typeInfoElement.style.color = '#666';
      typeInfoElement.textContent = `类型: ${fileInfo.name}`;
      statusBar.appendChild(typeInfoElement);
    } else {
      typeInfo.textContent = `类型: ${fileInfo.name}`;
    }
  }
}

/**
 * 获取支持的文件类型过滤器
 * @returns {Array} 文件过滤器数组
 */
function getSupportedFileFilters() {
  const fileTypes = getAllFileTypes();
  const filters = [];

  // 添加所有支持的文件类型
  fileTypes.forEach(type => {
    filters.push({
      name: `${type.name} 文件`,
      extensions: type.extensions
    });
  });

  // 添加"所有支持的文件"选项
  const allExtensions = fileTypes.flatMap(type => type.extensions);
  filters.unshift({
    name: '所有支持的文件',
    extensions: allExtensions
  });

  // 添加"所有文件"选项
  filters.push({
    name: '所有文件',
    extensions: ['*']
  });

  return filters;
}

/**
 * 获取默认的文件扩展名
 * 根据当前编辑器内容智能推荐
 * @param {string} content - 编辑器内容
 * @param {string} currentPath - 当前文件路径（可选）
 * @returns {string} 默认扩展名
 */
function getDefaultExtension(content, currentPath = null) {
  // 如果有当前文件路径，使用其扩展名
  if (currentPath) {
    const fileInfo = getFileType(currentPath);
    if (fileInfo.extensions && fileInfo.extensions.length > 0) {
      return fileInfo.extensions[0];
    }
  }

  // 根据内容分析推荐扩展名
  const trimmedContent = content.trim();

  // 检查是否是 JSON
  if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
    try {
      JSON.parse(trimmedContent);
      return 'json';
    } catch (e) {
      // 不是有效的 JSON
    }
  }

  // 检查是否是 XML/HTML
  if (trimmedContent.startsWith('<?xml') ||
      trimmedContent.startsWith('<!DOCTYPE') ||
      trimmedContent.match(/^<[a-zA-Z][^>]*>/)) {
    if (trimmedContent.match(/<html|<head|<body/i)) {
      return 'html';
    }
    return 'xml';
  }

  // 检查是否是 Markdown（包含标题、列表等）
  if (content.match(/^#+\s|^-\s|^\d+\.\s|^\*\s|\*\*[^*]+\*\*|__[^_]+__/m)) {
    return 'md';
  }

  // 检查是否是 Python 代码
  if (content.includes('def ') || content.includes('import ') ||
      content.includes('class ') || content.includes('print(')) {
    return 'py';
  }

  // 检查是否是 JavaScript 代码
  if (content.includes('function ') || content.includes('const ') ||
      content.includes('let ') || content.includes('console.log')) {
    return 'js';
  }

  // 检查是否是 Shell 脚本
  if (content.startsWith('#!/bin/bash') || content.startsWith('#!/bin/sh') ||
      content.includes('export ') || content.includes('echo ')) {
    return 'sh';
  }

  // 默认使用 Markdown
  return 'md';
}

/**
 * 获取保存文件的默认文件名
 * @param {string} currentPath - 当前文件路径（可选）
 * @param {string} content - 编辑器内容（可选）
 * @returns {Promise<string>} 默认文件名
 */
async function getDefaultSaveFilename(currentPath = null, content = '') {
  if (currentPath) {
    return await basename(currentPath);
  }

  const extension = getDefaultExtension(content, currentPath);
  return `未命名文档.${extension}`;
}

console.log('✅ 应用代码加载完成');

// ============================================
// macOS Finder 右键"打开方式"支持
// ============================================

// 监听来自 Rust 后端的文件打开事件
async function setupMacOSFileOpenSupport() {
  try {
    const { listen } = await import('@tauri-apps/api/event');

    // 监听 second-instance 事件（当应用已运行时，通过 open -a 打开文件）
    await listen('second-instance', (event) => {
      const filePath = normalizeIncomingFilePath(event.payload);
      console.log('📩 检测到 second-instance 事件:', filePath);

      if (!filePath) return;

      if (editorInstance) {
        openFileFromPath(filePath).then(() => {
          console.log('✅ 通过 second-instance 打开文件成功:', filePath);
        }).catch(err => {
          console.error('❌ 通过 second-instance 打开文件失败:', err);
          alert(`无法打开文件：${filePath}\n\n错误：${err.message}`);
        });
      } else {
        console.log('⏳ 应用未初始化，缓存 second-instance 文件路径:', filePath);
        window._pendingMacOSFile = filePath;
      }
    });

    console.log('✅ second-instance 事件监听已设置');

    // macos-open-file 事件监听保留（用于未来 Tauri v2 支持）
    await listen('macos-open-file', (event) => {
      const filePath = normalizeIncomingFilePath(event.payload);
      console.log('🍎 macOS open-file 事件:', filePath);

      if (filePath && editorInstance) {
        openFileFromPath(filePath).then(() => {
          console.log('✅ 通过 Finder 右键打开文件成功:', filePath);
        }).catch(err => {
          console.error('❌ 通过 Finder 右键打开文件失败:', err);
          alert(`无法打开文件：${filePath}\n\n错误：${err.message}`);
        });
      } else {
        console.log('⏳ 应用未初始化，缓存文件路径:', filePath);
        window._pendingMacOSFile = filePath;
      }
    });

    console.log('✅ macOS open-file 事件监听已设置');
  } catch (err) {
    console.warn('⚠️  无法注册文件打开事件监听:', err);
  }
}
