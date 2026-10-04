import { z } from 'zod';
import {
  ADJUSTMENT_DIRECTIONS,
  ENTRY_TRANSACTION_TYPES,
  PAYMENT_METHODS,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from '../domain';
import { isoDate, moneyString, optionalText, paginated, positiveMoney, version } from './common';

const transactionFields = {
  type: z.enum(ENTRY_TRANSACTION_TYPES),
  amount: positiveMoney,
  valueDate: isoDate.meta({ description: 'The date the money moved (financial date).' }),
  occurredAt: z.iso.datetime({ offset: true }).nullable().optional(),
  accountId: z.uuid(),
  counterAccountId: z.uuid().nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  incomeSourceId: z.uuid().nullable().optional(),
  description: optionalText(200),
  merchant: optionalText(100),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
  reference: optionalText(64).meta({ description: 'Bank/UPI reference (UTR, RRN)' }),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  notes: optionalText(1000),
  status: z.enum(TRANSACTION_STATUSES).optional(),
};

type TransactionShape = {
  type?: string;
  accountId?: string;
  counterAccountId?: string | null;
  categoryId?: string | null;
  incomeSourceId?: string | null;
};

/** Cross-field rules shared by create and (merged) update. */
export function checkTransactionShape(t: TransactionShape, ctx: z.RefinementCtx): void {
  if (t.type === 'transfer') {
    if (!t.counterAccountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['counterAccountId'],
        message: 'Choose where the money went',
      });
    } else if (t.counterAccountId === t.accountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['counterAccountId'],
        message: 'Choose a different account',
      });
    }
    if (t.categoryId) {
      ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Transfers have no category' });
    }
  } else if (t.counterAccountId) {
    ctx.addIssue({
      code: 'custom',
      path: ['counterAccountId'],
      message: 'Only transfers have a destination account',
    });
  }
  if (t.incomeSourceId && t.type !== 'income') {
    ctx.addIssue({
      code: 'custom',
      path: ['incomeSourceId'],
      message: 'Only income can be linked to an income source',
    });
  }
}

export const transactionInput = z
  .object(transactionFields)
  .superRefine(checkTransactionShape)
  .meta({ id: 'TransactionInput' });
export type TransactionInput = z.input<typeof transactionInput>;

export const transactionUpdate = z
  .object(transactionFields)
  .partial()
  .extend({ version })
  .meta({ id: 'TransactionUpdate' });
export type TransactionUpdate = z.input<typeof transactionUpdate>;

export const transaction = z
  .object({
    id: z.uuid(),
    type: z.enum(TRANSACTION_TYPES),
    amount: moneyString,
    currency: z.string(),
    valueDate: isoDate,
    occurredAt: z.iso.datetime().nullable(),
    accountId: z.uuid(),
    counterAccountId: z.uuid().nullable(),
    direction: z.enum(ADJUSTMENT_DIRECTIONS).nullable(),
    categoryId: z.uuid().nullable(),
    incomeSourceId: z.uuid().nullable(),
    description: z.string().nullable(),
    merchant: z.string().nullable(),
    paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
    reference: z.string().nullable(),
    tags: z.array(z.string()),
    notes: z.string().nullable(),
    source: z.enum(TRANSACTION_SOURCES),
    status: z.enum(TRANSACTION_STATUSES),
    importBatchId: z.uuid().nullable(),
    version: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    deletedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'Transaction' });
export type Transaction = z.infer<typeof transaction>;

export const transactionListQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  accountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  source: z.enum(TRANSACTION_SOURCES).optional(),
  importBatchId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
  deleted: z.enum(['exclude', 'only']).default('exclude'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});
export type TransactionListQuery = z.input<typeof transactionListQuery>;

export const transactionList = paginated(transaction).meta({ id: 'TransactionList' });
export type TransactionList = z.infer<typeof transactionList>;

export const createTransactionResponse = z
  .object({
    transaction,
    possibleDuplicates: z.array(transaction).meta({
      description: 'Existing transactions with the same account, type and amount within 2 days.',
    }),
  })
  .meta({ id: 'CreateTransactionResponse' });
export type CreateTransactionResponse = z.infer<typeof createTransactionResponse>;

export const auditEntry = z
  .object({
    id: z.uuid(),
    action: z.string(),
    createdAt: z.iso.datetime(),
    changes: z.record(z.string(), z.object({ from: z.unknown(), to: z.unknown() })).nullable(),
  })
  .meta({ id: 'AuditEntry' });
export type AuditEntry = z.infer<typeof auditEntry>;
