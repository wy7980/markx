// State
let editorInstance = null;
window.vInstance = null; // Debugging
let files = [];
let currentFileId = null;
let currentFilePath = null;
let saveTimeout = null;
let appInitialized = false;

// 全局错误处理 - 静默处理非关键错误
window.addEventListener('error', (e) => {
  // 忽略 Vditor 内部的 currentMode 错误（不影响功能）
  if (e.error && e.error.message && e.error.message.includes('currentMode')) {
    console.debug('ℹ️ 忽略 Vditor 内部错误:', e.error.message);
    return;
  }
  
  // 只在控制台记录其他错误
  console.error('💥 全局错误:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('💥 未处理 Promise:', e.reason);
});

// 右键菜单提示 (可选)
document.addEventListener('contextmenu', (e) => {
  // 在编辑器区域右键时，可以显示提示
  if (e.target.closest('.vditor') || e.target.closest('#vditor-container')) {
    // 这里可以添加右键提示，但不是必需的
    // 不阻止默认右键菜单，让用户可以使用浏览器原生"检查"功能
  }
});

// 键盘快捷键 - 打开开发者工具
document.addEventListener('keydown', (e) => {
  // F12 打开开发者工具
  if (e.key === 'F12') {
    console.log('🔧 按下 F12，尝试打开开发者工具...');
    openDevTools();
    e.preventDefault(); // 防止默认行为
  }
  
  // Ctrl+Shift+I 打开开发者工具
  if (e.ctrlKey && e.shiftKey && e.key === 'I') {
    console.log('🔧 按下 Ctrl+Shift+I，尝试打开开发者工具...');
    openDevTools();
    e.preventDefault(); // 防止默认行为
  }
});

// 打开开发者工具的函数 (简化为使用浏览器原生功能)
async function openDevTools() {
  console.log('🔧 提示: 可以使用以下方式打开开发者工具:');
  console.log('   1. 鼠标右键 → 检查 (推荐)');
  console.log('   2. 快捷键 F12');
  console.log('   3. 快捷键 Ctrl+Shift+I');
  
  // 对于Tauri应用，尝试使用Tauri API
  if (window.__TAURI__ && window.__TAURI__.webview && window.__TAURI__.webview.openDevTools) {
    try {
      await window.__TAURI__.webview.openDevTools();
      console.log('✅ 通过Tauri API打开开发者工具');
      return;
    } catch (error) {
      console.log('⚠️ Tauri API失败，使用浏览器原生功能:', error.message);
    }
  }
  
  // 对于Tauri 2.0
  if (window.__TAURI_INTERNALS__) {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const mainWindow = WebviewWindow.getByLabel('main');
      if (mainWindow) {
        await mainWindow.openDevTools();
        console.log('✅ 通过Tauri 2.0 API打开开发者工具');
        return;
      }
    } catch (error) {
      console.log('⚠️ Tauri 2.0 API失败，使用浏览器原生功能:', error.message);
    }
  }
  
  // 对于Web环境，显示提示
  console.log('💡 在Web环境中，使用浏览器原生开发者工具');
}

// 初始化函数
function initializeApp() {
  if (appInitialized) return;
  appInitialized = true;
  
  console.log('🚀 开始初始化 MarkEdit 应用...');
  
  // 检查关键元素
  const requiredIds = ['btnNew', 'btnOpen', 'btnSave', 'btnExport', 'btnToggleSidebar', 'btnOutline', 'btnTheme', 'selectMode', 'vditor-container', 'fileList', 'outlineList', 'wordCount', 'paraCount', 'statusText'];
  const missing = requiredIds.filter(id => !document.getElementById(id));
  
  if (missing.length > 0) {
    console.error('❌ 缺少 DOM 元素:', missing);
    return;
  }
  
  // 初始化
  initVditor().then(() => {
    console.log('✓ Vditor 初始化完成');
    loadFiles();
    loadTheme();
    setupEventListeners();
    initOutlineSidebar(); // 初始化浮动大纲侧边栏
    console.log('🎉 MarkEdit 应用初始化完成！');
  }).catch(err => {
    console.error('❌ Vditor 初始化失败:', err);
  });
}

