/**
 * MarkEdit - 核心功能简化版
 * 解决构建问题，确保应用正常工作
 */
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, readDir } from '@tauri-apps/plugin-fs';
import { dirname, basename, extname, join } from '@tauri-apps/api/path';

console.log('🚀 MarkEdit 启动中...');

// 基础变量
let currentFilePath = null;
let editorInstance = null;

function initializeApp() {
  console.log('✅ 初始化应用');
  
  // 初始化Vditor编辑器
  initVditor().then(() => {
    console.log('🎉 编辑器初始化完成');
    setupEventListeners();
    populateFileList();
    updateStatus('应用已就绪');
  }).catch(err => {
    console.error('❌ 编辑器初始化失败:', err);
    updateStatus('编辑器初始化失败');
  });
}

// 填充并刷新文件列表
async function populateFileList(dirPath, activeFileName) {
  const fileList = document.getElementById('fileList');
  const sidebarFolder = document.getElementById('sidebarFolder');
  const folderNameSpan = document.getElementById('folderName');
  if (!fileList) return;
  
  if (!dirPath) {
    fileList.innerHTML = '<div style="padding: 15px; color: var(--text-secondary, #666); text-align: center; font-size: 13px;">请打开文件以显示列表</div>';
    if (sidebarFolder) sidebarFolder.style.display = 'none';
    return;
  }

  try {
    const folderName = await basename(dirPath);
    if (sidebarFolder && folderNameSpan) {
      sidebarFolder.style.display = 'block';
      folderNameSpan.textContent = folderName;
    }

    const entries = await readDir(dirPath);
    const files = entries.filter(entry => {
      if (entry.isDirectory) return false;
      const lowerName = entry.name.toLowerCase();
      return lowerName.endsWith('.md') || lowerName.endsWith('.txt');
    });
    
    fileList.innerHTML = '';
    
    if (files.length === 0) {
      fileList.innerHTML = '<div style="padding: 15px; color: var(--text-secondary, #666); text-align: center; font-size: 13px;">此文件夹没有对应的文本文件</div>';
      return;
    }

    files.forEach(file => {
      const el = document.createElement('div');
      const isActive = file.name === activeFileName;
      el.className = `file-item ${isActive ? 'active' : ''}`;
      el.innerHTML = `
        <span class="file-name" title="${file.name}">${file.name}</span>
      `;
      el.addEventListener('click', async () => {
        try {
          const filePath = await join(dirPath, file.name);
          console.log(`尝试读取文件: ${filePath}`);
          const text = await readTextFile(filePath);
          console.log(`成功读取文件内容长度: ${text.length}`);
          if (editorInstance) {
            editorInstance.setValue(String(text || ''));
          }
          currentFilePath = filePath;
          document.getElementById('filePath').textContent = currentFilePath;
          updateStatus(`已打开: ${file.name}`);
          
          document.querySelectorAll('.file-item').forEach(i => i.classList.remove('active'));
          el.classList.add('active');
        } catch (error) {
          console.error('❌ 读取文件失败:', error);
          updateStatus(`读取文件失败: ${error}`);
          alert(`读取失败: ${error}\n路径: ${dirPath}\\${file.name}`);
        }
      });
      fileList.appendChild(el);
    });
  } catch (error) {
    console.error('❌ 读取目录失败:', error);
  }
}

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
        'edit-mode'  // 编辑模式切换
      ],
      outline: {
        enable: true,
        position: 'right'
      },
      input: () => {
        updateWordCount();
      },
      after: () => {
        console.log('✅ Vditor 编辑器已加载');
        updateWordCount();
        resolve();
      }
    });
  });
}

