import { describe, expect, it } from 'vitest';
import { normalizeDescription, parseStatementAmount, parseStatementDate } from './statement';

describe('parseStatementDate', () => {
  it.each([
    ['04/10/2026', 'DD/MM/YYYY', '2026-10-04'],
    ['4-10-2026', 'DD-MM-YYYY', '2026-10-04'],
    ['04.10.2026', 'DD/MM/YYYY', '2026-10-04'],
    ['04/10/26', 'DD/MM/YY', '2026-10-04'],
    ['04-Oct-2026', 'DD-MMM-YYYY', '2026-10-04'],
    ['04 October 2026', 'DD-MMM-YYYY', '2026-10-04'],
    ['04-oct-26', 'DD-MMM-YYYY', '2026-10-04'],
    ['2026-10-04', 'YYYY-MM-DD', '2026-10-04'],
    ['10/04/2026', 'MM/DD/YYYY', '2026-10-04'],
    ['04/10/2026 14:22:10', 'DD/MM/YYYY', '2026-10-04'],
  ] as const)('parses %s as %s', (input, format, expected) => {
    expect(parseStatementDate(input, format)).toBe(expected);
  });

  it.each([
    ['31/02/2026', 'DD/MM/YYYY'],
    ['13/13/2026', 'DD/MM/YYYY'],
    ['2026-10-04', 'DD/MM/YYYY'],
    ['04-Foo-2026', 'DD-MMM-YYYY'],
    ['', 'DD/MM/YYYY'],
  ] as const)('rejects %j for %s', (input, format) => {
    expect(parseStatementDate(input, format)).toBeNull();
  });

  it('uses the calendar date of spreadsheet Date cells', () => {
    expect(parseStatementDate(new Date(Date.UTC(2026, 9, 4)), 'DD/MM/YYYY')).toBe('2026-10-04');
    expect(parseStatementDate(42, 'DD/MM/YYYY')).toBeNull();
  });
});

describe('parseStatementAmount', () => {
  it.each([
    ['1,23,456.78', '123456.78'],
    ['₹ 1,500', '1500.00'],
    ['Rs. 99.5', '99.50'],
    ['-250.00', '-250.00'],
    ['(250.00)', '-250.00'],
    ['1,000.00 Dr', '-1000.00'],
    ['1,000.00 CR', '1000.00'],
    ['+42', '42.00'],
    ['10.005', '10.01'],
    ['10.004', '10.00'],
  ])('parses %j as %s', (input, expected) => {
    expect(parseStatementAmount(input)).toBe(expected);
  });

  it.each(['', '-', 'abc', '1.2.3', '12a'])('returns null for %j', (input) => {
    expect(parseStatementAmount(input)).toBeNull();
  });

  it('handles numeric spreadsheet cells', () => {
    expect(parseStatementAmount(1234.565)).toBe('1234.57');
    expect(parseStatementAmount(-50)).toBe('-50.00');
    expect(parseStatementAmount(Number.NaN)).toBeNull();
  });
});

describe('normalizeDescription', () => {
  it('lower-cases and strips punctuation', () => {
    expect(normalizeDescription('UPI/Swiggy-Order #123')).toBe('upi swiggy order 123');
    expect(normalizeDescription(null)).toBe('');
  });
});
