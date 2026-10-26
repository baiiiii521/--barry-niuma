import { describe, it, expect, beforeEach, vi } from 'vitest';

// i18n 模块在顶层执行 localStorage.getItem，因此每个测试需要独立模块状态
// 使用动态 import + vi.resetModules() 来重置模块缓存

describe('i18n 模块', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.clearAllMocks();
  });

  // ─── t() 翻译函数 ──────────────────────────────────────────────────

  describe('t()', () => {
    it('zh 模式下返回字典中的值', async () => {
      const { t } = await import('../i18n');
      expect(t('北京')).toBe('北京');
    });

    it('key 不在字典中时回退返回 key 本身', async () => {
      const { t } = await import('../i18n');
      expect(t('__不存在的key__')).toBe('__不存在的key__');
    });

    it('空字符串直接返回空字符串', async () => {
      const { t } = await import('../i18n');
      expect(t('')).toBe('');
    });

    it('null-like falsy 输入直接返回原值', async () => {
      const { t } = await import('../i18n');
      // @ts-expect-error 测试运行时边界
      expect(t(null)).toBeFalsy();
    });
  });

  // ─── getLanguage() ─────────────────────────────────────────────────

  describe('getLanguage()', () => {
    it('未设置 localStorage 时默认语言为 zh', async () => {
      const { getLanguage } = await import('../i18n');
      expect(getLanguage()).toBe('zh');
    });

    it('localStorage 中有合法语言时加载该语言', async () => {
      localStorage.setItem('app_language', 'en');
      const { getLanguage } = await import('../i18n');
      expect(getLanguage()).toBe('en');
    });

    it('localStorage 中是未知语言时忽略，保持 zh', async () => {
      localStorage.setItem('app_language', 'fr');
      const { getLanguage } = await import('../i18n');
      expect(getLanguage()).toBe('zh');
    });
  });

  // ─── setLanguage() ─────────────────────────────────────────────────

  describe('setLanguage()', () => {
    it('切换到合法语言会写入 localStorage 并触发 reload', async () => {
      const reloadMock = vi.fn();
      window.location = { ...window.location, reload: reloadMock };

      const { setLanguage } = await import('../i18n');
      setLanguage('en');

      expect(localStorage.getItem('app_language')).toBe('en');
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('切换到当前语言时不触发 reload（相同语言短路）', async () => {
      const reloadMock = vi.fn();
      window.location = { ...window.location, reload: reloadMock };

      const { setLanguage } = await import('../i18n');
      setLanguage('zh'); // 当前语言已经是 zh

      expect(reloadMock).not.toHaveBeenCalled();
    });

    it('切换到未知语言时不触发 reload', async () => {
      const reloadMock = vi.fn();
      window.location = { ...window.location, reload: reloadMock };

      const { setLanguage } = await import('../i18n');
      setLanguage('klingon');

      expect(reloadMock).not.toHaveBeenCalled();
      expect(localStorage.getItem('app_language')).toBeNull();
    });
  });

  // ─── tf() 带占位符的翻译 ───────────────────────────────────────────

  describe('tf()', () => {
    it('替换单个占位符', async () => {
      const { tf } = await import('../i18n');
      // 直接用中文 key 测试，避免依赖字典内容
      const result = tf('你好 {name}', { name: '世界' });
      expect(result).toBe('你好 世界');
    });

    it('替换多个占位符', async () => {
      const { tf } = await import('../i18n');
      const result = tf('{a} + {b} = {c}', { a: '1', b: '2', c: '3' });
      expect(result).toBe('1 + 2 = 3');
    });

    it('占位符不存在于 vars 时替换为空字符串', async () => {
      const { tf } = await import('../i18n');
      const result = tf('hello {missing}', {});
      expect(result).toBe('hello ');
    });

    it('无占位符时等同于 t()', async () => {
      const { tf, t } = await import('../i18n');
      expect(tf('北京')).toBe(t('北京'));
    });
  });

  // ─── tDays() 天数格式化 ────────────────────────────────────────────

  describe('tDays()', () => {
    it('zh 模式下返回"N 天"格式', async () => {
      const { tDays } = await import('../i18n');
      expect(tDays(5)).toBe('5 天');
    });

    it('spaced=false 时返回紧凑的"N天"格式', async () => {
      const { tDays } = await import('../i18n');
      expect(tDays(3, false)).toBe('3天');
    });

    it('0 天正确格式化', async () => {
      const { tDays } = await import('../i18n');
      expect(tDays(0)).toBe('0 天');
    });
  });

  // ─── toKey() 值回溯到中文 key ──────────────────────────────────────

  describe('toKey()', () => {
    it('值已经是候选 key 时直接返回', async () => {
      const { toKey } = await import('../i18n');
      const candidates = ['越南', '泰国', '其他'];
      expect(toKey('越南', candidates)).toBe('越南');
    });

    it('值不在候选列表中时原样返回（用户自定义文本）', async () => {
      const { toKey } = await import('../i18n');
      expect(toKey('马来西亚', ['越南', '泰国'])).toBe('马来西亚');
    });

    it('空字符串原样返回', async () => {
      const { toKey } = await import('../i18n');
      expect(toKey('', ['越南'])).toBe('');
    });
  });
});
