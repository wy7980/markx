/**
 * 单元测试 - 快捷键管理模块
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟快捷键管理器
class ShortcutManager {
  constructor() {
    this.shortcuts = new Map();
    this.enabled = true;
  }

  register(combo, callback, options = {}) {
    const key = this.normalizeCombo(combo);
    this.shortcuts.set(key, {
      combo: key,
      callback,
      preventDefault: options.preventDefault ?? true,
      description: options.description || '',
    });
  }

  unregister(combo) {
    const key = this.normalizeCombo(combo);
    this.shortcuts.delete(key);
  }

  normalizeCombo(combo) {
    return combo
      .toLowerCase()
      .split('+')
      .map(k => k.trim())
      .sort()
      .join('+');
  }

  handle(event) {
    if (!this.enabled) return false;

    const combo = this.buildCombo(event);
    const shortcut = this.shortcuts.get(combo);

    if (shortcut) {
      if (shortcut.preventDefault) {
        event.preventDefault();
      }
      shortcut.callback(event);
      return true;
    }

    return false;
  }

  buildCombo(event) {
    const parts = [];
    
    if (event.ctrlKey || event.metaKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    
    const key = event.key.toLowerCase();
    if (!['control', 'alt', 'shift', 'meta'].includes(key)) {
      parts.push(key);
    }

    return parts.sort().join('+');
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  getRegistered() {
    return Array.from(this.shortcuts.entries()).map(([key, value]) => ({
      combo: key,
      description: value.description,
    }));
  }
}

describe('ShortcutManager', () => {
  let manager;

  beforeEach(() => {
    manager = new ShortcutManager();
  });

  describe('注册', () => {
    it('应该注册快捷键', () => {
      const callback = vi.fn();
      manager.register('Ctrl+S', callback);
      
      const registered = manager.getRegistered();
      expect(registered).toHaveLength(1);
      expect(registered[0].combo).toBe('ctrl+s');
    });

    it('应该标准化快捷键组合', () => {
      manager.register('Ctrl+S', vi.fn());
      manager.register('s+Ctrl', vi.fn());
      
      const registered = manager.getRegistered();
      expect(registered).toHaveLength(1);
    });

    it('应该注册多个快捷键', () => {
      manager.register('Ctrl+S', vi.fn());
      manager.register('Ctrl+B', vi.fn());
      manager.register('Ctrl+I', vi.fn());
      
      expect(manager.getRegistered()).toHaveLength(3);
    });

    it('应该支持描述', () => {
      manager.register('Ctrl+S', vi.fn(), { description: '保存' });
      
      const registered = manager.getRegistered();
      expect(registered[0].description).toBe('保存');
    });
  });

  describe('注销', () => {
    it('应该注销快捷键', () => {
      manager.register('Ctrl+S', vi.fn());
      manager.unregister('Ctrl+S');
      
      expect(manager.getRegistered()).toHaveLength(0);
    });

    it('应该标准化注销的组合', () => {
      manager.register('Ctrl+S', vi.fn());
      manager.unregister('s+ctrl');
      
      expect(manager.getRegistered()).toHaveLength(0);
    });
  });

  describe('处理', () => {
    it('应该匹配并执行回调', () => {
      const callback = vi.fn();
      manager.register('Ctrl+S', callback);
      
      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
      });
      
      const handled = manager.handle(event);
      expect(handled).toBe(true);
      expect(callback).toHaveBeenCalled();
    });

    it('应该默认阻止默认行为', () => {
      manager.register('Ctrl+S', vi.fn());
      
      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
      });
      
      // 模拟 preventDefault 行为
      let defaultPrevented = false;
      event.preventDefault = vi.fn(() => {
        defaultPrevented = true;
      });
      Object.defineProperty(event, 'defaultPrevented', {
        get: () => defaultPrevented,
      });
      
      manager.handle(event);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('应该允许不阻止默认行为', () => {
      manager.register('Ctrl+S', vi.fn(), { preventDefault: false });
      
      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
      });
      
      manager.handle(event);
      expect(event.defaultPrevented).toBe(false);
    });

    it('不匹配时应该返回 false', () => {
      manager.register('Ctrl+S', vi.fn());
      
      const event = new KeyboardEvent('keydown', {
        key: 'b',
        ctrlKey: true,
      });
      
      const handled = manager.handle(event);
      expect(handled).toBe(false);
    });

    it('禁用时不应处理', () => {
      const callback = vi.fn();
      manager.register('Ctrl+S', callback);
      manager.disable();
      
      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
      });
      
      const handled = manager.handle(event);
      expect(handled).toBe(false);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('组合键', () => {
    it('应该支持 Ctrl+Shift 组合', () => {
      const callback = vi.fn();
      manager.register('Ctrl+Shift+S', callback);
      
      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        shiftKey: true,
      });
      
      manager.handle(event);
      expect(callback).toHaveBeenCalled();
    });

    it('应该支持 Alt 组合', () => {
      const callback = vi.fn();
      manager.register('Alt+S', callback);
      
      const event = new KeyboardEvent('keydown', {
        key: 's',
        altKey: true,
      });
      
      manager.handle(event);
      expect(callback).toHaveBeenCalled();
    });

    it('应该支持多键组合', () => {
      const callback = vi.fn();
      manager.register('Ctrl+Alt+Delete', callback);
      
      const event = new KeyboardEvent('keydown', {
        key: 'Delete',
        ctrlKey: true,
        altKey: true,
      });
      
      manager.handle(event);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('启用/禁用', () => {
    it('默认应该启用', () => {
      expect(manager.enabled).toBe(true);
    });

    it('应该可以禁用', () => {
      manager.disable();
      expect(manager.enabled).toBe(false);
    });

    it('应该可以重新启用', () => {
      manager.disable();
      manager.enable();
      expect(manager.enabled).toBe(true);
    });
  });

  describe('边界情况', () => {
    it('应该处理单键', () => {
      const callback = vi.fn();
      manager.register('Escape', callback);
      
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
      });
      
      manager.handle(event);
      expect(callback).toHaveBeenCalled();
    });

    it('应该忽略修饰键事件', () => {
      manager.register('Ctrl+S', vi.fn());
      
      const event = new KeyboardEvent('keydown', {
        key: 'Control',
        ctrlKey: true,
      });
      
      const handled = manager.handle(event);
      expect(handled).toBe(false);
    });

    it('应该处理回调错误', () => {
      const callback = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      manager.register('Ctrl+S', callback);
      
      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
      });
      
      expect(() => manager.handle(event)).toThrow('Test error');
    });
  });
});
