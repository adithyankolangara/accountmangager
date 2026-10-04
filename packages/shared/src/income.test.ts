import { describe, expect, it } from 'vitest';
import { addDays, addMonths, formatMonth, monthRange } from './dates';
import { isExpectedInMonth } from './income';

describe('isExpectedInMonth', () => {
  it('monthly sources are expected every month from the start month', () => {
    expect(isExpectedInMonth('monthly', '2026-04-15', '2026-03')).toBe(false);
    expect(isExpectedInMonth('monthly', '2026-04-15', '2026-04')).toBe(true);
    expect(isExpectedInMonth('monthly', '2026-04-15', '2027-01')).toBe(true);
  });

  it('quarterly sources repeat every third month', () => {
    expect(isExpectedInMonth('quarterly', '2026-01-01', '2026-04')).toBe(true);
    expect(isExpectedInMonth('quarterly', '2026-01-01', '2026-05')).toBe(false);
    expect(isExpectedInMonth('quarterly', '2025-11-01', '2026-02')).toBe(true);
  });

  it('yearly sources repeat in the start month', () => {
    expect(isExpectedInMonth('yearly', '2025-03-31', '2026-03')).toBe(true);
    expect(isExpectedInMonth('yearly', '2025-03-31', '2026-04')).toBe(false);
  });

  it('irregular sources are never expected', () => {
    expect(isExpectedInMonth('irregular', '2026-01-01', '2026-01')).toBe(false);
  });
});

describe('month and day helpers', () => {
  it('gives inclusive month ranges, including leap years', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('adds days and months across boundaries', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('formats months for display', () => {
    expect(formatMonth('2026-10')).toBe('October 2026');
  });
});