// 自动初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Vditor Editor
function initVditor() {
  return new Promise((resolve) => {
    editorInstance = new Vditor('vditor-container', {
      height: '100%',
      mode: 'wysiwyg',
      theme: 'classic',
      icon: 'material',
      cache: {
        enable: true,
        id: 'markedit-cache'
      },
      value: `# 欢迎使用 MarkEdit

这是一个**轻量级**、*所见即所得*的 Markdown 编辑器。
`,
      toolbar: [
        'headings', 'bold', 'italic', 'strike', '|',
        'line', 'quote', 'list', 'ordered-list', 'check', '|',
        'code', 'inline-code', '|',
        'link', 'table', '|',
        'undo', 'redo', '|',
        'edit-mode',
        {
          name: 'more',
          toolbar: ['both', 'preview', 'export']
        }
      ],
      input: (value) => {
        updateOutline();
        updateStats();
        autoSave();
      },
      after: () => {
        updateOutline();
        updateStats();
        window.vInstance = editorInstance;
        console.log('Vditor ready, instance methods:', Object.keys(editorInstance).filter(k => typeof editorInstance[k] === 'function'));
        resolve();
      }
    });
  });
}

// File Management
function loadFiles() {
  const saved = localStorage.getItem('markedit-files');
  if (saved) {
    files = JSON.parse(saved);
  }
  
  // 为旧数据添加路径字段（向后兼容）
  files.forEach(file => {
    if (!file.path) {
      file.path = '';
      file.dirPath = '';
    }
  });
  
  if (files.length === 0) {
    createNewFile();
  } else {
    currentFileId = files[0].id;
    loadCurrentFile();
  }
  renderFileList();
}

function saveFiles() {
  localStorage.setItem('markedit-files', JSON.stringify(files));
}

function createNewFile() {
  const file = {
    id: Date.now().toString(),
    name: '未命名',
    content: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  files.unshift(file);
  currentFileId = file.id;
  currentFilePath = null;
  saveFiles();
  renderFileList();
  
  if (editorInstance) {
    editorInstance.setValue('');
  }
  updateStatus('新文档已创建');
}

function loadCurrentFile() {
  const file = files.find(f => f.id === currentFileId);
  if (file && editorInstance) {
    editorInstance.setValue(file.content || '');
    currentFilePath = file.path || null;
    updateStatusBar();
    updateOutline();
    updateStats();
  }
}

function updateStatusBar() {
  const filePathEl = document.getElementById('filePath');
  if (filePathEl) {
    filePathEl.textContent = currentFilePath || '本地存储';
  }
}

function switchFile(id) {
  saveCurrentFile();
  currentFileId = id;
  loadCurrentFile();
  renderFileList();
}

function openExternalFile(name, content, path = null) {
  let existing = files.find(f => (path && f.path === path) || (!path && f.name === name));
  if (existing) {
    existing.content = content;
    existing.updatedAt = new Date().toISOString();
    currentFileId = existing.id;
    currentFilePath = path;
  } else {
    const file = {
      id: Date.now().toString(),
      name: name,
      content: content,
      path: path,
      dirPath: path ? getDirPath(path) : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    files.unshift(file);
    currentFileId = file.id;
    currentFilePath = path;
  }
  saveFiles();
  loadCurrentFile();
  renderFileList();
  updateStatus('文件已打开');
}

function deleteFile(id, e) {
  e.stopPropagation();
  console.log('🗑️ 尝试删除文件 ID:', id);
  if (files.length === 1) {
    alert('至少保留一个文档');
    return;
  }
  
  if (confirm('确定删除此文档？')) {
    files = files.filter(f => f.id !== id);
    if (currentFileId === id) {
      currentFileId = files[0].id;
      loadCurrentFile();
    }
    saveFiles();
    renderFileList();
  }
}

function saveCurrentFile() {
  const file = files.find(f => f.id === currentFileId);
  if (file && editorInstance) {
    file.content = editorInstance.getValue();
    file.updatedAt = new Date().toISOString();
    
    // Update name from first heading
    const match = file.content.match(/^#\s+(.+)$/m);
    if (match) {
      file.name = match[1].slice(0, 20) || '未命名';
    }
    
    saveFiles();
    renderFileList();
  }
}

function autoSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveCurrentFile();
    updateStatus('已自动保存');
  }, 1000);
}

