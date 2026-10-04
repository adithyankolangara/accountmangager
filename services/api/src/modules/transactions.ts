import { Router } from 'express';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import {
  checkTransactionShape,
  ENTRY_TRANSACTION_TYPES,
  toMoneyString,
  transactionInput,
  transactionListQuery,
  transactionUpdate,
  type AuditEntry,
  type TransactionInput,
} from '@smartfin/shared';
import { diffFields, recordAudit } from '../audit';
import type { DatabaseHandle, Executor } from '../db/client';
import { auditEvents, categories, incomeSources, transactions } from '../db/schema';
import { ctxOf, type Ctx } from '../http/context';
import { badRequest, conflict, invalidField, notFound } from '../http/errors';
import { classifyDuplicate, findDuplicateCandidates } from './duplicates';
import { idParam, toTransactionDto, usableAccount, type TransactionRow } from './shared';

const ownedTransaction = (ctx: Ctx, id: string) =>
  and(eq(transactions.ownerId, ctx.userId), eq(transactions.id, id));

/** Category kind each transaction type may use. */
const CATEGORY_KIND_FOR: Partial<Record<TransactionRow['type'], 'income' | 'expense'>> = {
  income: 'income',
  expense: 'expense',
  refund: 'expense',
};

export async function checkCategory(
  db: Executor,
  ctx: Ctx,
  categoryId: string,
  type: TransactionRow['type'],
) {
  const [category] = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, categoryId),
        or(isNull(categories.ownerId), eq(categories.ownerId, ctx.userId)),
      ),
    )
    .limit(1);
  if (!category) throw invalidField('categoryId', 'Category not found');
  const expected = CATEGORY_KIND_FOR[type];
  if (expected && category.kind !== expected) {
    throw invalidField('categoryId', `Choose an ${expected} category`);
  }
}

type Refs = Pick<
  TransactionInput,
  'type' | 'accountId' | 'counterAccountId' | 'categoryId' | 'incomeSourceId'
>;

/** Every id a transaction points at must belong to the user (deny by default). */
async function checkReferences(db: Executor, ctx: Ctx, next: Refs, before: TransactionRow | null) {
  const changed = (key: keyof Refs) => !before || before[key] !== next[key];
  if (changed('accountId')) await usableAccount(db, ctx, next.accountId, 'accountId');
  if (next.counterAccountId && changed('counterAccountId')) {
    await usableAccount(db, ctx, next.counterAccountId, 'counterAccountId');
  }
  if (next.categoryId && (changed('categoryId') || changed('type'))) {
    await checkCategory(db, ctx, next.categoryId, next.type);
  }
  if (next.incomeSourceId && changed('incomeSourceId')) {
    const [source] = await db
      .select({ id: incomeSources.id })
      .from(incomeSources)
      .where(
        and(
          eq(incomeSources.id, next.incomeSourceId),
          eq(incomeSources.ownerId, ctx.userId),
          isNull(incomeSources.deletedAt),
        ),
      )
      .limit(1);
    if (!source) throw invalidField('incomeSourceId', 'Income source not found');
  }
}

async function possibleDuplicates(db: Executor, row: TransactionRow) {
  const candidates = await findDuplicateCandidates(db, {
    accountId: row.accountId,
    type: row.type,
    amount: row.amount,
    from: row.valueDate,
    to: row.valueDate,
    excludeId: row.id,
  });
  return candidates.filter((c) => classifyDuplicate(row, c) !== 'none').map(toTransactionDto);
}

interface Cursor {
  valueDate: string;
  seq: number;
}
const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
function decodeCursor(raw: string): Cursor {
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    if (typeof value.valueDate === 'string' && Number.isInteger(value.seq)) return value;
  } catch {
    // fall through
  }
  throw badRequest('Invalid cursor');
}

const escapeLike = (term: string) => term.replace(/[\\%_]/g, '\\$&');

const AUDITED_FIELDS = [
  'type',
  'amount',
  'valueDate',
  'accountId',
  'counterAccountId',
  'categoryId',
  'incomeSourceId',
  'description',
  'merchant',
  'paymentMethod',
  'reference',
  'tags',
  'notes',
  'status',
] as const;

