/**
 * MarkEdit - 核心功能简化版
 * 解决构建问题，确保应用正常工作
 */
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, readDir, rename, remove } from '@tauri-apps/plugin-fs';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { dirname, basename, extname, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import Vditor from 'vditor';
import 'vditor/dist/index.css';

console.log('🚀 MarkEdit 启动中...');

// 基础变量
let currentFilePath = null;
let editorInstance = null;
let contextTargetFile = null; // 用于存储当前右击的目标文件

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
  
  // 先绑定事件监听器（UI 骨架已经可交互）
  setupEventListeners();
  populateFileList();
  
  // 异步初始化 Vditor 编辑器
  initVditor().then(() => {
    console.log('🎉 编辑器初始化完成');
    updateStatus('应用已就绪');
    hideSplash();
  }).catch(err => {
    console.error('❌ 编辑器初始化失败:', err);
    updateStatus('编辑器初始化失败');
    hideSplash();
  });
  
  // 安全兜底：10 秒后强制隐藏 splash
  setTimeout(hideSplash, 10000);
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
      
      // 添加右键菜单拦截
      el.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const filePath = await join(dirPath, file.name);
        showContextMenu(e.clientX, e.clientY, filePath, file.name);
      });
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
      if (!contextTargetFile) return;
      try {
        const dir = await dirname(contextTargetFile.path);
        await shellOpen(dir);
        updateStatus('已在资源管理器中打开');
      } catch (e) {
        alert('打开目录失败: ' + e);
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
          if (currentFilePath === contextTargetFile.path) {
            currentFilePath = null;
            document.getElementById('filePath').textContent = '未保存';
            if (editorInstance) editorInstance.setValue('', true);
          }
          const dir = await dirname(contextTargetFile.path);
          await populateFileList(dir, currentFilePath ? await basename(currentFilePath) : null);
        } catch (e) {
          alert('删除失败: ' + e);
        }
      }
    });
  }

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
      if (!editorInstance) return;
      try {
        const defaultName = currentFilePath ? await basename(currentFilePath) : '未命名文档.md';
        const selectedPath = await save({
          title: '导出 Markdown',
          defaultPath: defaultName,
          filters: [{ name: 'Markdown 文件', extensions: ['md'] }]
        });
        if (selectedPath) {
          await writeTextFile(selectedPath, editorInstance.getValue());
          updateStatus(`已导出 Markdown: ${await basename(selectedPath)}`);
        }
      } catch (e) {
        console.error('导出 Markdown 失败:', e);
        // Web 端兜底
        const blob = new Blob([editorInstance.getValue()], { type: 'text/markdown' });
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
      if (!editorInstance) return;
      const htmlContent = editorInstance.getHTML();
      const fullHtml = `<!DOCTYPE html>
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
      try {
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
      if (!editorInstance) return;
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