function renderFileList() {
  const list = document.getElementById('fileList');
  
  // 如果当前有打开的文件且有路径，显示目录结构
  if (currentFilePath) {
    renderDirectoryView(list);
  } else {
    // 否则显示普通文件列表
    renderSimpleFileList(list);
  }
}

function renderSimpleFileList(list) {
  list.innerHTML = files.map(file => `
    <div class="file-item ${file.id === currentFileId ? 'active' : ''}" data-id="${file.id}">
      <span class="file-icon">📄</span>
      <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
      <button class="delete-btn" data-id="${file.id}">✕</button>
    </div>
  `).join('');
  
  setupFileListEvents(list);
}

function renderDirectoryView(list) {
  const currentFile = files.find(f => f.id === currentFileId);
  if (!currentFile || !currentFile.path) {
    renderSimpleFileList(list);
    return;
  }
  
  // 获取目录路径
  const dirPath = currentFile.path ? getDirPath(currentFile.path) : '';
  const dirName = dirPath ? getFileName(dirPath) || '根目录' : '未指定目录';
  
  list.innerHTML = `
    <div class="directory-header">
      <span class="directory-icon">📁</span>
      <span class="directory-title">${dirName}</span>
      <span class="directory-path">${dirPath || '本地文件'}</span>
    </div>
    <div class="directory-files" id="directoryFiles">
      <!-- 目录文件将在这里动态加载 -->
    </div>
    <div class="recent-files">
      <div class="recent-title">最近文件</div>
      ${files.slice(0, 5).map(file => `
        <div class="file-item ${file.id === currentFileId ? 'active' : ''}" data-id="${file.id}">
          <span class="file-item-icon">
            <span class="file-icon">📄</span>
            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis;">${file.name}</span>
          </span>
          <span class="file-path">${file.path ? getFileName(getDirPath(file.path)) || '本地' : '内存'}</span>
        </div>
      `).join('')}
    </div>
  `;
  
  // 加载目录下的文件
  loadDirectoryFiles(dirPath, document.getElementById('directoryFiles'));
  setupFileListEvents(list);
}

function getDirPath(filePath) {
  if (!filePath) return '';
  // 处理不同操作系统的路径分隔符
  const path = filePath.replace(/\\/g, '/');
  const lastSlash = path.lastIndexOf('/');
  return lastSlash > 0 ? path.substring(0, lastSlash) : '';
}

function getFileName(filePath) {
  if (!filePath) return '';
  const path = filePath.replace(/\\/g, '/');
  const lastSlash = path.lastIndexOf('/');
  return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}

