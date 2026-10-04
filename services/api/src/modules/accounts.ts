import { Router } from 'express';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import {
  ACCOUNT_KINDS,
  accountInput,
  accountUpdate,
  parseMoney,
  reconcileInput,
  toMoneyString,
  type Account,
} from '@smartfin/shared';
import { diffFields, recordAudit } from '../audit';
import type { DatabaseHandle, Executor } from '../db/client';
import { accounts, balanceObservations, transactions } from '../db/schema';
import { ctxOf, type Ctx } from '../http/context';
import { conflict, notFound } from '../http/errors';
import { balanceAsOf, lastObservation, lastTransactionDate } from './ledger';
import { idParam, ownedAccount, today, toTransactionDto, type AccountRow } from './shared';

const withBalance = (asOf: string) => ({
  ...getTableColumns(accounts),
  balance: balanceAsOf(asOf),
  lastTransactionDate,
  lastObservation,
});

type AccountWithBalance = AccountRow & {
  balance: string;
  lastTransactionDate: string | null;
  lastObservation: { balance: string; observedOn: string } | null;
};

function toAccountDto(row: AccountWithBalance, asOf: string): Account {
  return {
    id: row.id,
    nickname: row.nickname,
    kind: row.kind,
    institution: row.institution,
    maskedReference: row.maskedReference,
    ifsc: row.ifsc,
    branch: row.branch,
    openingBalance: toMoneyString(row.openingBalance),
    openingDate: row.openingDate,
    currency: row.currency,
    status: row.status,
    notes: row.notes,
    visibility: row.visibility,
    isDemo: row.isDemo,
    balance: toMoneyString(row.balance),
    balanceAsOf: asOf,
    lastTransactionDate: row.lastTransactionDate,
    lastObservation: row.lastObservation
      ? {
          balance: toMoneyString(row.lastObservation.balance),
          observedOn: row.lastObservation.observedOn,
        }
      : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const owned = ownedAccount;

export async function loadAccountDto(db: Executor, ctx: Ctx, id: string, asOf = today(ctx)) {
  const [row] = await db
    .select(withBalance(asOf))
    .from(accounts)
    .where(and(owned(ctx), eq(accounts.id, id)))
    .limit(1);
  if (!row) throw notFound('Account');
  return toAccountDto(row, asOf);
}

const AUDITED_FIELDS = [
  'nickname',
  'kind',
  'institution',
  'maskedReference',
  'ifsc',
  'branch',
  'openingBalance',
  'openingDate',
  'status',
  'notes',
] as const;

export function accountsRouter({ database }: { database: DatabaseHandle }): Router {
  const { db } = database;
  const router = Router();

  router.get('/accounts', async (req, res) => {
    const ctx = ctxOf(req);
    const query = z
      .object({
        status: z.enum(['active', 'closed', 'all']).default('all'),
        kind: z
          .string()
          .optional()
          .transform((v) => (v ? v.split(',') : undefined))
          .pipe(z.array(z.enum(ACCOUNT_KINDS)).optional()),
      })
      .parse(req.query);
    const asOf = today(ctx);
    const filters: SQL[] = [owned(ctx)!];
    if (query.status !== 'all') filters.push(eq(accounts.status, query.status));
    if (query.kind) filters.push(inArray(accounts.kind, query.kind));
    const rows = await db
      .select(withBalance(asOf))
      .from(accounts)
      .where(and(...filters))
      .orderBy(asc(accounts.status), asc(accounts.nickname));
    res.json(rows.map((row) => toAccountDto(row, asOf)));
  });

  router.post('/accounts', async (req, res) => {
    const ctx = ctxOf(req);
    const input = accountInput.parse(req.body);
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(accounts)
        .values({
          ownerId: ctx.userId,
          nickname: input.nickname,
          kind: input.kind,
          institution: input.institution ?? null,
          maskedReference: input.maskedReference ?? null,
          ifsc: input.ifsc ?? null,
          branch: input.branch ?? null,
          openingBalance: input.openingBalance,
          openingDate: input.openingDate,
          notes: input.notes ?? null,
        })
        .returning();
      await recordAudit(tx, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'account.create',
        entityType: 'account',
        entityId: row!.id,
        metadata: { kind: row!.kind },
      });
      return row!;
    });
    res.status(201).json(await loadAccountDto(db, ctx, created.id));
  });

  router.get('/accounts/:id', async (req, res) => {
    const ctx = ctxOf(req);
    res.json(await loadAccountDto(db, ctx, idParam(req.params.id, 'Account')));
  });

  router.patch('/accounts/:id', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Account');
    const { version, ...changes } = accountUpdate.parse(req.body);
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(accounts)
        .where(and(owned(ctx), eq(accounts.id, id)))
        .limit(1);
      if (!before) throw notFound('Account');
      const [after] = await tx
        .update(accounts)
        .set({ ...changes, version: before.version + 1, updatedAt: new Date() })
        .where(and(eq(accounts.id, id), eq(accounts.version, version)))
        .returning();
      if (!after) throw conflict('This account was changed elsewhere. Reload and try again.');
      await recordAudit(tx, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'account.update',
        entityType: 'account',
        entityId: id,
        metadata: { changes: diffFields(before, after, AUDITED_FIELDS) },
      });
    });
    res.json(await loadAccountDto(db, ctx, id));
  });

  router.delete('/accounts/:id', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Account');
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(owned(ctx), eq(accounts.id, id)))
        .limit(1);
      if (!row) throw notFound('Account');
      const [used] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(transactions)
        .where(
          and(
            or(eq(transactions.accountId, id), eq(transactions.counterAccountId, id)),
            isNull(transactions.deletedAt),
          ),
        );
      if (used!.n > 0) {
        throw conflict(
          `This account has ${used!.n} transaction(s). Close it instead, or delete its transactions first.`,
        );
      }
      await tx.update(accounts).set({ deletedAt: new Date() }).where(eq(accounts.id, id));
      await recordAudit(tx, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'account.delete',
        entityType: 'account',
        entityId: id,
      });
    });
    res.status(204).end();
  });

  /**
   * Records the balance the user actually sees and, optionally, posts an adjustment so the
   * calculated balance matches it on that date.
   */
  router.post('/accounts/:id/reconcile', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Account');
    const input = reconcileInput.parse(req.body);
    const result = await db.transaction(async (tx) => {
      const before = await loadAccountDto(tx, ctx, id, input.asOf);
      if (input.asOf < before.openingDate) {
        throw conflict('Choose a date on or after the account opening date.');
      }
      const difference = parseMoney(input.actualBalance).minus(before.balance);
      await tx.insert(balanceObservations).values({
        ownerId: ctx.userId,
        accountId: id,
        balance: input.actualBalance,
        observedOn: input.asOf,
        note: input.note ?? null,
      });
      let adjustment = null;
      if (input.createAdjustment && !difference.isZero()) {
        const [row] = await tx
          .insert(transactions)
          .values({
            ownerId: ctx.userId,
            type: 'adjustment',
            direction: difference.isPositive() ? 'in' : 'out',
            amount: toMoneyString(difference.abs()),
            valueDate: input.asOf,
            accountId: id,
            description: 'Balance adjustment (reconciliation)',
            notes: input.note ?? null,
            source: 'system',
            status: 'reconciled',
          })
          .returning();
        adjustment = toTransactionDto(row!);
      }
      await recordAudit(tx, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'account.reconcile',
        entityType: 'account',
        entityId: id,
        metadata: {
          asOf: input.asOf,
          calculated: before.balance,
          actual: toMoneyString(input.actualBalance),
          adjustmentId: adjustment?.id ?? null,
        },
      });
      return { difference: toMoneyString(difference), adjustment };
    });
    res.json({ account: await loadAccountDto(db, ctx, id), ...result });
  });

  router.get('/accounts/:id/observations', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Account');
    await loadAccountDto(db, ctx, id);
    const rows = await db
      .select()
      .from(balanceObservations)
      .where(eq(balanceObservations.accountId, id))
      .orderBy(desc(balanceObservations.observedOn), desc(balanceObservations.createdAt))
      .limit(50);
    res.json(
      rows.map((o) => ({
        id: o.id,
        balance: toMoneyString(o.balance),
        observedOn: o.observedOn,
        source: o.source,
        note: o.note,
        createdAt: o.createdAt.toISOString(),
      })),
    );
  });

  return router;
}
