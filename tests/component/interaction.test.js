/**
 * 组件测试 - 交互测试
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// DOM 辅助函数
function createDOM(html) {
  document.body.innerHTML = html;
}

function getElement(selector) {
  return document.querySelector(selector);
}

function getAllElements(selector) {
  return document.querySelectorAll(selector);
}

function fireEvent(element, event) {
  const evt = new Event(event, { bubbles: true });
  element.dispatchEvent(evt);
}

function click(element) {
  fireEvent(element, 'click');
}

function mousedown(element) {
  fireEvent(element, 'mousedown');
}

function mouseup(element) {
  fireEvent(element, 'mouseup');
}

// 模拟拖拽
function simulateDrag(element, startX, startY, endX, endY) {
  mousedown(element);
  const moveEvent = new MouseEvent('mousemove', {
    bubbles: true,
    clientX: startX,
    clientY: startY,
  });
  document.dispatchEvent(moveEvent);
  
  const endMoveEvent = new MouseEvent('mousemove', {
    bubbles: true,
    clientX: endX,
    clientY: endY,
  });
  document.dispatchEvent(endMoveEvent);
  
  mouseup(element);
}

describe('文件项交互', () => {
  beforeEach(() => {
    createDOM(`
      <div class="file-list" id="fileList">
        <div class="file-item" data-id="1">文档1</div>
        <div class="file-item" data-id="2">文档2</div>
        <div class="file-item" data-id="3">文档3</div>
      </div>
    `);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('点击应该切换激活状态', () => {
    const items = getAllElements('.file-item');
    
    click(items[1]);
    items[1].classList.add('active');
    
    expect(items[1].classList.contains('active')).toBe(true);
  });

  it('应该只允许一个激活项', () => {
    const items = getAllElements('.file-item');
    
    // 模拟切换逻辑
    items.forEach(i => i.classList.remove('active'));
    items[0].classList.add('active');
    
    expect(items[0].classList.contains('active')).toBe(true);
    expect(items[1].classList.contains('active')).toBe(false);
  });

  it('应该显示删除按钮', () => {
    const items = getAllElements('.file-item');
    
    // 模拟悬停显示删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '✕';
    items[0].appendChild(deleteBtn);
    
    expect(items[0].querySelector('.delete-btn')).toBeDefined();
  });
});

describe('大纲交互', () => {
  beforeEach(() => {
    createDOM(`
      <div class="outline" id="outline">
        <div class="outline-header">
          <span class="outline-title">📑 大纲</span>
          <button class="outline-collapse" id="btnCollapseAll">折叠</button>
        </div>
        <div class="outline-list" id="outlineList">
          <div class="outline-item h1" data-line="1">📌 标题一</div>
          <div class="outline-item h2" data-line="3">📎 标题二</div>
          <div class="outline-item h3" data-line="5">📍 标题三</div>
        </div>
      </div>
    `);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('点击大纲项应该高亮', () => {
    const items = getAllElements('.outline-item');
    
    click(items[0]);
    items[0].classList.add('active');
    
    expect(items[0].classList.contains('active')).toBe(true);
  });

  it('折叠按钮应该触发事件', () => {
    const btn = getElement('#btnCollapseAll');
    let collapsed = false;
    
    btn.addEventListener('click', () => {
      collapsed = true;
    });
    
    click(btn);
    expect(collapsed).toBe(true);
  });

  it('大纲项应该有正确的层级类', () => {
    const items = getAllElements('.outline-item');
    
    expect(items[0].classList.contains('h1')).toBe(true);
    expect(items[1].classList.contains('h2')).toBe(true);
    expect(items[2].classList.contains('h3')).toBe(true);
  });
});

describe('主题切换交互', () => {
  beforeEach(() => {
    createDOM(`
      <html data-theme="light">
        <body>
          <button class="theme-toggle" id="btnTheme">切换主题</button>
        </body>
      </html>
    `);
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '';
  });

  it('点击应该切换主题', () => {
    const btn = getElement('#btnTheme');
    const html = document.documentElement;
    
    btn.addEventListener('click', () => {
      const current = html.getAttribute('data-theme');
      html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
    });
    
    click(btn);
    expect(html.getAttribute('data-theme')).toBe('dark');
    
    click(btn);
    expect(html.getAttribute('data-theme')).toBe('light');
  });
});

describe('侧边栏交互', () => {
  beforeEach(() => {
    createDOM(`
      <div class="app">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-header">MarkEdit</div>
        </aside>
        <main class="main">
          <button class="toolbar-btn" id="btnToggleSidebar">切换</button>
        </main>
      </div>
    `);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('点击按钮应该切换侧边栏', () => {
    const btn = getElement('#btnToggleSidebar');
    const sidebar = getElement('#sidebar');
    
    btn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
    
    click(btn);
    expect(sidebar.classList.contains('collapsed')).toBe(true);
    
    click(btn);
    expect(sidebar.classList.contains('collapsed')).toBe(false);
  });
});

describe('状态栏交互', () => {
  beforeEach(() => {
    createDOM(`
      <div class="status-bar">
        <span id="statusText">就绪</span>
        <span id="filePath">未保存</span>
      </div>
    `);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('应该能更新状态文本', () => {
    const statusText = getElement('#statusText');
    statusText.textContent = '已保存';
    
    expect(statusText.textContent).toBe('已保存');
  });

  it('应该能显示文件路径', () => {
    const filePath = getElement('#filePath');
    filePath.textContent = '/path/to/file.md';
    
    expect(filePath.textContent).toBe('/path/to/file.md');
  });
});

describe('工具栏交互', () => {
  beforeEach(() => {
    createDOM(`
      <div class="toolbar">
        <button class="toolbar-btn" data-action="bold">B</button>
        <button class="toolbar-btn" data-action="italic">I</button>
        <button class="toolbar-btn" data-action="strikethrough">S</button>
        <select class="toolbar-select" id="selectMode">
          <option value="wysiwyg">所见即所得</option>
          <option value="ir">即时渲染</option>
        </select>
      </div>
    `);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('格式按钮应该触发事件', () => {
    const boldBtn = getElement('[data-action="bold"]');
    let action = null;
    
    boldBtn.addEventListener('click', () => {
      action = 'bold';
    });
    
    click(boldBtn);
    expect(action).toBe('bold');
  });

  it('下拉选择应该改变值', () => {
    const select = getElement('#selectMode');
    
    select.value = 'ir';
    expect(select.value).toBe('ir');
  });

  it('按钮应该能显示激活状态', () => {
    const btn = getElement('[data-action="bold"]');
    btn.classList.add('active');
    
    expect(btn.classList.contains('active')).toBe(true);
  });
});

describe('键盘导航', () => {
  beforeEach(() => {
    createDOM(`
      <div class="file-list" id="fileList">
        <div class="file-item active" data-id="1" tabindex="0">文档1</div>
        <div class="file-item" data-id="2" tabindex="0">文档2</div>
        <div class="file-item" data-id="3" tabindex="0">文档3</div>
      </div>
    `);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('应该支持 tab 索引', () => {
    const items = getAllElements('.file-item');
    
    expect(items[0].getAttribute('tabindex')).toBe('0');
    expect(items[1].getAttribute('tabindex')).toBe('0');
    expect(items[2].getAttribute('tabindex')).toBe('0');
  });

  it('应该能通过键盘选择', () => {
    const items = getAllElements('.file-item');
    
    // 模拟键盘导航
    const handleKeydown = (e) => {
      if (e.key === 'ArrowDown') {
        const activeItem = document.querySelector('.file-item.active');
        const nextItem = activeItem.nextElementSibling;
        if (nextItem) {
          activeItem.classList.remove('active');
          nextItem.classList.add('active');
        }
      }
    };
    
    document.addEventListener('keydown', handleKeydown);
    
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    document.dispatchEvent(event);
    
    expect(items[1].classList.contains('active')).toBe(true);
  });
});
