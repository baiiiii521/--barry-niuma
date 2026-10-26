import '@testing-library/jest-dom';

// 模拟 window.location.reload，避免 i18n.ts 触发真实刷新
Object.defineProperty(window, 'location', {
  value: { ...window.location, reload: vi.fn() },
  writable: true,
});
