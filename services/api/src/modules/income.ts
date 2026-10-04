import { Router } from 'express';
import { and, asc, between, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  incomeSourceInput,
  incomeSourceListQuery,
  incomeSourceUpdate,
  isExpectedInMonth,
  Money,
  monthRange,
  toMoneyString,
  type IncomeSource,
} from '@smartfin/shared';
import { diffFields, recordAudit } from '../audit';
import type { DatabaseHandle, Executor } from '../db/client';
import { incomeSources, transactions } from '../db/schema';
import { ctxOf, type Ctx } from '../http/context';
import { conflict, notFound } from '../http/errors';
import { idParam, today, usableAccount } from './shared';

type IncomeSourceRow = typeof incomeSources.$inferSelect;

const owned = (ctx: Ctx) =>
  and(eq(incomeSources.ownerId, ctx.userId), isNull(incomeSources.deletedAt));

function toIncomeSourceDto(row: IncomeSourceRow, month: string, received: string): IncomeSource {
  const expected =
    row.active && row.expectedAmount && isExpectedInMonth(row.frequency, row.startDate, month)
      ? new Money(row.expectedAmount)
      : null;
  const got = new Money(received);
  let status: IncomeSource['period']['status'] = 'not_expected';
  if (expected) {
    status = got.gte(expected) ? 'received' : got.gt(0) ? 'partial' : 'pending';
  }
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    expectedAmount: row.expectedAmount ? toMoneyString(row.expectedAmount) : null,
    frequency: row.frequency,
    startDate: row.startDate,
    expectedDay: row.expectedDay,
    receivingAccountId: row.receivingAccountId,
    taxNotes: row.taxNotes,
    notes: row.notes,
    active: row.active,
    isDemo: row.isDemo,
    version: row.version,
    period: {
      month,
      expected: expected ? toMoneyString(expected) : null,
      received: toMoneyString(got),
      pending: expected ? toMoneyString(Money.max(expected.minus(got), 0)) : null,
      status,
    },
  };
}

/** Income received per source in a month, from income transactions linked to each source. */
async function receivedBySource(db: Executor, ctx: Ctx, ids: string[], month: string) {
  if (ids.length === 0) return new Map<string, string>();
  const { from, to } = monthRange(month);
  const rows = await db
    .select({
      id: transactions.incomeSourceId,
      total: sql<string>`sum(${transactions.amount})::text`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ownerId, ctx.userId),
        eq(transactions.type, 'income'),
        isNull(transactions.deletedAt),
        inArray(transactions.incomeSourceId, ids),
        between(transactions.valueDate, from, to),
      ),
    )
    .groupBy(transactions.incomeSourceId);
  return new Map(rows.map((r) => [r.id!, r.total]));
}

const AUDITED_FIELDS = [
  'name',
  'kind',
  'expectedAmount',
  'frequency',
  'startDate',
  'expectedDay',
  'receivingAccountId',
  'active',
] as const;

export function incomeRouter({ database }: { database: DatabaseHandle }): Router {
  const { db } = database;
  const router = Router();

  async function load(ctx: Ctx, id: string, month: string) {
    const [row] = await db
      .select()
      .from(incomeSources)
      .where(and(owned(ctx), eq(incomeSources.id, id)))
      .limit(1);
    if (!row) throw notFound('Income source');
    const received = await receivedBySource(db, ctx, [id], month);
    return toIncomeSourceDto(row, month, received.get(id) ?? '0');
  }

  router.get('/income-sources', async (req, res) => {
    const ctx = ctxOf(req);
    const month = incomeSourceListQuery.parse(req.query).month ?? today(ctx).slice(0, 7);
    const rows = await db
      .select()
      .from(incomeSources)
      .where(owned(ctx))
      .orderBy(asc(incomeSources.name));
    const received = await receivedBySource(
      db,
      ctx,
      rows.map((r) => r.id),
      month,
    );
    res.json(rows.map((r) => toIncomeSourceDto(r, month, received.get(r.id) ?? '0')));
  });

  router.post('/income-sources', async (req, res) => {
    const ctx = ctxOf(req);
    const input = incomeSourceInput.parse(req.body);
    if (input.receivingAccountId) {
      await usableAccount(db, ctx, input.receivingAccountId, 'receivingAccountId');
    }
    const [row] = await db
      .insert(incomeSources)
      .values({
        ownerId: ctx.userId,
        name: input.name,
        kind: input.kind,
        expectedAmount: input.frequency === 'irregular' ? null : (input.expectedAmount ?? null),
        frequency: input.frequency,
        startDate: input.startDate,
        expectedDay: input.expectedDay ?? null,
        receivingAccountId: input.receivingAccountId ?? null,
        taxNotes: input.taxNotes ?? null,
        notes: input.notes ?? null,
        active: input.active ?? true,
      })
      .returning();
    await recordAudit(db, {
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      action: 'income_source.create',
      entityType: 'income_source',
      entityId: row!.id,
    });
    res.status(201).json(await load(ctx, row!.id, today(ctx).slice(0, 7)));
  });

  router.patch('/income-sources/:id', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Income source');
    const { version, ...changes } = incomeSourceUpdate.parse(req.body);
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(incomeSources)
        .where(and(owned(ctx), eq(incomeSources.id, id)))
        .limit(1);
      if (!before) throw notFound('Income source');
      if (changes.receivingAccountId && changes.receivingAccountId !== before.receivingAccountId) {
        await usableAccount(tx, ctx, changes.receivingAccountId, 'receivingAccountId');
      }
      const [after] = await tx
        .update(incomeSources)
        .set({ ...changes, version: before.version + 1, updatedAt: new Date() })
        .where(and(eq(incomeSources.id, id), eq(incomeSources.version, version)))
        .returning();
      if (!after) throw conflict('This income source was changed elsewhere. Reload and try again.');
      await recordAudit(tx, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'income_source.update',
        entityType: 'income_source',
        entityId: id,
        metadata: { changes: diffFields(before, after, AUDITED_FIELDS) },
      });
    });
    res.json(await load(ctx, id, today(ctx).slice(0, 7)));
  });

  router.delete('/income-sources/:id', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Income source');
    const [row] = await db
      .update(incomeSources)
      .set({ deletedAt: new Date() })
      .where(and(owned(ctx), eq(incomeSources.id, id)))
      .returning({ id: incomeSources.id });
    if (!row) throw notFound('Income source');
    // Linked transactions stay as ordinary income.
    await db
      .update(transactions)
      .set({ incomeSourceId: null })
      .where(and(eq(transactions.ownerId, ctx.userId), eq(transactions.incomeSourceId, id)));
    await recordAudit(db, {
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      action: 'income_source.delete',
      entityType: 'income_source',
      entityId: id,
    });
    res.status(204).end();
  });

  return router;
}
