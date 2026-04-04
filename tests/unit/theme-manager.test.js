/**
 * 单元测试 - 主题管理模块
 */
import { describe, it, expect, beforeEach } from 'vitest';

// 主题管理器
class ThemeManager {
  constructor() {
    this.storageKey = 'markedit-theme';
    this.currentTheme = 'light';
    this.listeners = [];
  }

  init() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      this.currentTheme = saved;
    }
    this.apply();
    return this.currentTheme;
  }

  set(theme) {
    this.currentTheme = theme;
    localStorage.setItem(this.storageKey, theme);
    this.apply();
    this.notify();
  }

  toggle() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.set(newTheme);
    return newTheme;
  }

  apply() {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
  }

  onChange(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach(cb => cb(this.currentTheme));
  }

  isDark() {
    return this.currentTheme === 'dark';
  }
}

describe('ThemeManager', () => {
  let tm;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    tm = new ThemeManager();
  });

  describe('init()', () => {
    it('应该初始化默认主题为 light', () => {
      const theme = tm.init();
      expect(theme).toBe('light');
    });

    it('应该从 localStorage 加载主题', () => {
      localStorage.setItem('markedit-theme', 'dark');
      const theme = tm.init();
      expect(theme).toBe('dark');
    });

    it('应该应用主题到 DOM', () => {
      tm.init();
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });

  describe('set()', () => {
    it('应该设置主题', () => {
      tm.set('dark');
      expect(tm.currentTheme).toBe('dark');
    });

    it('应该保存到 localStorage', () => {
      tm.set('dark');
      expect(localStorage.getItem('markedit-theme')).toBe('dark');
    });

    it('应该应用到 DOM', () => {
      tm.set('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  describe('toggle()', () => {
    it('应该在 light 和 dark 之间切换', () => {
      tm.currentTheme = 'light';
      expect(tm.toggle()).toBe('dark');
      expect(tm.toggle()).toBe('light');
    });
  });

  describe('onChange()', () => {
    it('应该在主题变化时触发回调', () => {
      const callback = vi.fn();
      tm.onChange(callback);
      tm.set('dark');
      
      expect(callback).toHaveBeenCalledWith('dark');
    });
  });

  describe('isDark()', () => {
    it('应该正确判断暗色主题', () => {
      tm.currentTheme = 'dark';
      expect(tm.isDark()).toBe(true);
      
      tm.currentTheme = 'light';
      expect(tm.isDark()).toBe(false);
    });
  });
});
