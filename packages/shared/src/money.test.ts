import { describe, expect, it } from 'vitest';
import { InvalidMoneyError, parseMoney, roundMoney, sumMoney, toMoneyString } from './money';

describe('parseMoney', () => {
  it.each([
    ['0', '0.00'],
    ['1.5', '1.50'],
    ['123456.78', '123456.78'],
    ['-42.10', '-42.10'],
    ['9999999999999999.99', '9999999999999999.99'],
  ])('accepts %s', (input, expected) => {
    expect(parseMoney(input).toFixed(2)).toBe(expected);
  });

  it.each(['', ' 1', '1.234', '1e3', '1,000', 'abc', '.5', '12345678901234567'])(
    'rejects %j',
    (s) => {
      expect(() => parseMoney(s)).toThrow(InvalidMoneyError);
    },
  );

  it('rejects numbers, which may already have lost precision', () => {
    expect(() => parseMoney(0.1 as unknown as string)).toThrow(InvalidMoneyError);
  });
});

describe('arithmetic', () => {
  it('adds without floating-point error', () => {
    expect(toMoneyString(sumMoney(['0.10', '0.20']))).toBe('0.30');
    expect(toMoneyString(sumMoney(Array.from({ length: 10 }, () => '0.10')))).toBe('1.00');
  });

  it('rounds half-up to paisa', () => {
    expect(toMoneyString('2.345')).toBe('2.35');
    expect(toMoneyString('2.344')).toBe('2.34');
    expect(toMoneyString('-2.345')).toBe('-2.35');
    expect(roundMoney('1234.565').toFixed(2)).toBe('1234.57');
  });

  it('never emits negative zero', () => {
    expect(toMoneyString('-0.001')).toBe('0.00');
  });

  it('sums an empty list to zero', () => {
    expect(toMoneyString(sumMoney([]))).toBe('0.00');
  });

  it('keeps precision for large crore-scale amounts', () => {
    expect(toMoneyString(sumMoney(['9999999999999.99', '0.01']))).toBe('10000000000000.00');
  });
});
