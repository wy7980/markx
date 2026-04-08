/**
 * MarkEdit - 简化版本
 * 修复模式切换和大纲功能问题
 */

let files = [];
let currentFileId = null;
let currentFilePath = null;
let editorInstance = null;

// 初始化应用
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
  console.log('🚀 初始化 MarkEdit...');
  
  // 确保所有必需的DOM元素存在
  const requiredIds = ['btnNew', 'btnOpen', 'btnSave', 'btnExport', 'btnToggleSidebar', 'btnOutline', 'btnTheme', 'selectMode', 'vditor-container', 'fileList', 'wordCount', 'paraCount', 'statusText'];
  const missing = requiredIds.filter(id => !document.getElementById(id));
  if (missing.length > 0) {
    console.warn('⚠️ 缺少必需的DOM元素:', missing);
  }
  
  // 初始化Vditor
  initVditor().then(() => {
    console.log('✅ Vditor 初始化完成');
    
    // 加载保存的文件列表
    loadFiles();
    
    // 设置主题
    loadTheme();
    
    // 设置事件监听器
    setupEventListeners();
    
    console.log('🎉 MarkEdit 启动完成');
  }).catch(err => {
    console.error('❌ Vditor 初始化失败:', err);
  });
}

// Vditor 编辑器
function initVditor() {
  return new Promise((resolve) => {
    const defaultContent = `# 欢迎使用 MarkEdit

这是一个轻量级的Markdown编辑器，支持以下模式：

1. **源码模式** - 纯代码编辑
2. **阅读模式** - 只读预览
3. **所见即所得模式** - 实时编辑

## 功能特性

- 📝 实时预览
- 📑 文档大纲
- 🎨 主题切换
- 💾 文件管理

### 快捷键
- Ctrl+N: 新建文件
- Ctrl+O: 打开文件
- Ctrl+S: 保存文件`;

    editorInstance = new Vditor('vditor-container', {
      height: '100%',
      mode: 'wysiwyg',
      theme: 'classic',
      icon: 'material',
      cache: {
        enable: true,
        id: 'markedit-cache'
      },
      value: defaultContent,
      toolbar: [
        'headings', 'bold', 'italic', 'strike', '|',
        'line', 'quote', 'list', 'ordered-list', 'check', '|',
        'code', 'inline-code', '|',
        'link', 'table', '|',
        'undo', 'redo', '|',
        'outline',  // 大纲功能
        'edit-mode'  // 编辑模式切换
      ],
      input: (value) => {
        updateStats();
      },
      after: () => {
        console.log('✅ 编辑器已加载');
        resolve();
      }
    });
  });
}

// 加载保存的文件
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

// 保存文件列表
function saveFiles() {
  localStorage.setItem('markedit-files', JSON.stringify(files));
}

// 创建新文件
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

// 加载当前文件
function loadCurrentFile() {
  const file = files.find(f => f.id === currentFileId);
  if (file && editorInstance) {
    editorInstance.setValue(file.content || '');
    currentFilePath = file.path || null;
    updateStatusBar();
    updateStats();
  }
}

// 保存当前文件
function saveCurrentFile() {
  if (editorInstance) {
    const file = files.find(f => f.id === currentFileId);
    if (file) {
      file.content = editorInstance.getValue();
      file.updatedAt = new Date().toISOString();
      saveFiles();
      return true;
    }
  }
  return false;
}

// 切换到其他文件
function switchFile(id) {
  if (saveCurrentFile()) {
    currentFileId = id;
    loadCurrentFile();
    renderFileList();
    updateStatus('已切换到文档');
  }
}

// 打开外部文件
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
}

// 渲染文件列表
function renderFileList() {
  const list = document.getElementById('fileList');
  if (!list) return;
  
  list.innerHTML = files.map(file => `
    <div class="file-item ${file.id === currentFileId ? 'active' : ''}" data-id="${file.id}">
      <span class="file-icon">📄</span>
      <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
    </div>
  `).join('');
  
  list.querySelectorAll('.file-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      switchFile(id);
    });
  });
}

