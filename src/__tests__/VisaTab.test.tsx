import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VisaTab } from '../VisaTab';
import React from 'react';

// 固定"今天"为 2026-06-01，让日期计算可预测
const TODAY = new Date(2026, 5, 1); // 2026-06-01 本地时间

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

// 工具函数：预置签证数据
const setVisa = (expiryDate: string, effectiveDate = '2026-01-01') => {
  localStorage.setItem('my_visas', JSON.stringify([{
    id: 'v1',
    type: '旅游签 (Tourist)',
    country: '越南',
    effectiveDate,
    expiryDate,
  }]));
};

const setRecords = (records: Array<{ type: 'entry' | 'exit'; date: string }>) => {
  localStorage.setItem('my_travel_records', JSON.stringify(
    records.map((r, i) => ({ id: `r${i}`, port: '其他', ...r }))
  ));
};

// 查找显示剩余天数的 span（带内联 style.color）
const getRemainingDaysEl = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('.text-\\[32px\\]');

// ─── remainingDays 计算 ────────────────────────────────────────────────

describe('remainingDays 显示', () => {
  it('签证还有 30 天到期时显示 30', () => {
    setVisa('2026-07-01'); // 距今 30 天
    render(<VisaTab />);
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('签证已过期时显示"已过期"文字', () => {
    setVisa('2026-05-31'); // 昨天已过期
    render(<VisaTab />);
    expect(screen.getByText('已过期')).toBeInTheDocument();
  });

  it('无签证数据时显示占位符"-"', () => {
    render(<VisaTab />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('签证当天到期 remainingDays 为 0', () => {
    setVisa('2026-06-01'); // 今天到期
    const { container } = render(<VisaTab />);
    // 今天到期：isExpired = false，剩余天数显示 0（带内联颜色样式）
    const el = getRemainingDaysEl(container);
    expect(el?.textContent).toBe('0');
  });
});

// ─── statusColor 阈值颜色 ──────────────────────────────────────────────

describe('statusColor 阈值颜色', () => {
  it('31+ 天：绿色 #4CAF50', () => {
    setVisa('2026-07-02'); // 31 天后
    const { container } = render(<VisaTab />);
    const el = getRemainingDaysEl(container);
    expect(el).toBeTruthy();
    expect(el!.style.color).toBe('rgb(76, 175, 80)'); // #4CAF50
  });

  it('16~30 天：琥珀色 #FFB300', () => {
    setVisa('2026-06-25'); // 24 天后
    const { container } = render(<VisaTab />);
    const el = getRemainingDaysEl(container);
    expect(el!.style.color).toBe('rgb(255, 179, 0)'); // #FFB300
  });

  it('8~15 天：橙色 #FF6F00', () => {
    setVisa('2026-06-10'); // 9 天后
    const { container } = render(<VisaTab />);
    const el = getRemainingDaysEl(container);
    expect(el!.style.color).toBe('rgb(255, 111, 0)'); // #FF6F00
  });

  it('0~7 天：红色 #E53935', () => {
    setVisa('2026-06-08'); // 7 天后
    const { container } = render(<VisaTab />);
    const el = getRemainingDaysEl(container);
    expect(el!.style.color).toBe('rgb(229, 57, 53)'); // #E53935
  });
});

// ─── currentStay 在住天数 ───────────────────────────────────────────────

describe('currentStay 当前在住天数', () => {
  it('5 月 27 日入境，今天 6 月 1 日，在住 6 天', () => {
    setVisa('2026-12-31');
    setRecords([{ type: 'entry', date: '2026-05-27' }]);
    render(<VisaTab />);
    // 查找"本次停留"卡片中包含在住天数的文本
    expect(screen.getByText(/本次停留/)).toHaveTextContent('6');
  });

  it('入境后又出境时，本次停留为 0', () => {
    setVisa('2026-12-31');
    setRecords([
      { type: 'entry', date: '2026-05-20' },
      { type: 'exit', date: '2026-05-25' },
    ]);
    render(<VisaTab />);
    expect(screen.getByText(/本次停留/)).toHaveTextContent('0');
  });

  it('无出行记录时本次停留为 0', () => {
    setVisa('2026-12-31');
    render(<VisaTab />);
    expect(screen.getByText(/本次停留/)).toHaveTextContent('0');
  });
});

// ─── yearTotal 年度天数 ────────────────────────────────────────────────

describe('yearTotal 年度在住天数', () => {
  it('5 月 20 日入境到 5 月 25 日出境：年度 6 天（含首末日）', () => {
    setVisa('2026-12-31');
    setRecords([
      { type: 'entry', date: '2026-05-20' },
      { type: 'exit', date: '2026-05-25' },
    ]);
    render(<VisaTab />);
    // yearTotal 显示在绿色大字体的 span 中
    const yearTotalEl = document.querySelector('.text-\\[\\#00E676\\]');
    expect(yearTotalEl?.textContent).toBe('6');
  });

  it('无记录时年度天数为 0', () => {
    setVisa('2026-12-31');
    render(<VisaTab />);
    const yearTotalEl = document.querySelector('.text-\\[\\#00E676\\]');
    expect(yearTotalEl?.textContent).toBe('0');
  });
});

// ─── localStorage 持久化 ───────────────────────────────────────────────

describe('localStorage 持久化', () => {
  it('重新挂载组件后签证数据从 localStorage 恢复', () => {
    setVisa('2026-09-01'); // 距今 92 天
    const { unmount } = render(<VisaTab />);
    expect(screen.getByText('92')).toBeInTheDocument();
    unmount();

    // 第二次渲染，数据应从 localStorage 恢复
    render(<VisaTab />);
    expect(screen.getByText('92')).toBeInTheDocument();
  });
});
