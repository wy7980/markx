/**
 * 单元测试 - 自动保存模块
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 模拟自动保存管理器
class AutoSaveManager {
  constructor(options = {}) {
    this.delay = options.delay || 1000;
    this.timeout = null;
    this.callback = null;
    this.lastSave = null;
    this.isDirty = false;
  }

  setCallback(callback) {
    this.callback = callback;
  }

  trigger() {
    this.isDirty = true;
    this.schedule();
  }

  schedule() {
    this.cancel();
    this.timeout = setTimeout(() => {
      this.save();
    }, this.delay);
  }

  cancel() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  async save() {
    if (!this.isDirty) return;
    
    if (this.callback) {
      try {
        await this.callback();
      } catch (error) {
        console.error('Auto-save failed:', error);
        // 即使保存失败，也清除脏状态，避免重复尝试
        this.isDirty = false;
        this.timeout = null;
        return;
      }
    }
    
    this.lastSave = new Date();
    this.isDirty = false;
    this.timeout = null;
  }

  forceSave() {
    this.cancel();
    return this.save();
  }

  getStatus() {
    return {
      isDirty: this.isDirty,
      lastSave: this.lastSave,
      isScheduled: this.timeout !== null,
    };
  }
}

describe('AutoSaveManager', () => {
  let autoSave;

  beforeEach(() => {
    vi.useFakeTimers();
    autoSave = new AutoSaveManager({ delay: 1000 });
  });

  afterEach(() => {
    vi.useRealTimers();
    autoSave.cancel();
  });

  describe('基础功能', () => {
    it('应该延迟触发保存', () => {
      const callback = vi.fn();
      autoSave.setCallback(callback);
      
      autoSave.trigger();
      expect(callback).not.toHaveBeenCalled();
      
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('应该标记为脏状态', () => {
      autoSave.trigger();
      expect(autoSave.isDirty).toBe(true);
    });

    it('保存后应该清除脏状态', async () => {
      autoSave.setCallback(() => Promise.resolve());
      autoSave.trigger();
      
      // 推进时间并等待所有异步操作完成
      await vi.advanceTimersByTimeAsync(1000);
      
      expect(autoSave.isDirty).toBe(false);
    });
  });

  describe('防抖', () => {
    it('多次触发应该只保存一次', () => {
      const callback = vi.fn();
      autoSave.setCallback(callback);
      
      autoSave.trigger();
      autoSave.trigger();
      autoSave.trigger();
      
      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('连续触发应该重置计时器', () => {
      const callback = vi.fn();
      autoSave.setCallback(callback);
      
      autoSave.trigger();
      vi.advanceTimersByTime(500);
      
      autoSave.trigger();
      vi.advanceTimersByTime(500);
      expect(callback).not.toHaveBeenCalled();
      
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('强制保存', () => {
    it('应该立即保存', async () => {
      const callback = vi.fn();
      autoSave.setCallback(callback);
      
      autoSave.trigger();
      await autoSave.forceSave();
      
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('应该取消计划的保存', async () => {
      const callback = vi.fn();
      autoSave.setCallback(callback);
      
      autoSave.trigger();
      await autoSave.forceSave();
      
      vi.advanceTimersByTime(2000);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('状态查询', () => {
    it('应该返回正确状态', () => {
      const status = autoSave.getStatus();
      
      expect(status.isDirty).toBe(false);
      expect(status.isScheduled).toBe(false);
      expect(status.lastSave).toBeNull();
    });

    it('触发后状态应该更新', () => {
      autoSave.trigger();
      const status = autoSave.getStatus();
      
      expect(status.isDirty).toBe(true);
      expect(status.isScheduled).toBe(true);
    });

    it('保存后应该记录时间', async () => {
      autoSave.setCallback(() => Promise.resolve());
      autoSave.trigger();
      
      // 推进时间并等待所有异步操作完成
      await vi.advanceTimersByTimeAsync(1000);
      
      const status = autoSave.getStatus();
      expect(status.lastSave).not.toBeNull();
    });
  });

  describe('取消', () => {
    it('应该取消计划的保存', () => {
      const callback = vi.fn();
      autoSave.setCallback(callback);
      
      autoSave.trigger();
      autoSave.cancel();
      
      vi.advanceTimersByTime(2000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('取消后状态应该更新', () => {
      autoSave.trigger();
      autoSave.cancel();
      
      expect(autoSave.getStatus().isScheduled).toBe(false);
    });
  });

  describe('边界情况', () => {
    it('未设置回调时应该正常工作', async () => {
      autoSave.trigger();
      vi.advanceTimersByTime(1000);
      
      expect(autoSave.isDirty).toBe(false);
    });

    it('没有变更时不应保存', async () => {
      const callback = vi.fn();
      autoSave.setCallback(callback);
      
      await autoSave.save();
      expect(callback).not.toHaveBeenCalled();
    });

    it('应该处理异步回调错误', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const callback = vi.fn().mockRejectedValue(new Error('Save failed'));
      autoSave.setCallback(callback);
      
      autoSave.trigger();
      
      // 推进时间并等待所有异步操作完成
      await vi.advanceTimersByTimeAsync(1000);
      
      // 验证回调被调用且错误被记录
      expect(callback).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Auto-save failed:', expect.any(Error));
      expect(autoSave.isDirty).toBe(false); // 即使失败也应该清除脏状态
      
      consoleSpy.mockRestore();
    });
  });
});