// 更新统计信息
function updateStats() {
  if (!editorInstance) return;
  const content = editorInstance.getValue();
  const text = content.replace(/[#*`\[\]()>-]/g, '').replace(/\s/g, '');
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim()).length;
  
  document.getElementById('wordCount').textContent = text.length;
  document.getElementById('paraCount').textContent = paragraphs;
}

// 更新状态栏
function updateStatusBar() {
  const file = files.find(f => f.id === currentFileId);
  if (file) {
    document.getElementById('statusText').textContent = `${file.name} - ${file.updatedAt ? new Date(file.updatedAt).toLocaleTimeString() : '已保存'}`;
  }
}

// 更新状态信息
function updateStatus(message) {
  console.log('📢', message);
  document.getElementById('statusText').textContent = message;
}

// 切换主题
function toggleTheme() {
  const current = localStorage.getItem('markedit-theme') || 'light';
  const newTheme = current === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
}

// 设置主题
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('markedit-theme', theme);
  
  const sunIcon = document.getElementById('sunIcon');
  const moonIcon = document.getElementById('moonIcon');
  
  if (theme === 'light') {
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
  } else {
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
  }
  updateStatus(`已切换到${theme === 'light' ? '浅色' : '深色'}主题`);
}

// 加载主题
function loadTheme() {
  const theme = localStorage.getItem('markedit-theme') || 'light';
  setTheme(theme);
}

// 设置事件监听器
function setupEventListeners() {
  // 新建文件
  document.getElementById('btnNew').addEventListener('click', () => {
    console.log('📄 新建文件');
    createNewFile();
  });
  
  // 打开文件
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
      } catch (err) {
        console.error('❌ Tauri打开文件失败:', err);
        // Web环境回退
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.md,.txt';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          const text = await file.text();
          openExternalFile(file.name, text);
        };
        input.click();
      }
    });
  
  // 保存文件
  document.getElementById('btnSave').addEventListener('click', async () => {
    console.log('💾 保存文件');
    if (window.__TAURI_INTERNALS__ && currentFilePath) {
      try {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        if (editorInstance) {
          await writeTextFile(currentFilePath, editorInstance.getValue());
        }
        updateStatus('文件已保存');
      } catch (err) {
        console.error('❌ Tauri保存文件失败:', err);
        updateStatus('保存失败');
      }
    } else {
      if (saveCurrentFile()) {
        updateStatus('已保存');
      } else {
        updateStatus('保存失败');
      }
    }
  });
  
  // 导出文件
  document.getElementById('btnExport').addEventListener('click', async () => {
    console.log('📤 导出文件');
    if (window.__TAURI_INTERNALS__) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        const path = await save({ filters: [{ name: 'Markdown', extensions: ['md'] }] });
        if (path && editorInstance) {
          await writeTextFile(path, editorInstance.getValue());
          updateStatus('导出成功');
        }
      } catch (err) {
        console.error('❌ Tauri导出失败:', err);
        // Web环境回退

        const content = editorInstance.getValue();
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document.md';
        a.click();
        URL.revokeObjectURL(url);
        updateStatus('下载完成');
      }
    } else {
      const content = editorInstance.getValue();
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'document.md';
      a.click();
      URL.revokeObjectURL(url);
      updateStatus('下载完成');
    }
  });
  
  // 切换侧边栏
  document.getElementById('btnToggleSidebar').addEventListener('click', () => {
    console.log('📐 切换侧边栏');
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
      updateStatus(`侧边栏${sidebar.classList.contains('collapsed') ? '折叠' : '展开'}`);
    }
  });
  
  // 大纲按钮 - 使用Vditor内置功能
  document.getElementById('btnOutline').addEventListener('click', () => {
    console.log('📑 大纲功能 - 使用Vditor内置');
    updateStatus('请使用工具栏的大纲功能');
  });
  
  // 模式选择
  const selectMode = document.getElementById('selectMode');
  if (selectMode) {
    selectMode.addEventListener('change', (e) => {
      const mode = e.target.value;
      console.log('🔄 切换编辑模式:', mode);
      
      if (editorInstance) {
        // 使用Vditor的内置模式切换

        try {
          if (typeof editorInstance.setMode === 'function') {
            editorInstance.setMode(mode);
            updateStatus(`已切换到${mode === 'code' ? '源码' : mode === 'read' ? '阅读' : '所见即所得'}模式`);
          } else {
            // 回退方案：使用Vditor的内置切换
            updateStatus('模式切换功能暂不可用');
          }
        } catch (error) {
          console.error('❌ 模式切换失败:', error);
          updateStatus('模式切换失败');
        }
      }
    });
  }
}

// 初始化应用
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

console.log('✅ MarkEdit 代码加载完成');