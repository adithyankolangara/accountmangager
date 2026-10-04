import { describe, expect, it } from 'vitest';
import { formatMoney, maskReference } from './format';

describe('formatMoney', () => {
  it('uses Indian digit grouping', () => {
    expect(formatMoney('123456.78')).toBe('₹1,23,456.78');
    expect(formatMoney('10000000')).toBe('₹1,00,00,000.00');
  });

  it('always shows two decimals', () => {
    expect(formatMoney('5')).toBe('₹5.00');
    expect(formatMoney('0.5')).toBe('₹0.50');
  });

  it('formats negatives', () => {
    expect(formatMoney('-1500')).toBe('-₹1,500.00');
  });

  it('does not lose precision beyond float range', () => {
    // 2^53 + 1 cannot be represented as a float; it would print as ...992.
    expect(formatMoney('9007199254740993.01')).toBe('₹9,00,71,99,25,47,40,993.01');
  });
});

describe('maskReference', () => {
  it('keeps only the last four characters', () => {
    expect(maskReference('1234 5678 9012 3456')).toBe('•••• 3456');
    expect(maskReference('00112233')).toBe('•••• 2233');
  });

  it('returns an empty string for empty input', () => {
    expect(maskReference('')).toBe('');
  });
});
