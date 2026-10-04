import {
  ADJUSTMENT_DIRECTIONS,
  PAYMENT_METHODS,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from '@smartfin/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts';
import { categories } from './categories';
import { enumCheck, money, timestamps, timestamptz } from './common';
import { incomeSources } from './income';
import { ownershipChecks, ownershipColumns } from './ownership';
import { users } from './users';

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    /** Client-supplied Idempotency-Key: a retried commit returns the first result. */
    idempotencyKey: text('idempotency_key').notNull(),
    rowsTotal: integer('rows_total').notNull(),
    rowsImported: integer('rows_imported').notNull(),
    rowsSkipped: integer('rows_skipped').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('import_batches_owner_key_uq').on(t.ownerId, t.idempotencyKey)],
);

/**
 * One row per money movement. Amounts are always positive; the type gives the direction
 * (docs/erd.md §2). A transfer is a single row with two accounts, so it never counts as
 * income or expense.
 */
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Insertion order, used to order same-day transactions and for stable pagination. */
    seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
    ...ownershipColumns(),
    type: text('type', { enum: TRANSACTION_TYPES }).notNull(),
    amount: money('amount').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    valueDate: date('value_date', { mode: 'string' }).notNull(),
    occurredAt: timestamptz('occurred_at'),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    counterAccountId: uuid('counter_account_id').references(() => accounts.id),
    direction: text('direction', { enum: ADJUSTMENT_DIRECTIONS }),
    categoryId: uuid('category_id').references(() => categories.id),
    incomeSourceId: uuid('income_source_id').references(() => incomeSources.id, {
      onDelete: 'set null',
    }),
    description: text('description'),
    merchant: text('merchant'),
    paymentMethod: text('payment_method', { enum: PAYMENT_METHODS }),
    reference: text('reference'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text('notes'),
    source: text('source', { enum: TRANSACTION_SOURCES }).notNull().default('manual'),
    status: text('status', { enum: TRANSACTION_STATUSES }).notNull().default('cleared'),
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
    deletedAt: timestamptz('deleted_at'),
  },
  (t) => [
    index('transactions_owner_date_idx')
      .on(t.ownerId, t.valueDate.desc(), t.seq.desc())
      .where(sql`${t.deletedAt} is null`),
    index('transactions_account_date_idx').on(t.accountId, t.valueDate),
    index('transactions_counter_account_idx')
      .on(t.counterAccountId)
      .where(sql`${t.counterAccountId} is not null`),
    index('transactions_category_idx').on(t.categoryId),
    index('transactions_income_source_idx').on(t.incomeSourceId),
    index('transactions_import_batch_idx').on(t.importBatchId),
    check('transactions_amount_positive', sql`${t.amount} > 0`),
    check(
      'transactions_transfer_shape',
      sql`(${t.type} = 'transfer') = (${t.counterAccountId} is not null) and ${t.counterAccountId} is distinct from ${t.accountId}`,
    ),
    check(
      'transactions_adjustment_shape',
      sql`(${t.type} = 'adjustment') = (${t.direction} is not null)`,
    ),
    enumCheck('transactions_type_check', t.type, TRANSACTION_TYPES),
    enumCheck('transactions_source_check', t.source, TRANSACTION_SOURCES),
    enumCheck('transactions_status_check', t.status, TRANSACTION_STATUSES),
    enumCheck('transactions_payment_method_check', t.paymentMethod, PAYMENT_METHODS),
    enumCheck('transactions_direction_check', t.direction, ADJUSTMENT_DIRECTIONS),
    ...ownershipChecks('transactions', t),
  ],
);
