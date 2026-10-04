import { z } from 'zod';
import { INCOME_FREQUENCIES, INCOME_KINDS } from '../domain';
import { isoDate, isoMonth, moneyString, optionalText, positiveMoney, version } from './common';

const incomeSourceFields = {
  name: z.string().trim().min(1, 'Enter a name').max(60),
  kind: z.enum(INCOME_KINDS),
  expectedAmount: positiveMoney.nullable().optional(),
  frequency: z.enum(INCOME_FREQUENCIES),
  startDate: isoDate,
  expectedDay: z.number().int().min(1).max(31).nullable().optional(),
  receivingAccountId: z.uuid().nullable().optional(),
  taxNotes: optionalText(300),
  notes: optionalText(500),
  active: z.boolean().optional(),
};

export const incomeSourceInput = z.object(incomeSourceFields).meta({ id: 'IncomeSourceInput' });
export type IncomeSourceInput = z.input<typeof incomeSourceInput>;

export const incomeSourceUpdate = z
  .object(incomeSourceFields)
  .partial()
  .extend({ version })
  .meta({ id: 'IncomeSourceUpdate' });
export type IncomeSourceUpdate = z.input<typeof incomeSourceUpdate>;

export const incomeSource = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(INCOME_KINDS),
    expectedAmount: moneyString.nullable(),
    frequency: z.enum(INCOME_FREQUENCIES),
    startDate: isoDate,
    expectedDay: z.number().int().nullable(),
    receivingAccountId: z.uuid().nullable(),
    taxNotes: z.string().nullable(),
    notes: z.string().nullable(),
    active: z.boolean(),
    isDemo: z.boolean(),
    version: z.number().int(),
    period: z.object({
      month: isoMonth,
      expected: moneyString
        .nullable()
        .meta({ description: 'Null when nothing is expected this month' }),
      received: moneyString.meta({ description: 'Income transactions linked to this source' }),
      pending: moneyString.nullable(),
      status: z.enum(['received', 'partial', 'pending', 'not_expected']),
    }),
  })
  .meta({ id: 'IncomeSource' });
export type IncomeSource = z.infer<typeof incomeSource>;

export const incomeSourceListQuery = z.object({ month: isoMonth.optional() });