async function loadDirectoryFiles(dirPath, container) {
  if (!container) return;
  
  container.innerHTML = '<div class="loading">加载目录中...</div>';
  
  // 在Tauri环境中，尝试读取目录
  if (window.__TAURI_INTERNALS__ && dirPath) {
    try {
      // 尝试导入fs插件
      const { readDir } = await import('@tauri-apps/plugin-fs');
      
      try {
        const entries = await readDir(dirPath, { recursive: false });
        
        // 过滤出markdown和txt文件
        const markdownFiles = entries.filter(entry => 
          !entry.children && 
          (entry.name.toLowerCase().endsWith('.md') || 
           entry.name.toLowerCase().endsWith('.txt') ||
           entry.name.toLowerCase().endsWith('.markdown'))
        );
        
        if (markdownFiles.length === 0) {
          container.innerHTML = '<div class="no-files">该目录下没有Markdown或TXT文件</div>';
          return;
        }
        
        container.innerHTML = markdownFiles.map(entry => {
          const isCurrent = currentFilePath && currentFilePath.endsWith(`/${entry.name}`);
          return `
            <div class="file-item ${isCurrent ? 'active' : ''}" data-path="${dirPath}/${entry.name}">
              <span class="file-icon">📄</span>
              <span style="flex: 1; overflow: hidden; text-overflow: ellipsis;">${entry.name}</span>
              <span class="file-size">${formatFileSize(entry.size || 0)}</span>
            </div>
          `;
        }).join('');
        
        // 绑定点击事件
        container.querySelectorAll('.file-item[data-path]').forEach(item => {
          item.addEventListener('click', async () => {
            const path = item.dataset.path;
            await openFileFromPath(path);
          });
        });
        
      } catch (fsError) {
        console.error('❌ 读取目录失败:', fsError);
        
        // 根据错误类型显示不同的提示
        if (fsError.toString().includes('not allowed by ACL')) {
          container.innerHTML = `
            <div class="error">
              <div>⚠️ 权限不足</div>
              <div style="font-size: 11px; margin-top: 4px;">
                需要更新Tauri配置以允许读取目录
              </div>
              <div style="font-size: 10px; margin-top: 2px; color: var(--muted);">
                ${fsError.message || fsError.toString()}
              </div>
            </div>
          `;
        } else {
          container.innerHTML = `
            <div class="error">
              <div>无法读取目录内容</div>
              <div style="font-size: 11px; margin-top: 4px;">
                请检查目录是否存在或权限设置
              </div>
            </div>
          `;
        }
      }
      
    } catch (importError) {
      console.error('❌ 导入fs插件失败:', importError);
      container.innerHTML = '<div class="info">文件系统功能不可用</div>';
    }
  } else {
    // Web环境或无路径时，显示提示
    container.innerHTML = '<div class="info">请打开本地文件以查看目录内容</div>';
  }
}

async function openFileFromPath(filePath) {
  if (window.__TAURI_INTERNALS__) {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const content = await readTextFile(filePath);
      const name = getFileName(filePath);
      openExternalFile(name, content, filePath);
    } catch (error) {
      console.error('❌ 打开文件失败:', error);
      updateStatus('打开文件失败');
    }
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function setupFileListEvents(list) {
  list.querySelectorAll('.file-item:not([data-path])').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-btn')) {
        switchFile(item.dataset.id);
      }
    });
  });
  
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => deleteFile(btn.dataset.id, e));
  });
}

