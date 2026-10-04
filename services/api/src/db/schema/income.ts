import { INCOME_FREQUENCIES, INCOME_KINDS } from '@smartfin/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, date, index, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts';
import { enumCheck, money, timestamps, timestamptz } from './common';
import { ownershipChecks, ownershipColumns } from './ownership';

/**
 * Salary, rent, interest and other income streams. "Received" is computed from income
 * transactions linked to the source, so there is one source of truth for money received.
 */
export const incomeSources = pgTable(
  'income_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...ownershipColumns(),
    name: text('name').notNull(),
    kind: text('kind', { enum: INCOME_KINDS }).notNull(),
    expectedAmount: money('expected_amount'),
    frequency: text('frequency', { enum: INCOME_FREQUENCIES }).notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    expectedDay: smallint('expected_day'),
    receivingAccountId: uuid('receiving_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    taxNotes: text('tax_notes'),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    isDemo: boolean('is_demo').notNull().default(false),
    ...timestamps,
    deletedAt: timestamptz('deleted_at'),
  },
  (t) => [
    index('income_sources_owner_idx')
      .on(t.ownerId)
      .where(sql`${t.deletedAt} is null`),
    enumCheck('income_sources_kind_check', t.kind, INCOME_KINDS),
    enumCheck('income_sources_frequency_check', t.frequency, INCOME_FREQUENCIES),
    check('income_sources_expected_day_check', sql`${t.expectedDay} between 1 and 31`),
    check('income_sources_expected_amount_check', sql`${t.expectedAmount} > 0`),
    ...ownershipChecks('income_sources', t),
  ],
);