// 设置事件监听器
function setupEventListeners() {
  console.log('🛠️ 设置事件监听器');
  
  // 新建文件按钮
  const btnNew = document.getElementById('btnNew');
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      console.log('📄 新建文件');
      if (editorInstance) {
        editorInstance.setValue('# 新文档\n\n开始编辑...', true);
      }
      currentFilePath = null;
      document.getElementById('filePath').textContent = '未保存';
      document.querySelectorAll('.file-item').forEach(i => i.classList.remove('active'));
      updateStatus('已创建新文档 (未保存)');
    });
  }
  
  // 打开文件按钮
  const btnOpen = document.getElementById('btnOpen');
  if (btnOpen) {
    btnOpen.addEventListener('click', async () => {
      console.log('📁 打开文件');
      try {
        const selected = await open({
          multiple: false,
          filters: [{
            name: '文本文件',
            extensions: ['md', 'txt']
          }]
        });
        
        if (selected) {
          // 兼容Tauri API的不同返回值 (字符串 或 {path: ...})
          const filePath = selected.path || selected;
          const text = await readTextFile(filePath);
          if (editorInstance) {
            editorInstance.setValue(text);
          }
          currentFilePath = filePath;
          const fileName = await basename(filePath);
          const dirPath = await dirname(filePath);
          
          document.getElementById('filePath').textContent = currentFilePath;
          updateStatus(`已打开: ${fileName}`);
          
          // 更新侧边栏文件列表
          await populateFileList(dirPath, fileName);
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
                const text = await file.text();
                if (editorInstance) {
                  editorInstance.setValue(text);
                }
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
    btnSave.addEventListener('click', async () => {
      console.log('💾 保存文件');
      if (!editorInstance) return;
      const content = editorInstance.getValue();
      
      try {
        if (currentFilePath) {
          // 当前已有被打开的绝对路径，直接覆盖保存
          await writeTextFile(currentFilePath, content);
          updateStatus('已保存');
        } else {
          // 之前是由“新建文档”创建并未保存，或者是初次启动
          const selectedPath = await save({
            title: '保存新文档',
            defaultPath: '未命名文档.md',
            filters: [{
              name: '文本文件',
              extensions: ['md', 'txt']
            }]
          });
          
          if (selectedPath) {
            await writeTextFile(selectedPath, content);
            currentFilePath = selectedPath;
            const fileName = await basename(selectedPath);
            const dirPath = await dirname(selectedPath);
            
            document.getElementById('filePath').textContent = currentFilePath;
            updateStatus(`已保存至: ${fileName}`);
            
            // 更新左侧列表
            await populateFileList(dirPath, fileName);
          }
        }
      } catch (error) {
        console.error('❌ 保存文件失败:', error);
        
        // Web端兜底，触发浏览器下载
        if (String(error).includes('__TAURI_IPC__') || String(error).includes('Tauri')) {
          const blob = new Blob([content], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = '未命名文档.md';
          a.click();
          URL.revokeObjectURL(url);
          updateStatus('已通过浏览器下载保存');
        } else {
          updateStatus('保存出错');
          alert(`保存文件失败: ${error}`);
        }
      }
    });
  }
  
  // 导出文件按钮
  const btnExport = document.getElementById('btnExport');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      console.log('📤 导出文件');
      const content = editorInstance ? editorInstance.getValue() : '';
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'document.md';
      a.click();
      URL.revokeObjectURL(url);
      updateStatus('已导出');
    });
  }
  
  // 由于编辑器模式切换采用内置工具栏的功能更为稳定，这里已移除自定义模式下拉的绑定。
  
  // 主题切换按钮
  const btnTheme = document.getElementById('btnTheme');
  if (btnTheme) {
    btnTheme.addEventListener('click', toggleTheme);
  }
  
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
      const outlineEl = document.querySelector('.vditor-outline');
      if (outlineEl) {
        outlineEl.style.display = (outlineEl.style.display === 'none' || outlineEl.style.display === '') ? 'block' : 'none';
      } else {
        // Fallback to native toggle
        const nativeOutlineBtn = document.querySelector('.vditor-toolbar [data-type="outline"]');
        if (nativeOutlineBtn) nativeOutlineBtn.click();
      }
    });
  }
}

// 切换主题
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('markedit-theme', newTheme);
  
  // 更新编辑器主题
  if (editorInstance) {
    const editorTheme = newTheme === 'dark' ? 'dark' : 'classic';
    const contentTheme = newTheme === 'dark' ? 'dark' : 'light';
    const codeTheme = newTheme === 'dark' ? 'native' : 'github';
    editorInstance.setTheme(editorTheme, contentTheme, codeTheme);
  }
  
  // 显隐交由 CSS 中的 [data-theme] 选择器自动控制
  
  updateStatus(`已切换到${newTheme === 'light' ? '浅色' : '深色'}主题`);
}

// 更新字数统计
function updateWordCount() {
  if (!editorInstance) return;
  
  const content = editorInstance.getValue();
  const text = content.replace(/[#*`\[\]()>-]/g, '').replace(/\s/g, '');
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim()).length;
  
  const wordCount = document.getElementById('wordCount');
  const paraCount = document.getElementById('paraCount');
  
  if (wordCount) wordCount.textContent = text.length;
  if (paraCount) paraCount.textContent = paragraphs;
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

console.log('✅ 应用代码加载完成');