import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  store: {},
  getItem(key) {
    return this.store[key] || null;
  },
  setItem(key, value) {
    this.store[key] = String(value);
  },
  removeItem(key) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  },
};

global.localStorage = localStorageMock;

// Mock Vditor
global.Vditor = vi.fn().mockImplementation(() => ({
  getValue: vi.fn(() => '# Test\n\nContent'),
  setValue: vi.fn(),
  focus: vi.fn(),
  setTheme: vi.fn(),
  changeMode: vi.fn(),
  destroy: vi.fn(),
}));

// Mock window.__TAURI__
global.window.__TAURI__ = null;

// Reset mocks before each test
beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});
