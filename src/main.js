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
let editorInstance = null;
let contextTargetFile = null; // 用于存储当前右击的目标文件

// 处理通过命令行打开的文件
async function handleInitialFile() {
  try {
    console.log('🔍 检查是否有通过命令行打开的文件...');
    console.log('🔍 调用 invoke("get_initial_file")...');
    
    const initialFile = await invoke('get_initial_file');
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
              await openTextFileFromPath(decodedPath);
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
              // 直接尝试读取
              const text = await readTextFile(initialFile);
              console.log(`✅ 直接读取成功，长度: ${text.length}`);
              if (editorInstance) {
                editorInstance.setValue(String(text || ''));
              }
              currentFilePath = initialFile;
              document.getElementById('filePath').textContent = currentFilePath;
              updateStatus(`已打开: ${initialFile.split('/').pop()}`);
              return;
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
    }
  } catch (error) {
    console.error('❌ 获取初始文件失败:', error);
    console.error('❌ 错误名称:', error.name);
    console.error('❌ 错误详情:', error.message);
    console.error('❌ 错误堆栈:', error.stack);
    console.error('❌ 错误完整对象:', error);
  }
}

// 从文件路径打开文件
async function openFileFromPath(filePath) {
  try {
    console.log(`尝试读取文件: ${filePath}`);
    const text = await readTextFile(filePath);
    console.log(`成功读取文件内容长度: ${text.length}`);

    // 获取文件信息
    const fileName = await basename(filePath);
    const fileInfo = getFileType(fileName);

    console.log(`📁 文件类型: ${fileInfo.name}`);
    console.log(`📝 编辑器模式: ${getEditorMode(fileName)}`);
    console.log(`💻 编程语言: ${getFileLanguage(fileName)}`);

    // 设置编辑器内容
    if (editorInstance) {
      editorInstance.setValue(String(text || ''));

      // 根据文件类型调整编辑器模式
      adjustEditorForFileType(fileName);
    }

    currentFilePath = filePath;

    // 更新界面显示
    updateFileInfoDisplay(fileName, fileInfo);

    // 更新侧边栏
    const dirPath = await dirname(filePath);
    await populateFileList(dirPath, fileName);

    updateStatus(`已打开: ${fileName} (${fileInfo.name})`);
  } catch (error) {
    console.error('❌ 打开文件失败:', error);
    updateStatus(`打开文件失败: ${error}`);
    alert(`无法打开文件: ${error}\n路径: ${filePath}`);
  }
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

  // 先绑定事件监听器（UI 骨架已经可交互）
  setupEventListeners();
  populateFileList();

  // 异步初始化 Vditor 编辑器
  initVditor().then(() => {
    console.log('🎉 编辑器初始化完成');
    updateStatus('应用已就绪');
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

      // 获取文件扩展名
      const parts = entry.name.split('.');
      if (parts.length < 2) {
        // 无扩展名的文件，检查是否是特殊文件
        const specialFiles = ['Dockerfile', 'Makefile', 'dockerfile', 'makefile'];
        return specialFiles.includes(entry.name);
      }

      const extension = parts[parts.length - 1].toLowerCase();
      const supportedExtensions = getSupportedExtensions();
      return supportedExtensions.includes(extension);
    });

    fileList.innerHTML = '';

    if (files.length === 0) {
      fileList.innerHTML = '<div style="padding: 15px; color: var(--text-secondary, #666); text-align: center; font-size: 13px;">此文件夹没有对应的文本文件</div>';
      return;
    }

    files.forEach(file => {
      const el = document.createElement('div');
      const isActive = file.name === activeFileName;
      const fileIcon = getFileIcon(file.name);
      const fileType = getFileType(file.name);
      
      el.className = `file-item ${isActive ? 'active' : ''}`;
      el.innerHTML = `
        <span class="file-icon">${fileIcon}</span>
        <span class="file-name" title="${file.name}">${file.name}</span>
        <span class="file-type-badge">${fileType.name}</span>
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
        const fileFilters = getSupportedFileFilters();

        const selected = await open({
          multiple: false,
          filters: fileFilters,
          defaultPath: currentFilePath ? await dirname(currentFilePath) : undefined
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
          // 之前是由"新建文档"创建并未保存，或者是初次启动
          const defaultFilename = await getDefaultSaveFilename(null, content);
          const selectedPath = await save({
            title: '保存新文档',
            defaultPath: defaultFilename,
            filters: getSupportedFileFilters()
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

// 将文件类型函数暴露到全局，方便测试
window.getFileType = getFileType;
window.getFileIcon = getFileIcon;
window.isMarkdownFile = isMarkdownFile;
window.getEditorMode = getEditorMode;
window.getFileLanguage = getFileLanguage;

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

  // 对于非 Markdown 文件，禁用一些 Markdown 特定的工具栏按钮
  if (!isMarkdown) {
    // 可以在这里添加逻辑来隐藏或禁用某些工具栏按钮
    console.log('ℹ️  非 Markdown 文件，已禁用 Markdown 特定功能');

    // 更新编辑器提示
    const editorContainer = document.getElementById('vditor-container');
    if (editorContainer) {
      const hintElement = editorContainer.querySelector('.file-type-hint');
      if (!hintElement) {
        const hint = document.createElement('div');
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
        hint.innerHTML = `📄 正在编辑 ${fileInfo.name} 文件 (${fileInfo.icon})`;
        editorContainer.parentNode.insertBefore(hint, editorContainer);
      }
    }
  }

  // 根据文件类型设置合适的编辑器模式
  // 对于纯文本文件，使用源码模式
  // 对于代码文件，使用源码模式
  // 对于 Markdown 文件，保持原有模式
  if (editorMode === 'plain' || editorMode === 'code') {
    // 非 Markdown 文件，确保使用源码模式
    if (editorInstance.vditor) {
      editorInstance.vditor.toolbar.elements.editMode?.addEventListener('click', () => {
        // 切换编辑模式时，限制非 Markdown 文件只能使用源码模式
        editorInstance.setMode('sv');
      });
    }
  }
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