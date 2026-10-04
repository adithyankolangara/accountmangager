import { describe, expect, it } from 'vitest';
import { formatFinancialDate, toLocalDateString } from './dates';

describe('toLocalDateString', () => {
  it('derives the IST calendar date across the UTC midnight boundary', () => {
    // 19:00 UTC on 31 March is 00:30 IST on 1 April (start of the Indian financial year).
    expect(toLocalDateString(new Date('2026-03-31T19:00:00Z'))).toBe('2026-04-01');
    expect(toLocalDateString(new Date('2026-03-31T18:29:59Z'))).toBe('2026-03-31');
  });

  it('honours other time zones', () => {
    expect(toLocalDateString(new Date('2026-03-31T19:00:00Z'), 'UTC')).toBe('2026-03-31');
  });
});

describe('formatFinancialDate', () => {
  it('does not shift date-only values by time zone', () => {
    expect(formatFinancialDate('2026-10-04')).toBe('4 Oct 2026');
    expect(formatFinancialDate('2026-01-01')).toBe('1 Jan 2026');
  });

  it('rejects malformed dates', () => {
    expect(() => formatFinancialDate('04/10/2026')).toThrow(RangeError);
  });
});
