// State
let vditor = null;
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
  if (e.target.closest('.vditor') || e.target.closest('#vditor')) {
    console.log('🔧 右键菜单：可以使用 Ctrl+Shift+I 或 F12 打开开发者工具');
    // 不阻止默认右键菜单，让用户可以使用浏览器原生菜单
  }
});

// 键盘快捷键 - 打开开发者工具
document.addEventListener('keydown', (e) => {
  // F12 打开开发者工具
  if (e.key === 'F12') {
    console.log('🔧 按下 F12，尝试打开开发者工具...');
    
    // 如果是Tauri环境，可能需要特殊处理
    if (window.__TAURI__) {
      console.log('📱 检测到Tauri环境，F12可能需要额外配置才能工作');
      console.log('💡 尝试使用右键菜单 → 检查，或 Ctrl+Shift+I');
    }
  }
  
  // Ctrl+Shift+I 打开开发者工具
  if (e.ctrlKey && e.shiftKey && e.key === 'I') {
    console.log('🔧 按下 Ctrl+Shift+I，尝试打开开发者工具...');
  }
  
  // Ctrl+Shift+J 打开开发者工具（Console 面板）
  if (e.ctrlKey && e.shiftKey && e.key === 'J') {
    console.log('🔧 按下 Ctrl+Shift+J，尝试打开开发者工具（Console）...');
  }
  
  // 添加右键菜单提示
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
    console.log('💡 提示：也可以在应用内右键点击，选择"检查"打开开发者工具');
  }
});

// 初始化函数
function initializeApp() {
  // 防止重复初始化
  if (appInitialized) {
    console.log('⚠️ 应用已初始化，跳过');
    return;
  }
  appInitialized = true;
  
  console.log('🚀 开始初始化 MarkEdit 应用...');
  console.log('DOM 状态:', document.readyState);
  console.log('Tauri 可用:', !!window.__TAURI__);
  
  // 检查关键元素
  const requiredIds = ['btnNew', 'btnOpen', 'btnSave', 'btnExport', 'btnToggleSidebar', 'btnOutline', 'btnTheme', 'selectMode', 'vditor', 'fileList', 'outlineList', 'wordCount', 'paraCount', 'statusText'];
  const missing = requiredIds.filter(id => !document.getElementById(id));
  
  if (missing.length > 0) {
    console.error('❌ 缺少 DOM 元素:', missing);
    return;
  }
  
  console.log('✓ 所有必需元素已找到');
  
  // 初始化
  initVditor().then(() => {
    console.log('✓ Vditor 初始化完成');
    loadFiles();
    console.log('✓ 文件列表已加载');
    loadTheme();
    console.log('✓ 主题已加载');
    setupEventListeners();
    console.log('✓ 事件监听器已绑定');
    console.log('🎉 MarkEdit 应用初始化完成！');
  }).catch(err => {
    console.error('❌ Vditor 初始化失败:', err);
    // 初始化失败时不显示错误条（避免干扰）
  });
}

