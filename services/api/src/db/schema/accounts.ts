import { ACCOUNT_KINDS, ACCOUNT_STATUSES } from '@smartfin/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  pgTable,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { enumCheck, money, timestamps, timestamptz } from './common';
import { ownershipChecks, ownershipColumns } from './ownership';
import { users } from './users';

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...ownershipColumns(),
    kind: text('kind', { enum: ACCOUNT_KINDS }).notNull(),
    nickname: text('nickname').notNull(),
    institution: text('institution'),
    /** Last four characters only. Full account numbers are never stored. */
    maskedReference: varchar('masked_reference', { length: 4 }),
    ifsc: varchar('ifsc', { length: 11 }),
    branch: text('branch'),
    openingBalance: money('opening_balance').notNull().default('0'),
    openingDate: date('opening_date', { mode: 'string' }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    status: text('status', { enum: ACCOUNT_STATUSES }).notNull().default('active'),
    notes: text('notes'),
    isDemo: boolean('is_demo').notNull().default(false),
    ...timestamps,
    deletedAt: timestamptz('deleted_at'),
  },
  (t) => [
    index('accounts_owner_idx')
      .on(t.ownerId)
      .where(sql`${t.deletedAt} is null`),
    enumCheck('accounts_kind_check', t.kind, ACCOUNT_KINDS),
    enumCheck('accounts_status_check', t.status, ACCOUNT_STATUSES),
    check('accounts_masked_reference_check', sql`${t.maskedReference} ~ '^[0-9A-Za-z]{4}$'`),
    ...ownershipChecks('accounts', t),
  ],
);

export const BALANCE_OBSERVATION_SOURCES = ['manual', 'import', 'message_draft'] as const;

/** Balances the user saw (statement, passbook, app) and reconciled against. */
export const balanceObservations = pgTable(
  'balance_observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    balance: money('balance').notNull(),
    observedOn: date('observed_on', { mode: 'string' }).notNull(),
    source: text('source', { enum: BALANCE_OBSERVATION_SOURCES }).notNull().default('manual'),
    note: text('note'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('balance_observations_account_idx').on(t.accountId, t.observedOn.desc()),
    enumCheck('balance_observations_source_check', t.source, BALANCE_OBSERVATION_SOURCES),
  ],
);