export function transactionsRouter({ database }: { database: DatabaseHandle }): Router {
  const { db } = database;
  const router = Router();

  router.get('/transactions', async (req, res) => {
    const ctx = ctxOf(req);
    const q = transactionListQuery.parse(req.query);
    const filters: SQL[] = [eq(transactions.ownerId, ctx.userId)];
    filters.push(
      q.deleted === 'only' ? isNotNull(transactions.deletedAt) : isNull(transactions.deletedAt),
    );
    if (q.from) filters.push(gte(transactions.valueDate, q.from));
    if (q.to) filters.push(lte(transactions.valueDate, q.to));
    if (q.accountId) {
      filters.push(
        or(
          eq(transactions.accountId, q.accountId),
          eq(transactions.counterAccountId, q.accountId),
        )!,
      );
    }
    if (q.categoryId) filters.push(eq(transactions.categoryId, q.categoryId));
    if (q.type) filters.push(eq(transactions.type, q.type));
    if (q.paymentMethod) filters.push(eq(transactions.paymentMethod, q.paymentMethod));
    if (q.source) filters.push(eq(transactions.source, q.source));
    if (q.importBatchId) filters.push(eq(transactions.importBatchId, q.importBatchId));
    if (q.q) {
      const term = `%${escapeLike(q.q)}%`;
      filters.push(
        or(
          ilike(transactions.description, term),
          ilike(transactions.merchant, term),
          ilike(transactions.notes, term),
          ilike(transactions.reference, term),
        )!,
      );
    }
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      filters.push(
        sql`(${transactions.valueDate}, ${transactions.seq}) < (${c.valueDate}::date, ${c.seq})`,
      );
    }
    const rows = await db
      .select()
      .from(transactions)
      .where(and(...filters))
      .orderBy(desc(transactions.valueDate), desc(transactions.seq))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    res.json({
      items: page.map(toTransactionDto),
      nextCursor:
        rows.length > q.limit && last
          ? encodeCursor({ valueDate: last.valueDate, seq: last.seq })
          : null,
    });
  });

  router.post('/transactions', async (req, res) => {
    const ctx = ctxOf(req);
    const input = transactionInput.parse(req.body);
    const result = await db.transaction(async (tx) => {
      await checkReferences(tx, ctx, input, null);
      const [row] = await tx
        .insert(transactions)
        .values({
          ownerId: ctx.userId,
          type: input.type,
          amount: input.amount,
          valueDate: input.valueDate,
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
          accountId: input.accountId,
          counterAccountId: input.counterAccountId ?? null,
          categoryId: input.categoryId ?? null,
          incomeSourceId: input.incomeSourceId ?? null,
          description: input.description ?? null,
          merchant: input.merchant ?? null,
          paymentMethod: input.paymentMethod ?? null,
          reference: input.reference ?? null,
          tags: input.tags ?? [],
          notes: input.notes ?? null,
          status: input.status ?? 'cleared',
          source: 'manual',
        })
        .returning();
      await recordAudit(tx, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'transaction.create',
        entityType: 'transaction',
        entityId: row!.id,
        metadata: {
          type: row!.type,
          amount: toMoneyString(row!.amount),
          accountId: row!.accountId,
        },
      });
      return {
        transaction: toTransactionDto(row!),
        possibleDuplicates: await possibleDuplicates(tx, row!),
      };
    });
    res.status(201).json(result);
  });

  router.get('/transactions/:id', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Transaction');
    const [row] = await db.select().from(transactions).where(ownedTransaction(ctx, id)).limit(1);
    if (!row) throw notFound('Transaction');
    res.json(toTransactionDto(row));
  });

  router.patch('/transactions/:id', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Transaction');
    const { version, ...patch } = transactionUpdate.parse(req.body);
    const updated = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(transactions)
        .where(and(ownedTransaction(ctx, id), isNull(transactions.deletedAt)))
        .limit(1);
      if (!before) throw notFound('Transaction');

      const isEntryType = (ENTRY_TRANSACTION_TYPES as readonly string[]).includes(before.type);
      if (!isEntryType && (patch.type || patch.accountId || patch.counterAccountId !== undefined)) {
        throw badRequest('Only the amount, date and notes of a balance adjustment can be changed.');
      }
      const merged = {
        type: patch.type ?? before.type,
        accountId: patch.accountId ?? before.accountId,
        counterAccountId:
          patch.counterAccountId === undefined ? before.counterAccountId : patch.counterAccountId,
        categoryId: patch.categoryId === undefined ? before.categoryId : patch.categoryId,
        incomeSourceId:
          patch.incomeSourceId === undefined ? before.incomeSourceId : patch.incomeSourceId,
      };
      if (isEntryType) {
        z.any()
          .superRefine((v, c) => checkTransactionShape(v, c))
          .parse(merged);
        await checkReferences(tx, ctx, merged as Refs, before);
      }

      const { occurredAt, ...rest } = patch;
      const [after] = await tx
        .update(transactions)
        .set({
          ...rest,
          ...(occurredAt === undefined
            ? {}
            : { occurredAt: occurredAt ? new Date(occurredAt) : null }),
          version: before.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(transactions.id, id), eq(transactions.version, version)))
        .returning();
      if (!after) throw conflict('This transaction was changed elsewhere. Reload and try again.');
      await recordAudit(tx, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'transaction.update',
        entityType: 'transaction',
        entityId: id,
        metadata: {
          changes: diffFields(toTransactionDto(before), toTransactionDto(after), AUDITED_FIELDS),
        },
      });
      return after;
    });
    res.json(toTransactionDto(updated));
  });

  router.delete('/transactions/:id', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Transaction');
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(transactions)
        .set({
          deletedAt: new Date(),
          version: sql`${transactions.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(ownedTransaction(ctx, id), isNull(transactions.deletedAt)))
        .returning();
      if (!row) throw notFound('Transaction');
      await recordAudit(tx, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'transaction.delete',
        entityType: 'transaction',
        entityId: id,
        metadata: { type: row.type, amount: toMoneyString(row.amount) },
      });
    });
    res.status(204).end();
  });

  router.post('/transactions/:id/restore', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Transaction');
    const restored = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(transactions)
        .set({ deletedAt: null, version: sql`${transactions.version} + 1`, updatedAt: new Date() })
        .where(and(ownedTransaction(ctx, id), isNotNull(transactions.deletedAt)))
        .returning();
      if (!row) throw notFound('Deleted transaction');
      await recordAudit(tx, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'transaction.restore',
        entityType: 'transaction',
        entityId: id,
      });
      return row;
    });
    res.json(toTransactionDto(restored));
  });

  router.get('/transactions/:id/history', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Transaction');
    const [row] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(ownedTransaction(ctx, id))
      .limit(1);
    if (!row) throw notFound('Transaction');
    const events = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityType, 'transaction'),
          eq(auditEvents.entityId, id),
          eq(auditEvents.actorUserId, ctx.userId),
        ),
      )
      .orderBy(asc(auditEvents.createdAt));
    const body: AuditEntry[] = events.map((e) => ({
      id: e.id,
      action: e.action,
      createdAt: e.createdAt.toISOString(),
      changes: (e.metadata.changes as AuditEntry['changes']) ?? null,
    }));
    res.json(body);
  });

  return router;
}
