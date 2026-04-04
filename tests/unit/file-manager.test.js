/**
 * 单元测试 - 文件管理模块
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟文件管理逻辑
class FileManager {
  constructor() {
    this.files = [];
    this.currentFileId = null;
    this.storageKey = 'markedit-files';
  }

  load() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      this.files = JSON.parse(saved);
    }
    return this.files;
  }

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.files));
  }

  create(name = '未命名') {
    const file = {
      id: Date.now().toString(),
      name,
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.files.unshift(file);
    this.currentFileId = file.id;
    this.save();
    return file;
  }

  getCurrent() {
    return this.files.find(f => f.id === this.currentFileId);
  }

  update(id, content) {
    const file = this.files.find(f => f.id === id);
    if (file) {
      file.content = content;
      file.updatedAt = new Date().toISOString();
      
      // 从第一个标题更新名称
      const match = content.match(/^#\s+(.+)$/m);
      if (match) {
        file.name = match[1].slice(0, 20);
      }
      
      this.save();
      return true;
    }
    return false;
  }

  delete(id) {
    if (this.files.length === 1) {
      return false; // 至少保留一个
    }
    this.files = this.files.filter(f => f.id !== id);
    if (this.currentFileId === id) {
      this.currentFileId = this.files[0]?.id;
    }
    this.save();
    return true;
  }

  switch(id) {
    if (this.files.find(f => f.id === id)) {
      this.currentFileId = id;
      return true;
    }
    return false;
  }
}

describe('FileManager', () => {
  let fm;

  beforeEach(() => {
    localStorage.clear();
    fm = new FileManager();
  });

  describe('create()', () => {
    it('应该创建新文件', () => {
      const file = fm.create('测试文档');
      expect(file.name).toBe('测试文档');
      expect(file.content).toBe('');
      expect(fm.files.length).toBe(1);
    });

    it('应该使用默认名称', () => {
      const file = fm.create();
      expect(file.name).toBe('未命名');
    });

    it('应该自动生成 ID', () => {
      const file = fm.create();
      expect(file.id).toBeDefined();
      expect(typeof file.id).toBe('string');
    });

    it('应该设置时间戳', () => {
      const file = fm.create();
      expect(file.createdAt).toBeDefined();
      expect(file.updatedAt).toBeDefined();
    });
  });

  describe('update()', () => {
    it('应该更新文件内容', () => {
      const file = fm.create();
      fm.update(file.id, '# 新标题\n\n内容');
      
      const updated = fm.getCurrent();
      expect(updated.content).toBe('# 新标题\n\n内容');
    });

    it('应该从标题更新文件名', () => {
      const file = fm.create();
      fm.update(file.id, '# 我的新标题\n\n内容');
      
      const updated = fm.getCurrent();
      expect(updated.name).toBe('我的新标题');
    });

    it('应该截断过长的标题', () => {
      const file = fm.create();
      const longTitle = '这是一个非常非常非常非常非常非常非常长的标题';
      fm.update(file.id, `# ${longTitle}\n\n内容`);
      
      const updated = fm.getCurrent();
      expect(updated.name.length).toBeLessThanOrEqual(20);
    });
  });

  describe('delete()', () => {
    it('应该删除文件', async () => {
      const file1 = fm.create('文件1');
      await new Promise(r => setTimeout(r, 10)); // 确保 ID 不同
      const file2 = fm.create('文件2');
      await new Promise(r => setTimeout(r, 10));
      const file3 = fm.create('文件3');
      
      expect(fm.files.length).toBe(3);
      
      const result = fm.delete(file3.id);
      expect(result).toBe(true);
      expect(fm.files.length).toBe(2);
    });

    it('最后一个文件不能删除', () => {
      const file = fm.create('唯一文件');
      const result = fm.delete(file.id);
      
      expect(result).toBe(false);
      expect(fm.files.length).toBe(1);
    });
  });

  describe('switch()', () => {
    it('应该切换当前文件', () => {
      fm.create('文件1');
      const file2 = fm.create('文件2');
      
      expect(fm.currentFileId).toBe(file2.id);
      
      fm.switch(fm.files[0].id);
      expect(fm.currentFileId).toBe(fm.files[0].id);
    });

    it('无效 ID 不应该切换', () => {
      fm.create('文件1');
      const result = fm.switch('invalid-id');
      expect(result).toBe(false);
    });
  });

  describe('persistence', () => {
    it('应该持久化到 localStorage', () => {
      fm.create('持久化测试');
      
      const saved = localStorage.getItem('markedit-files');
      expect(saved).toBeDefined();
      
      const parsed = JSON.parse(saved);
      expect(parsed.length).toBe(1);
      expect(parsed[0].name).toBe('持久化测试');
    });

    it('应该从 localStorage 加载', () => {
      fm.create('文件1');
      fm.create('文件2');
      
      const newFm = new FileManager();
      newFm.load();
      
      expect(newFm.files.length).toBe(2);
    });
  });
});
