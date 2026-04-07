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

// 右键菜单 - 支持调试工具
document.addEventListener('contextmenu', (e) => {
  // 在编辑器区域右键时显示提示
  if (e.target.closest('.vditor') || e.target.closest('#vditor-container')) {
    console.log('🔧 右键菜单：可以使用 Ctrl+Shift+I 或 F12 打开开发者工具');
    // 不阻止默认右键菜单，让用户可以使用浏览器原生菜单
  }
});

// 键盘快捷键 - 打开开发者工具
document.addEventListener('keydown', (e) => {
  // F12 打开开发者工具
  if (e.key === 'F12') {
    console.log('🔧 按下 F12，尝试打开开发者工具...');
  }
  
  // Ctrl+Shift+I 打开开发者工具
  if (e.ctrlKey && e.shiftKey && e.key === 'I') {
    console.log('🔧 按下 Ctrl+Shift+I，尝试打开开发者工具...');
  }
});

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
          toolbar: ['both', 'preview', 'outline', 'export', 'devtools']
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
  } else {
    const file = {
      id: Date.now().toString(),
      name: name,
      content: content,
      path: path,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    files.unshift(file);
    currentFileId = file.id;
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
  list.innerHTML = files.map(file => `
    <div class="file-item ${file.id === currentFileId ? 'active' : ''}" data-id="${file.id}">
      <span class="file-icon">📄</span>
      <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
      <button class="delete-btn" data-id="${file.id}">✕</button>
    </div>
  `).join('');
  
  list.querySelectorAll('.file-item').forEach(item => {
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
  
  document.getElementById('btnOutline').addEventListener('click', () => {
    console.log('📑 切换大纲');
    document.getElementById('outline').classList.toggle('collapsed');
    document.getElementById('btnOutline').classList.toggle('active');
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
    if (window.__TAURI__) {
      try {
        const { open } = window.__TAURI__.dialog;
        const { readTextFile } = window.__TAURI__.fs;
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
    if (window.__TAURI__ && currentFilePath) {
      try {
        const { writeTextFile } = window.__TAURI__.fs;
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
    if (window.__TAURI__) {
      try {
        const { save } = window.__TAURI__.dialog;
        const { writeTextFile } = window.__TAURI__.fs;
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
  });
}
