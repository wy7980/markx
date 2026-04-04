/**
 * 单元测试 - 大纲解析模块
 */
import { describe, it, expect } from 'vitest';

// 大纲解析器
class OutlineParser {
  constructor(content) {
    this.content = content;
  }

  extract() {
    const lines = this.content.split('\n');
    const headings = [];

    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          line: index + 1,
        });
      }
    });

    return headings;
  }

  toTree() {
    const headings = this.extract();
    const tree = [];
    const stack = [{ level: 0, children: tree }];

    headings.forEach(h => {
      const node = {
        level: h.level,
        text: h.text,
        line: h.line,
        children: [],
      };

      // 找到父节点
      while (stack[stack.length - 1].level >= h.level) {
        stack.pop();
      }

      stack[stack.length - 1].children.push(node);
      stack.push(node);
    });

    return tree;
  }

  toFlatList() {
    const headings = this.extract();
    const icons = { 1: '📌', 2: '📎', 3: '📍', 4: '🔹', 5: '▪️', 6: '·' };

    return headings.map(h => ({
      ...h,
      icon: icons[h.level] || '•',
      indent: Math.min(h.level - 1, 3),
    }));
  }

  getStats() {
    const text = this.content
      .replace(/[#*`\[\]()>-]/g, '')
      .replace(/\s/g, '');
    
    const paragraphs = this.content
      .split(/\n\n+/)
      .filter(p => p.trim())
      .length;

    const words = text.length;

    return {
      words,
      paragraphs,
      headings: this.extract().length,
    };
  }
}

describe('OutlineParser', () => {
  describe('extract()', () => {
    it('应该提取所有标题', () => {
      const content = `# 标题一
## 标题二
### 标题三
正文内容
#### 标题四`;
      
      const parser = new OutlineParser(content);
      const headings = parser.extract();

      expect(headings.length).toBe(4);
      expect(headings[0]).toEqual({
        level: 1,
        text: '标题一',
        line: 1,
      });
    });

    it('应该忽略非标题行', () => {
      const content = `# 标题
正文
**粗体**
- 列表`;
      
      const parser = new OutlineParser(content);
      const headings = parser.extract();

      expect(headings.length).toBe(1);
    });

    it('应该处理空内容', () => {
      const parser = new OutlineParser('');
      const headings = parser.extract();

      expect(headings).toEqual([]);
    });
  });

  describe('toTree()', () => {
    it('应该构建层级树', () => {
      const content = `# 第一章
## 第一节
### 小节一
## 第二节
# 第二章`;
      
      const parser = new OutlineParser(content);
      const tree = parser.toTree();

      expect(tree.length).toBe(2);
      expect(tree[0].children.length).toBe(2);
      expect(tree[0].children[0].children.length).toBe(1);
    });

    it('应该处理跳跃层级', () => {
      const content = `# H1
### H3 (跳过 H2)`;
      
      const parser = new OutlineParser(content);
      const tree = parser.toTree();

      expect(tree[0].children.length).toBe(1);
    });
  });

  describe('toFlatList()', () => {
    it('应该生成扁平列表带图标', () => {
      const content = `# 标题一
## 标题二
### 标题三`;
      
      const parser = new OutlineParser(content);
      const list = parser.toFlatList();

      expect(list[0].icon).toBe('📌');
      expect(list[1].icon).toBe('📎');
      expect(list[2].icon).toBe('📍');
    });

    it('应该计算缩进级别', () => {
      const content = `# H1
## H2
### H3
#### H4`;
      
      const parser = new OutlineParser(content);
      const list = parser.toFlatList();

      expect(list[0].indent).toBe(0);
      expect(list[1].indent).toBe(1);
      expect(list[2].indent).toBe(2);
      expect(list[3].indent).toBe(3);
    });
  });

  describe('getStats()', () => {
    it('应该统计字数', () => {
      const content = `# 标题
这是正文内容，包含一些文字。`;
      
      const parser = new OutlineParser(content);
      const stats = parser.getStats();

      expect(stats.words).toBeGreaterThan(0);
    });

    it('应该统计段落数', () => {
      const content = `# 标题

第一段。

第二段。

第三段。`;
      
      const parser = new OutlineParser(content);
      const stats = parser.getStats();

      expect(stats.paragraphs).toBe(4); // 包含标题
    });

    it('应该统计标题数', () => {
      const content = `# H1
## H2
### H3`;
      
      const parser = new OutlineParser(content);
      const stats = parser.getStats();

      expect(stats.headings).toBe(3);
    });
  });
});
