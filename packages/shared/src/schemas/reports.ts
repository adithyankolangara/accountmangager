import { z } from 'zod';
import { CATEGORY_KINDS, PAYMENT_METHODS } from '../domain';
import { isoDate, moneyString } from './common';

export const summaryQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine((q) => q.from <= q.to, { message: '"from" must not be after "to"', path: ['to'] });

export const summary = z
  .object({
    from: isoDate,
    to: isoDate,
    income: moneyString.meta({ description: 'Sum of income transactions' }),
    expense: moneyString.meta({ description: 'Sum of expense transactions' }),
    refunds: moneyString.meta({ description: 'Sum of refunds (reduce spending)' }),
    spending: moneyString.meta({ description: 'expense − refunds' }),
    savings: moneyString.meta({ description: 'income − spending (transfers excluded)' }),
    savingsRate: z.string().nullable().meta({
      description: 'savings ÷ income × 100, one decimal place; null when there is no income',
      example: '23.5',
    }),
    byCategory: z.array(
      z.object({
        categoryId: z.uuid().nullable(),
        kind: z.enum(CATEGORY_KINDS),
        total: moneyString.meta({ description: 'Expense categories are net of refunds' }),
        count: z.number().int(),
      }),
    ),
    byPaymentMethod: z.array(
      z.object({ paymentMethod: z.enum(PAYMENT_METHODS).nullable(), total: moneyString }),
    ),
    byAccount: z.array(
      z.object({ accountId: z.uuid(), income: moneyString, spending: moneyString }),
    ),
  })
  .meta({ id: 'Summary' });
export type Summary = z.infer<typeof summary>;

export const demoStatus = z
  .object({
    loaded: z.boolean(),
    accounts: z.number().int(),
    transactions: z.number().int(),
  })
  .meta({ id: 'DemoStatus' });
export type DemoStatus = z.infer<typeof demoStatus>;
