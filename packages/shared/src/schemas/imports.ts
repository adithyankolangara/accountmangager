import { z } from 'zod';
import { isoDate, moneyString, optionalText } from './common';

export const IMPORT_MAX_ROWS = 5000;

export const importRow = z.object({
  rowNumber: z.number().int().positive().meta({ description: 'Row number in the source file' }),
  valueDate: isoDate,
  amount: moneyString
    .refine((v) => !/^-?0+(\.0+)?$/.test(v), 'Amount cannot be zero')
    .meta({
      description: 'Signed: negative is money out (expense), positive is money in (income).',
    }),
  description: optionalText(200),
  reference: optionalText(64),
});
export type ImportRow = z.input<typeof importRow>;

export const importPreviewInput = z
  .object({
    accountId: z.uuid(),
    rows: z.array(importRow).min(1).max(IMPORT_MAX_ROWS),
  })
  .meta({ id: 'ImportPreviewInput' });
export type ImportPreviewInput = z.input<typeof importPreviewInput>;

export const DUPLICATE_LEVELS = ['none', 'possible', 'likely'] as const;
export type DuplicateLevel = (typeof DUPLICATE_LEVELS)[number];

export const importPreviewRow = z.object({
  rowNumber: z.number().int(),
  valueDate: isoDate,
  type: z.enum(['income', 'expense']),
  amount: moneyString.meta({ description: 'Positive amount' }),
  description: z.string().nullable(),
  reference: z.string().nullable(),
  duplicate: z.enum(DUPLICATE_LEVELS).meta({
    description:
      'likely: same reference, or same date, amount and description as an existing transaction (or an earlier row). possible: same amount within 2 days.',
  }),
  matchTransactionId: z.uuid().nullable(),
});
export type ImportPreviewRow = z.infer<typeof importPreviewRow>;

export const importPreviewResponse = z
  .object({
    rows: z.array(importPreviewRow),
    counts: z.object({ total: z.number(), likely: z.number(), possible: z.number() }),
  })
  .meta({ id: 'ImportPreview' });
export type ImportPreviewResponse = z.infer<typeof importPreviewResponse>;

export const importCommitInput = z
  .object({
    accountId: z.uuid(),
    fileName: z.string().trim().min(1).max(200),
    rows: z
      .array(
        importRow.extend({
          include: z.boolean(),
          categoryId: z.uuid().nullable().optional(),
        }),
      )
      .min(1)
      .max(IMPORT_MAX_ROWS),
  })
  .meta({ id: 'ImportCommitInput' });
export type ImportCommitInput = z.input<typeof importCommitInput>;

export const importCommitResponse = z
  .object({
    batchId: z.uuid(),
    imported: z.number().int(),
    skipped: z.number().int(),
    replayed: z.boolean().meta({
      description: 'True when this Idempotency-Key was already used; nothing was imported again.',
    }),
  })
  .meta({ id: 'ImportResult' });
export type ImportCommitResponse = z.infer<typeof importCommitResponse>;