// 多种初始化方式确保可靠触发
if (document.readyState === 'loading') {
  console.log('📋 DOM 加载中，等待 DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  console.log('📋 DOM 已就绪，立即初始化');
  initializeApp();
}

// Tauri 备用初始化
if (window.__TAURI__ && window.__TAURI__.event) {
  window.__TAURI__.event.listen('tauri://ready', () => {
    console.log('📋 Tauri 就绪事件触发');
    if (!appInitialized) {
      initializeApp();
    }
  });
}

// Vditor Editor
async function initVditor() {
  vditor = new Vditor('vditor', {
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

## 功能特点

- 实时渲染 Markdown 语法
- 支持三种编辑模式：所见即所得、即时渲染、分屏预览
- 本地自动保存
- 暗色/亮色主题切换
- 文件大纲导航

## 快捷键

\`Ctrl+B\` 粗体 · \`Ctrl+I\` 斜体 · \`Ctrl+S\` 保存

> 写作是思考的最佳方式。—— Joan Didion

---

开始你的创作吧！ ✨
`,
    toolbar: [
      'headings',
      'bold',
      'italic',
      'strike',
      '|',
      'line',
      'quote',
      'list',
      'ordered-list',
      'check',
      '|',
      'code',
      'inline-code',
      '|',
      'link',
      'table',
      '|',
      'undo',
      'redo',
      '|',
      'edit-mode',
      {
        name: 'more',
        toolbar: [
          'both',
          'preview',
          'outline',
          'export',
          'devtools'
        ]
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
    }
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
  
  if (vditor) {
    vditor.setValue('');
  }
  
  updateStatus('新文档已创建');
}

function loadCurrentFile() {
  const file = files.find(f => f.id === currentFileId);
  if (file && vditor) {
    vditor.setValue(file.content || '');
    updateOutline();
    updateStats();
  }
}

function switchFile(id) {
  saveCurrentFile();
  currentFileId = id;
  currentFilePath = null;
  loadCurrentFile();
  renderFileList();
}

function deleteFile(id, e) {
  e.stopPropagation();
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
  if (file && vditor) {
    file.content = vditor.getValue();
    file.updatedAt = new Date().toISOString();
    
    // Update name from first heading
    const content = file.content;
    const match = content.match(/^#\s+(.+)$/m);
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
  
  // Add click handlers
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

// Outline
function updateOutline() {
  if (!vditor) return;
  
  const content = vditor.getValue();
  const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
  
  const icons = { h1: '📌', h2: '📎', h3: '📍', h4: '🔹' };
  
  const list = document.getElementById('outlineList');
  list.innerHTML = headings.map(h => {
    const level = (h.match(/^#+/) || [''])[0].length;
    const text = h.replace(/^#+\s+/, '');
    const tag = `h${Math.min(level, 4)}`;
    const icon = icons[tag] || '•';
    
    return `<div class="outline-item ${tag}" data-text="${text}">
      <span class="icon">${icon}</span>
      ${text}
    </div>`;
  }).join('');
  
  // Add click handlers
  list.querySelectorAll('.outline-item').forEach(item => {
    item.addEventListener('click', () => {
      const text = item.dataset.text;
      const content = vditor.getValue();
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(text)) {
          // Scroll to line (approximate)
          vditor.focus();
          break;
        }
      }
      
      // Highlight active
      list.querySelectorAll('.outline-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

// Stats
function updateStats() {
  if (!vditor) return;
  
  const content = vditor.getValue();
  const text = content.replace(/[#*`\[\]()>-]/g, '').replace(/\s/g, '');
  const wordCount = text.length;
  
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim()).length;
  
  document.getElementById('wordCount').textContent = wordCount;
  document.getElementById('paraCount').textContent = paragraphs;
}

// Theme
function loadTheme() {
  const theme = localStorage.getItem('markedit-theme') || 'light';
  setTheme(theme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('sunIcon').style.display = theme === 'dark' ? 'none' : 'block';
  document.getElementById('moonIcon').style.display = theme === 'dark' ? 'block' : 'none';
  
  if (vditor) {
    vditor.setTheme(theme === 'dark' ? 'dark' : 'classic');
  }
  
  localStorage.setItem('markedit-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

// Status
function updateStatus(msg) {
  document.getElementById('statusText').textContent = msg;
  setTimeout(() => {
    document.getElementById('statusText').textContent = '就绪';
  }, 2000);
}

// Event Listeners
function setupEventListeners() {
  console.log('🔧 开始绑定事件监听器...');
  
  // New file
  const btnNew = document.getElementById('btnNew');
  if (btnNew) {
    btnNew.addEventListener('click', createNewFile);
    console.log('✓ btnNew 事件已绑定');
  } else {
    console.error('✗ btnNew 元素未找到');
  }
  
  // Toggle sidebar
  const btnToggle = document.getElementById('btnToggleSidebar');
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      console.log('📂 切换侧边栏');
      document.getElementById('sidebar').classList.toggle('collapsed');
    });
    console.log('✓ btnToggleSidebar 事件已绑定');
  }
  
  // Toggle outline
  const btnOutline = document.getElementById('btnOutline');
  if (btnOutline) {
    btnOutline.addEventListener('click', () => {
      console.log('📑 切换大纲');
      const outline = document.getElementById('outline');
      const btn = document.getElementById('btnOutline');
      outline.classList.toggle('collapsed');
      btn.classList.toggle('active');
    });
    console.log('✓ btnOutline 事件已绑定');
  }
  
  // Theme
  const btnTheme = document.getElementById('btnTheme');
  if (btnTheme) {
    btnTheme.addEventListener('click', toggleTheme);
    console.log('✓ btnTheme 事件已绑定');
  }
  
  // Edit mode
  const selectMode = document.getElementById('selectMode');
  if (selectMode) {
    selectMode.addEventListener('change', (e) => {
      console.log('🔄 切换编辑模式:', e.target.value);
      if (vditor) {
        vditor.changeMode(e.target.value);
      }
    });
    console.log('✓ selectMode 事件已绑定');
  }
  
  // Open file (Tauri)
  const btnOpen = document.getElementById('btnOpen');
  if (btnOpen) {
    btnOpen.addEventListener('click', async () => {
      console.log('📁 打开文件按钮被点击');
      if (window.__TAURI__) {
        try {
          const { open } = window.__TAURI__.dialog;
          const { readTextFile } = window.__TAURI__.fs;
          
          const path = await open({
            filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }]
          });
          
          if (path) {
            const content = await readTextFile(path);
            vditor.setValue(content);
            currentFilePath = path;
            document.getElementById('filePath').textContent = path;
            updateStatus('文件已打开');
            console.log('✓ 文件已打开:', path);
          }
        } catch (err) {
          console.error('❌ 打开文件失败:', err);
          updateStatus('打开失败：' + err.message);
        }
      } else {
        // Fallback for web
        console.log('⚠️ Tauri 不可用，使用 Web 回退方案');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.md,.txt';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          const text = await file.text();
          vditor.setValue(text);
          document.getElementById('filePath').textContent = file.name;
          updateStatus('文件已打开');
        };
        input.click();
      }
    });
    console.log('✓ btnOpen 事件已绑定');
  }
  
  // Save file (Tauri)
  const btnSave = document.getElementById('btnSave');
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      console.log('💾 保存按钮被点击');
      if (window.__TAURI__ && currentFilePath) {
        try {
          const { writeTextFile } = window.__TAURI__.fs;
          await writeTextFile(currentFilePath, vditor.getValue());
          updateStatus('文件已保存');
          console.log('✓ 文件已保存:', currentFilePath);
        } catch (err) {
          console.error('❌ 保存失败:', err);
          updateStatus('保存失败：' + err.message);
        }
      } else {
        saveCurrentFile();
        updateStatus('已保存');
        console.log('✓ 已保存到本地存储');
      }
    });
    console.log('✓ btnSave 事件已绑定');
  }
  
  // Export
  const btnExport = document.getElementById('btnExport');
  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      console.log('📤 导出按钮被点击');
      if (window.__TAURI__) {
        try {
          const { save } = window.__TAURI__.dialog;
          const { writeTextFile } = window.__TAURI__.fs;
          
          const path = await save({
            filters: [{ name: 'Markdown', extensions: ['md'] }]
          });
          
          if (path) {
            await writeTextFile(path, vditor.getValue());
            updateStatus('导出成功');
            console.log('✓ 导出成功:', path);
          }
        } catch (err) {
          console.error('❌ 导出失败:', err);
          updateStatus('导出失败：' + err.message);
        }
      } else {
        // Fallback: download
        console.log('⚠️ Tauri 不可用，使用下载回退方案');
        const blob = new Blob([vditor.getValue()], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document.md';
        a.click();
        URL.revokeObjectURL(url);
        updateStatus('导出成功');
      }
    });
    console.log('✓ btnExport 事件已绑定');
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      console.log('⌨️ 快捷键 Ctrl+S/Cmd+S 触发');
      document.getElementById('btnSave').click();
    }
  });
  console.log('✓ 键盘快捷键已绑定');
  
  console.log('🎉 所有事件监听器绑定完成！');
}
