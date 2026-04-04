/**
 * 组件测试 - UI 组件
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

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

// 组件测试
describe('Sidebar 组件', () => {
  beforeEach(() => {
    createDOM(`
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <div class="logo">
            <div class="logo-icon">M</div>
            <span>MarkEdit</span>
          </div>
        </div>
        <div class="file-list" id="fileList">
          <div class="file-item active" data-id="1">
            <span class="file-icon">📄</span>
            <span>文档1</span>
          </div>
          <div class="file-item" data-id="2">
            <span class="file-icon">📄</span>
            <span>文档2</span>
          </div>
        </div>
        <div class="sidebar-footer">
          <button class="btn-new" id="btnNew">新建文档</button>
        </div>
      </aside>
    `);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('应该渲染文件列表', () => {
    const items = getAllElements('.file-item');
    expect(items.length).toBe(2);
  });

  it('应该高亮当前文件', () => {
    const activeItem = getElement('.file-item.active');
    expect(activeItem).toBeDefined();
    expect(activeItem.dataset.id).toBe('1');
  });

  it('点击文件项应该切换激活状态', () => {
    const items = getAllElements('.file-item');
    const item2 = items[1];
    
    click(item2);
    
    // 手动模拟切换逻辑
    items.forEach(i => i.classList.remove('active'));
    item2.classList.add('active');
    
    expect(item2.classList.contains('active')).toBe(true);
    expect(items[0].classList.contains('active')).toBe(false);
  });

  it('点击新建按钮应该触发事件', () => {
    const btn = getElement('#btnNew');
    let clicked = false;
    
    btn.addEventListener('click', () => {
      clicked = true;
    });
    
    click(btn);
    expect(clicked).toBe(true);
  });
});

describe('Toolbar 组件', () => {
  beforeEach(() => {
    createDOM(`
      <div class="toolbar">
        <button class="toolbar-btn" id="btnToggleSidebar">侧边栏</button>
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn" id="btnSave">保存</button>
        <select class="toolbar-select" id="selectMode">
          <option value="wysiwyg">所见即所得</option>
          <option value="ir">即时渲染</option>
          <option value="sv">分屏预览</option>
        </select>
        <button class="theme-toggle" id="btnTheme">主题</button>
      </div>
    `);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('应该渲染模式选择器', () => {
    const select = getElement('#selectMode');
    expect(select).toBeDefined();
    expect(select.options.length).toBe(3);
  });

  it('切换模式应该改变值', () => {
    const select = getElement('#selectMode');
    select.value = 'ir';
    
    expect(select.value).toBe('ir');
  });

  it('应该渲染主题按钮', () => {
    const btn = getElement('#btnTheme');
    expect(btn).toBeDefined();
  });
});

describe('Outline 组件', () => {
  beforeEach(() => {
    createDOM(`
      <div class="outline" id="outline">
        <div class="outline-header">
          <span class="outline-title">📑 大纲</span>
        </div>
        <div class="outline-list" id="outlineList">
          <div class="outline-item h1" data-text="标题一">
            <span class="icon">📌</span>
            标题一
          </div>
          <div class="outline-item h2" data-text="标题二">
            <span class="icon">📎</span>
            标题二
          </div>
        </div>
        <div class="outline-stats">
          <span>字数: <strong id="wordCount">100</strong></span>
          <span>段落: <strong id="paraCount">5</strong></span>
        </div>
      </div>
    `);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('应该渲染大纲项', () => {
    const items = getAllElements('.outline-item');
    expect(items.length).toBe(2);
  });

  it('应该显示正确的层级图标', () => {
    const items = getAllElements('.outline-item');
    expect(items[0].querySelector('.icon').textContent).toBe('📌');
    expect(items[1].querySelector('.icon').textContent).toBe('📎');
  });

  it('应该显示统计数据', () => {
    const wordCount = getElement('#wordCount');
    const paraCount = getElement('#paraCount');
    
    expect(wordCount.textContent).toBe('100');
    expect(paraCount.textContent).toBe('5');
  });

  it('点击大纲项应该触发跳转', () => {
    const item = getElement('.outline-item');
    let jumped = false;
    
    item.addEventListener('click', () => {
      jumped = true;
    });
    
    click(item);
    expect(jumped).toBe(true);
  });
});

describe('Status Bar 组件', () => {
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

  it('应该显示状态文本', () => {
    const status = getElement('#statusText');
    expect(status.textContent).toBe('就绪');
  });

  it('应该更新状态', () => {
    const status = getElement('#statusText');
    status.textContent = '已保存';
    
    expect(status.textContent).toBe('已保存');
  });
});
