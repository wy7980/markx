/**
 * 单元测试 - 编辑器操作模块
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟编辑器操作
class EditorOperations {
  constructor() {
    this.content = '';
    this.selection = { start: 0, end: 0 };
  }

  setContent(content) {
    this.content = content;
  }

  getContent() {
    return this.content;
  }

  insertText(text, position = null) {
    const pos = position ?? this.selection.start;
    this.content = 
      this.content.slice(0, pos) + 
      text + 
      this.content.slice(pos);
    this.selection.start = pos + text.length;
    this.selection.end = this.selection.start;
  }

  wrapSelection(before, after) {
    const selected = this.content.slice(this.selection.start, this.selection.end);
    this.content = 
      this.content.slice(0, this.selection.start) + 
      before + selected + after + 
      this.content.slice(this.selection.end);
    this.selection.end = this.selection.start + before.length + selected.length + after.length;
  }

  bold() {
    this.wrapSelection('**', '**');
  }

  italic() {
    this.wrapSelection('*', '*');
  }

  strikethrough() {
    this.wrapSelection('~~', '~~');
  }

  code() {
    this.wrapSelection('`', '`');
  }

  heading(level = 1) {
    const prefix = '#'.repeat(level) + ' ';
    const lineStart = this.findLineStart();
    this.content = 
      this.content.slice(0, lineStart) + 
      prefix + 
      this.content.slice(lineStart);
  }

  findLineStart() {
    let pos = this.selection.start;
    while (pos > 0 && this.content[pos - 1] !== '\n') {
      pos--;
    }
    return pos;
  }

  insertLink(text, url) {
    this.insertText(`[${text}](${url})`);
  }

  insertImage(alt, url) {
    this.insertText(`![${alt}](${url})`);
  }

  insertCodeBlock(lang = '') {
    this.insertText(`\`\`\`${lang}\n\`\`\`\n`);
  }

  insertQuote() {
    const lineStart = this.findLineStart();
    this.content = 
      this.content.slice(0, lineStart) + 
      '> ' + 
      this.content.slice(lineStart);
  }

  insertList(ordered = false) {
    const lineStart = this.findLineStart();
    const marker = ordered ? '1. ' : '- ';
    this.content = 
      this.content.slice(0, lineStart) + 
      marker + 
      this.content.slice(lineStart);
  }
}

describe('EditorOperations', () => {
  let editor;

  beforeEach(() => {
    editor = new EditorOperations();
  });

  describe('基础操作', () => {
    it('应该设置和获取内容', () => {
      editor.setContent('# 标题\n内容');
      expect(editor.getContent()).toBe('# 标题\n内容');
    });

    it('应该插入文本', () => {
      editor.setContent('Hello World');
      editor.selection = { start: 5, end: 5 };
      editor.insertText(' Beautiful');
      expect(editor.getContent()).toBe('Hello Beautiful World');
    });

    it('应该更新光标位置', () => {
      editor.setContent('Test');
      editor.selection = { start: 0, end: 0 };
      editor.insertText('New ');
      expect(editor.selection.start).toBe(4);
      expect(editor.selection.end).toBe(4);
    });
  });

  describe('格式化', () => {
    it('应该加粗选中文本', () => {
      editor.setContent('Hello World');
      editor.selection = { start: 0, end: 5 };
      editor.bold();
      expect(editor.getContent()).toBe('**Hello** World');
    });

    it('应该斜体选中文本', () => {
      editor.setContent('Hello World');
      editor.selection = { start: 0, end: 5 };
      editor.italic();
      expect(editor.getContent()).toBe('*Hello* World');
    });

    it('应该删除线选中文本', () => {
      editor.setContent('Hello World');
      editor.selection = { start: 0, end: 5 };
      editor.strikethrough();
      expect(editor.getContent()).toBe('~~Hello~~ World');
    });

    it('应该行内代码选中文本', () => {
      editor.setContent('Hello World');
      editor.selection = { start: 0, end: 5 };
      editor.code();
      expect(editor.getContent()).toBe('`Hello` World');
    });
  });

  describe('块级元素', () => {
    it('应该插入标题', () => {
      editor.setContent('标题文本\n第二行');
      editor.selection = { start: 0, end: 0 };
      editor.heading(1);
      expect(editor.getContent()).toBe('# 标题文本\n第二行');
    });

    it('应该插入二级标题', () => {
      editor.setContent('标题文本');
      editor.selection = { start: 0, end: 0 };
      editor.heading(2);
      expect(editor.getContent()).toBe('## 标题文本');
    });

    it('应该插入链接', () => {
      editor.setContent('');
      editor.insertLink('GitHub', 'https://github.com');
      expect(editor.getContent()).toBe('[GitHub](https://github.com)');
    });

    it('应该插入图片', () => {
      editor.setContent('');
      editor.insertImage('Logo', 'https://example.com/logo.png');
      expect(editor.getContent()).toBe('![Logo](https://example.com/logo.png)');
    });

    it('应该插入代码块', () => {
      editor.setContent('');
      editor.insertCodeBlock('javascript');
      expect(editor.getContent()).toBe('```javascript\n```\n');
    });

    it('应该插入引用', () => {
      editor.setContent('引用文本');
      editor.selection = { start: 0, end: 0 };
      editor.insertQuote();
      expect(editor.getContent()).toBe('> 引用文本');
    });

    it('应该插入无序列表', () => {
      editor.setContent('列表项');
      editor.selection = { start: 0, end: 0 };
      editor.insertList(false);
      expect(editor.getContent()).toBe('- 列表项');
    });

    it('应该插入有序列表', () => {
      editor.setContent('列表项');
      editor.selection = { start: 0, end: 0 };
      editor.insertList(true);
      expect(editor.getContent()).toBe('1. 列表项');
    });
  });

  describe('边界情况', () => {
    it('应该处理空内容', () => {
      editor.setContent('');
      editor.insertText('New');
      expect(editor.getContent()).toBe('New');
    });

    it('应该处理光标在末尾', () => {
      editor.setContent('Test');
      editor.selection = { start: 4, end: 4 };
      editor.insertText(' End');
      expect(editor.getContent()).toBe('Test End');
    });

    it('应该处理光标在开头', () => {
      editor.setContent('Test');
      editor.selection = { start: 0, end: 0 };
      editor.insertText('Start ');
      expect(editor.getContent()).toBe('Start Test');
    });

    it('应该处理多行文本', () => {
      editor.setContent('第一行\n第二行\n第三行');
      editor.selection = { start: 4, end: 4 }; // 第二行开头（字符位置：第一行3字符 + \n1字符 = 4）
      editor.insertList(false);
      expect(editor.getContent()).toBe('第一行\n- 第二行\n第三行');
    });
  });
});