function updateOutline() {
  if (!editorInstance) return;
  const content = editorInstance.getValue();
  const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
  const icons = { h1: '📌', h2: '📎', h3: '📍', h4: '🔹' };
  
  const list = document.getElementById('outlineList');
  list.innerHTML = headings.map(h => {
    const level = (h.match(/^#+/) || [''])[0].length;
    const text = h.replace(/^#+\s+/, '');
    const tag = `h${Math.min(level, 4)}`;
    return `<div class="outline-item ${tag}" data-text="${text}">
      <span class="icon">${icons[tag] || '•'}</span>
      ${text}
    </div>`;
  }).join('');
  
  list.querySelectorAll('.outline-item').forEach(item => {
    item.addEventListener('click', () => {
      const text = item.dataset.text;
      const content = editorInstance.getValue();
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(text)) {
          editorInstance.focus();
          break;
        }
      }
      list.querySelectorAll('.outline-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

function updateStats() {
  if (!editorInstance) return;
  const content = editorInstance.getValue();
  const text = content.replace(/[#*`\[\]()>-]/g, '').replace(/\s/g, '');
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim()).length;
  
  document.getElementById('wordCount').textContent = text.length;
  document.getElementById('paraCount').textContent = paragraphs;
}

function loadTheme() {
  const theme = localStorage.getItem('markedit-theme') || 'light';
  setTheme(theme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('sunIcon').style.display = theme === 'dark' ? 'none' : 'block';
  document.getElementById('moonIcon').style.display = theme === 'dark' ? 'block' : 'none';
  if (editorInstance) {
    editorInstance.setTheme(theme === 'dark' ? 'dark' : 'classic');
  }
  localStorage.setItem('markedit-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function updateStatus(msg) {
  document.getElementById('statusText').textContent = msg;
  setTimeout(() => {
    document.getElementById('statusText').textContent = '就绪';
  }, 2000);
}

function setupEventListeners() {
  console.log('🔧 绑定事件监听器...');
  
  document.getElementById('btnNew').addEventListener('click', createNewFile);
  
  document.getElementById('btnToggleSidebar').addEventListener('click', () => {
    console.log('📂 切换侧边栏');
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
  
  // btnOutline的事件监听器会在updateOutlineButtonListener中更新
  // 这里暂时绑定空函数，避免重复绑定
  document.getElementById('btnOutline').addEventListener('click', () => {
    console.log('📑 大纲按钮点击 (将在1秒后更新功能)');
  });
  
  document.getElementById('btnCollapseAll').addEventListener('click', () => {
    console.log('📐 折叠/展开所有大纲');
    document.getElementById('outlineList').classList.toggle('all-collapsed');
  });
  
  document.getElementById('btnTheme').addEventListener('click', toggleTheme);
  
  const selectMode = document.getElementById('selectMode');
  if (selectMode) {
    selectMode.addEventListener('change', (e) => {
      const mode = e.target.value;
      console.log('🔄 切换编辑模式:', mode);
      
      if (editorInstance) {
        // Method 1: Try setMode (Standard/Legacy API)
        if (typeof editorInstance.setMode === 'function') {
          editorInstance.setMode(mode);
        } else {
          // Method 2: Keyboard shortcut fallback (Reliable for Vditor 3.x)
          const modeMap = { 'wysiwyg': '7', 'ir': '8', 'sv': '9' };
          const key = modeMap[mode];
          if (key) {
            console.log(`⌨️ 使用快捷键 Alt+Ctrl+${key} 切换至 ${mode}`);
            window.dispatchEvent(new KeyboardEvent('keydown', { 
              key: key, ctrlKey: true, altKey: true, bubbles: true 
            }));
          }
        }
      }
    });
    console.log('✓ selectMode 事件已绑定');
  }
  
  document.getElementById('btnOpen').addEventListener('click', async () => {
    console.log('📁 打开文件');
    if (window.__TAURI_INTERNALS__) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const path = await open({ filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }] });
        if (path) {
          const content = await readTextFile(path);
          const name = path.split(/[\\/]/).pop();
          openExternalFile(name, content, path);
        }
      } catch (err) { console.error('❌', err); }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        const text = await file.text();
        openExternalFile(file.name, text);
      };
      input.click();
    }
  });
  
  document.getElementById('btnSave').addEventListener('click', async () => {
    console.log('💾 保存');
    if (window.__TAURI_INTERNALS__ && currentFilePath) {
      try {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        if (editorInstance) await writeTextFile(currentFilePath, editorInstance.getValue());
        updateStatus('文件已保存');
      } catch (err) { console.error('❌', err); }
    } else {
      saveCurrentFile();
      updateStatus('已保存');
    }
  });
  
  document.getElementById('btnExport').addEventListener('click', async () => {
    console.log('📤 导出');
    if (window.__TAURI_INTERNALS__) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        const path = await save({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
        if (path && editorInstance) {
          await writeTextFile(path, editorInstance.getValue());
          updateStatus('导出成功');
        }
      } catch (err) { console.error('❌', err); }
    } else {
      console.log('⚠️ Web下载回退');
      if (editorInstance) {
        const blob = new Blob([editorInstance.getValue()], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'document.md'; a.click();
        URL.revokeObjectURL(url);
        updateStatus('导出成功');
      }
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      document.getElementById('btnSave').click();
    }
    
    // ESC键关闭大纲侧边栏
    if (e.key === 'Escape' && outlineSidebarVisible) {
      toggleOutlineSidebar();
    }
  });
}

// ============================================
// 浮动大纲侧边栏功能
// ============================================

let outlineSidebarVisible = false;

/**
 * 初始化浮动大纲侧边栏
 */
function initOutlineSidebar() {
  console.log('🚀 初始化浮动大纲侧边栏...');
  
  // 创建侧边栏DOM
  const sidebarHTML = `
    <div class="outline-sidebar" id="outlineSidebar">
      <div class="outline-sidebar-header">
        <span class="outline-sidebar-title">📑 文档大纲</span>
        <button class="outline-sidebar-close" id="btnCloseOutline" title="关闭大纲">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="outline-sidebar-content" id="outlineSidebarContent">
        <!-- 大纲内容动态生成 -->
      </div>
    </div>
  `;
  
  // 添加到页面
  document.body.insertAdjacentHTML('beforeend', sidebarHTML);
  
  // 绑定事件
  document.getElementById('btnCloseOutline').addEventListener('click', toggleOutlineSidebar);
  
  // 点击外部关闭侧边栏
  document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('outlineSidebar');
    const btnOutline = document.getElementById('btnOutline');
    
    if (outlineSidebarVisible && 
        sidebar && 
        btnOutline &&
        !sidebar.contains(e.target) && 
        !btnOutline.contains(e.target)) {
      toggleOutlineSidebar();
    }
  });
  
  console.log('✅ 浮动大纲侧边栏初始化完成');
}

/**
 * 切换大纲侧边栏显示/隐藏
 */
function toggleOutlineSidebar() {
  const sidebar = document.getElementById('outlineSidebar');
  const btnOutline = document.getElementById('btnOutline');
  
  if (!sidebar || !btnOutline) return;
  
  outlineSidebarVisible = !outlineSidebarVisible;
  
  if (outlineSidebarVisible) {
    // 显示侧边栏
    sidebar.classList.add('open');
    btnOutline.classList.add('active');
    
    // 更新大纲内容
    updateOutlineSidebar();
    
    console.log('📖 显示大纲侧边栏');
  } else {
    // 隐藏侧边栏
    sidebar.classList.remove('open');
    btnOutline.classList.remove('active');
    
    console.log('📕 隐藏大纲侧边栏');
  }
}

/**
 * 更新浮动侧边栏中的大纲内容
 */
function updateOutlineSidebar() {
  if (!editorInstance) return;
  
  const content = editorInstance.getValue();
  const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
  
  const sidebarContent = document.getElementById('outlineSidebarContent');
  if (!sidebarContent) return;
  
  const icons = { 
    h1: '📌', h2: '📎', h3: '📍', h4: '🔹', h5: '•', h6: '◦' 
  };
  
  if (headings.length === 0) {
    sidebarContent.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--muted);">
        <div style="font-size: 48px; margin-bottom: 16px;">📄</div>
        <div>暂无标题</div>
        <div style="font-size: 12px; margin-top: 8px;">添加 # 标题来创建大纲</div>
      </div>
    `;
    return;
  }
  
  const itemsHTML = headings.map((heading, index) => {
    const level = (heading.match(/^#+/) || [''])[0].length;
    const text = heading.replace(/^#+\s+/, '').trim();
    const tag = `h${Math.min(level, 6)}`;
    const icon = icons[tag] || '•';
    
    return `
      <div class="outline-item-improved ${tag}" 
           data-index="${index}" 
           data-text="${text.replace(/"/g, '&quot;')}"
           title="点击跳转到: ${text}">
        <span class="icon">${icon}</span>
        <span class="text" style="flex: 1; overflow: hidden; text-overflow: ellipsis;">${text}</span>
        <span class="level" style="font-size: 10px; color: var(--muted);">H${level}</span>
      </div>
    `;
  }).join('');
  
  sidebarContent.innerHTML = itemsHTML;
  
  // 绑定点击事件
  sidebarContent.querySelectorAll('.outline-item-improved').forEach(item => {
    item.addEventListener('click', () => {
      const text = item.dataset.text;
      improvedScrollToHeading(text);
    });
  });
}

/**
 * 改进的大纲跳转函数
 * 精确跳转到标题行
 */
function improvedScrollToHeading(headingText, focusEditor = true) {
  console.log(`🔍 跳转到标题: "${headingText}"`);
  
  if (!editorInstance) {
    console.error('❌ 编辑器实例未初始化');
    return;
  }
  
  const content = editorInstance.getValue();
  if (!content) {
    console.warn('⚠️  编辑器内容为空');
    return;
  }
  
  // 分割为行
  const lines = content.split('\n');
  let foundLineIndex = -1;
  let exactMatch = false;
  
  // 第一步：尝试精确匹配
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 检查是否是标题行
    if (line.startsWith('#') && line.includes(headingText)) {
      // 提取标题内容（去除#和空格）
      const headingContent = line.replace(/^#+\s+/, '').trim();
      
      if (headingContent === headingText) {
        foundLineIndex = i;
        exactMatch = true;
        console.log(`✅ 找到精确匹配: 第${i + 1}行`);
        break;
      } else if (headingContent.includes(headingText) && foundLineIndex === -1) {
        // 部分匹配，先记录下来
        foundLineIndex = i;
        console.log(`⚠️  找到部分匹配: 第${i + 1}行`);
      }
    }
  }
  
  // 第二步：如果没找到精确匹配，尝试模糊匹配
  if (!exactMatch && foundLineIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes(headingText) && (line.startsWith('#') || line.toLowerCase().includes(headingText.toLowerCase()))) {
        foundLineIndex = i;
        console.log(`🔍 找到模糊匹配: 第${i + 1}行`);
        break;
      }
    }
  }
  
  // 第三步：执行跳转
  if (foundLineIndex !== -1) {
    try {
      // Vditor API跳转
      if (typeof editorInstance.focus === 'function') {
        editorInstance.focus();
      }
      
      // 设置光标位置（基于行的粗略估计）
      const linePosition = foundLineIndex * 50; // 每行大约50px
      
      // 滚动到位置
      const editorElement = document.querySelector('.vditor');
      if (editorElement) {
        editorElement.scrollTop = linePosition;
      }
      
      // 高亮当前大纲项
      highlightCurrentOutlineItem(headingText);
      
      console.log(`🎯 成功跳转到第${foundLineIndex + 1}行`);
      
    } catch (error) {
      console.error('❌ 跳转失败:', error);
    }
  } else {
    console.warn(`⚠️  未找到标题: "${headingText}"`);
  }
  
  // 如果需要，聚焦编辑器
  if (focusEditor) {
    setTimeout(() => {
      if (typeof editorInstance.focus === 'function') {
        editorInstance.focus();
      }
    }, 100);
  }
}

/**
 * 高亮当前大纲项
 */
function highlightCurrentOutlineItem(headingText) {
  const outlineItems = document.querySelectorAll('.outline-item-improved');
  
  // 移除所有高亮
  outlineItems.forEach(item => {
    item.classList.remove('active');
  });
  
  // 高亮匹配的项
  outlineItems.forEach(item => {
    const text = item.textContent || item.innerText;
    if (text.includes(headingText)) {
      item.classList.add('active');
      
      // 滚动到可见区域
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

// 更新大纲按钮的事件监听器
function updateOutlineButtonListener() {
  const btnOutline = document.getElementById('btnOutline');
  if (btnOutline) {
    // 移除旧的事件监听器（通过克隆替换）
    const newBtn = btnOutline.cloneNode(true);
    btnOutline.parentNode.replaceChild(newBtn, btnOutline);
    
    // 添加新的事件监听器
    newBtn.addEventListener('click', toggleOutlineSidebar);
    newBtn.title = '显示/隐藏文档大纲';
    console.log('✅ 更新大纲按钮功能');
  }
}

// 在初始化完成后更新大纲按钮
setTimeout(updateOutlineButtonListener, 1000);
