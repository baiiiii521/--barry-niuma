import { describe, it, expect } from 'vitest';
import {
  isDateCustomHoliday,
  isDateCustomWorkday,
  getCustomHolidayName,
} from '../holidays';

// 工具函数：创建本地日期（避免时区偏移导致日期错误）
const d = (dateStr: string) => {
  const [y, m, day] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, day);
};

// ─── isDateCustomHoliday ───────────────────────────────────────────────

describe('isDateCustomHoliday', () => {
  describe('CN 地区', () => {
    it('2026 元旦假日首日返回 true', () => {
      expect(isDateCustomHoliday(d('2026-01-01'), 'CN')).toBe(true);
    });

    it('2026 元旦假日末日返回 true', () => {
      expect(isDateCustomHoliday(d('2026-01-03'), 'CN')).toBe(true);
    });

    it('2026 春节假期首日返回 true', () => {
      expect(isDateCustomHoliday(d('2026-02-15'), 'CN')).toBe(true);
    });

    it('2026 春节假期末日返回 true', () => {
      expect(isDateCustomHoliday(d('2026-02-23'), 'CN')).toBe(true);
    });

    it('2026 国庆节返回 true', () => {
      expect(isDateCustomHoliday(d('2026-10-01'), 'CN')).toBe(true);
    });

    it('春节假期前一天（2026-02-14）返回 false', () => {
      expect(isDateCustomHoliday(d('2026-02-14'), 'CN')).toBe(false);
    });

    it('2027 元旦返回 true', () => {
      expect(isDateCustomHoliday(d('2027-01-01'), 'CN')).toBe(true);
    });

    it('普通工作日 2026-03-01 返回 false', () => {
      expect(isDateCustomHoliday(d('2026-03-01'), 'CN')).toBe(false);
    });
  });

  describe('HK 地区', () => {
    it('2026 香港元旦返回 true', () => {
      expect(isDateCustomHoliday(d('2026-01-01'), 'HK')).toBe(true);
    });

    it('2026 香港圣诞节返回 true', () => {
      expect(isDateCustomHoliday(d('2026-12-25'), 'HK')).toBe(true);
    });

    it('2026 香港非假日日期返回 false', () => {
      expect(isDateCustomHoliday(d('2026-03-15'), 'HK')).toBe(false);
    });
  });

  describe('VN 地区', () => {
    it('2026 越南劳动节返回 true', () => {
      expect(isDateCustomHoliday(d('2026-05-01'), 'VN')).toBe(true);
    });

    it('2026 越南国庆日返回 true', () => {
      expect(isDateCustomHoliday(d('2026-09-02'), 'VN')).toBe(true);
    });
  });

  describe('TH 地区', () => {
    it('2026 泰国泼水节返回 true', () => {
      expect(isDateCustomHoliday(d('2026-04-13'), 'TH')).toBe(true);
    });

    it('2026 泰国劳动节返回 true', () => {
      expect(isDateCustomHoliday(d('2026-05-01'), 'TH')).toBe(true);
    });
  });

  describe('边界情况', () => {
    it('不存在的地区返回 false', () => {
      expect(isDateCustomHoliday(d('2026-01-01'), 'XX')).toBe(false);
    });

    it('数据集外的年份返回 false', () => {
      expect(isDateCustomHoliday(d('2025-01-01'), 'CN')).toBe(false);
    });

    it('空地区字符串返回 false', () => {
      expect(isDateCustomHoliday(d('2026-01-01'), '')).toBe(false);
    });
  });
});

// ─── isDateCustomWorkday ───────────────────────────────────────────────

describe('isDateCustomWorkday', () => {
  it('CN 2026-01-04（补班日）返回 true', () => {
    expect(isDateCustomWorkday(d('2026-01-04'), 'CN')).toBe(true);
  });

  it('CN 2026-02-14（春节补班日）返回 true', () => {
    expect(isDateCustomWorkday(d('2026-02-14'), 'CN')).toBe(true);
  });

  it('CN 普通周六 2026-01-03 不是补班日，返回 false', () => {
    expect(isDateCustomWorkday(d('2026-01-03'), 'CN')).toBe(false);
  });

  it('VN 2026-01-10（补班日）返回 true', () => {
    expect(isDateCustomWorkday(d('2026-01-10'), 'VN')).toBe(true);
  });

  it('HK 无补班日定义，2026-01-02 返回 false', () => {
    expect(isDateCustomWorkday(d('2026-01-02'), 'HK')).toBe(false);
  });

  it('不存在的地区返回 false', () => {
    expect(isDateCustomWorkday(d('2026-01-04'), 'ZZ')).toBe(false);
  });

  it('数据集外的年份返回 false', () => {
    expect(isDateCustomWorkday(d('2025-01-04'), 'CN')).toBe(false);
  });
});

// ─── getCustomHolidayName ──────────────────────────────────────────────

describe('getCustomHolidayName', () => {
  it('CN 2026 元旦返回非空字符串', () => {
    const name = getCustomHolidayName(d('2026-01-01'), 'CN');
    expect(name).toBeTruthy();
    expect(typeof name).toBe('string');
  });

  it('CN 2026 春节首日返回非空字符串', () => {
    const name = getCustomHolidayName(d('2026-02-15'), 'CN');
    expect(name).toBeTruthy();
  });

  it('非假日日期返回 null', () => {
    expect(getCustomHolidayName(d('2026-03-01'), 'CN')).toBeNull();
  });

  it('不存在的地区返回 null', () => {
    expect(getCustomHolidayName(d('2026-01-01'), 'XX')).toBeNull();
  });

  it('数据集外的年份返回 null', () => {
    expect(getCustomHolidayName(d('2025-01-01'), 'CN')).toBeNull();
  });

  it('HK 圣诞节返回非空字符串', () => {
    const name = getCustomHolidayName(d('2026-12-25'), 'HK');
    expect(name).toBeTruthy();
  });

  it('VN 劳动节返回非空字符串', () => {
    const name = getCustomHolidayName(d('2026-05-01'), 'VN');
    expect(name).toBeTruthy();
  });
});
