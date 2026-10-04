import Decimal from 'decimal.js';

/**
 * Decimal constructor for money. A clone keeps these settings from leaking into other users of
 * decimal.js. Rounding is half-up (see docs/architecture.md ADR-006).
 */
export const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Money = Decimal;
export type MoneyInput = Decimal.Value;

/** Paisa precision: every persisted amount is numeric(18,2). */
export const MONEY_SCALE = 2;

/** Wire format for amounts: up to 16 integer digits, up to 2 decimals, optional leading minus. */
export const MONEY_PATTERN = /^-?\d{1,16}(\.\d{1,2})?$/;

export class InvalidMoneyError extends Error {
  constructor(input: unknown) {
    super(`Invalid money amount: ${JSON.stringify(input)}`);
    this.name = 'InvalidMoneyError';
  }
}

/** Parses a wire-format amount string. Numbers are rejected: they may already have lost precision. */
export function parseMoney(input: string): Money {
  if (typeof input !== 'string' || !MONEY_PATTERN.test(input)) {
    throw new InvalidMoneyError(input);
  }
  return new Money(input);
}

/** Rounds to paisa using the configured rounding mode. */
export function roundMoney(value: MoneyInput): Money {
  return new Money(value).toDecimalPlaces(MONEY_SCALE);
}

/** Serialises an amount to the wire format, e.g. "123456.78". */
export function toMoneyString(value: MoneyInput): string {
  const fixed = roundMoney(value).toFixed(MONEY_SCALE);
  return fixed === '-0.00' ? '0.00' : fixed;
}

export function sumMoney(values: readonly MoneyInput[]): Money {
  return values.reduce<Money>((total, value) => total.plus(value), new Money(0));
}
