// State
let vditor = null;
let files = [];
let currentFileId = null;
let currentFilePath = null;
let saveTimeout = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await initVditor();
  loadFiles();
  loadTheme();
  setupEventListeners();
});

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
  // New file
  document.getElementById('btnNew').addEventListener('click', createNewFile);
  
  // Toggle sidebar
  document.getElementById('btnToggleSidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
  
  // Toggle outline
  document.getElementById('btnOutline').addEventListener('click', () => {
    const outline = document.getElementById('outline');
    const btn = document.getElementById('btnOutline');
    outline.classList.toggle('collapsed');
    btn.classList.toggle('active');
  });
  
  // Theme
  document.getElementById('btnTheme').addEventListener('click', toggleTheme);
  
  // Edit mode
  document.getElementById('selectMode').addEventListener('change', (e) => {
    if (vditor) {
      vditor.changeMode(e.target.value);
    }
  });
  
  // Open file (Tauri)
  document.getElementById('btnOpen').addEventListener('click', async () => {
    if (window.__TAURI__) {
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
      }
    } else {
      // Fallback for web
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
  
  // Save file (Tauri)
  document.getElementById('btnSave').addEventListener('click', async () => {
    if (window.__TAURI__ && currentFilePath) {
      const { writeTextFile } = window.__TAURI__.fs;
      await writeTextFile(currentFilePath, vditor.getValue());
      updateStatus('文件已保存');
    } else {
      saveCurrentFile();
      updateStatus('已保存');
    }
  });
  
  // Export
  document.getElementById('btnExport').addEventListener('click', async () => {
    if (window.__TAURI__) {
      const { save } = window.__TAURI__.dialog;
      const { writeTextFile } = window.__TAURI__.fs;
      
      const path = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      });
      
      if (path) {
        await writeTextFile(path, vditor.getValue());
        updateStatus('导出成功');
      }
    } else {
      // Fallback: download
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
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      document.getElementById('btnSave').click();
    }
  });
}
