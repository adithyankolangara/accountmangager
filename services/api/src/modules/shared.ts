import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { toLocalDateString, toMoneyString, type Transaction } from '@smartfin/shared';
import type { Executor } from '../db/client';
import { accounts, type transactions } from '../db/schema';
import type { Ctx } from '../http/context';
import { conflict, notFound } from '../http/errors';

export type AccountRow = typeof accounts.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;

/** Today's calendar date in the user's time zone. */
export const today = (ctx: Ctx) => toLocalDateString(new Date(), ctx.timeZone);

/** Path ids that aren't UUIDs can't match anything: answer 404 like any unknown id. */
export function idParam(value: unknown, what: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw notFound(what);
  return parsed.data;
}

export const ownedAccount = (ctx: Ctx) =>
  and(eq(accounts.ownerId, ctx.userId), isNull(accounts.deletedAt));

/**
 * Loads an account the user may post transactions to. Closed accounts accept no new money
 * movements until reopened.
 */
export async function usableAccount(
  db: Executor,
  ctx: Ctx,
  id: string,
  field: 'accountId' | 'counterAccountId' | 'receivingAccountId',
): Promise<AccountRow> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(ownedAccount(ctx), eq(accounts.id, id)))
    .limit(1);
  if (!row) throw notFound(field === 'counterAccountId' ? 'Destination account' : 'Account');
  if (row.status === 'closed') {
    throw conflict(`"${row.nickname}" is closed. Reopen it before adding transactions.`);
  }
  return row;
}

export function toTransactionDto(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amount: toMoneyString(row.amount),
    currency: row.currency,
    valueDate: row.valueDate,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    accountId: row.accountId,
    counterAccountId: row.counterAccountId,
    direction: row.direction,
    categoryId: row.categoryId,
    incomeSourceId: row.incomeSourceId,
    description: row.description,
    merchant: row.merchant,
    paymentMethod: row.paymentMethod,
    reference: row.reference,
    tags: row.tags,
    notes: row.notes,
    source: row.source,
    status: row.status,
    importBatchId: row.importBatchId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
