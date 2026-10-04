import { Router } from 'express';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { DemoStatus } from '@smartfin/shared';
import { recordAudit } from '../audit';
import type { DatabaseHandle, Executor } from '../db/client';
import { accounts, categories, incomeSources, transactions } from '../db/schema';
import { ctxOf, type Ctx } from '../http/context';
import { conflict } from '../http/errors';
import { buildDemoData, seedFrom, type DemoAccountKey } from './demo-data';
import { today } from './shared';

async function demoStatus(db: Executor, ctx: Ctx): Promise<DemoStatus> {
  const demoAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.ownerId, ctx.userId), eq(accounts.isDemo, true), isNull(accounts.deletedAt)),
    );
  const ids = demoAccounts.map((a) => a.id);
  const [count] = ids.length
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(transactions)
        .where(and(inArray(transactions.accountId, ids), isNull(transactions.deletedAt)))
    : [{ n: 0 }];
  return { loaded: ids.length > 0, accounts: ids.length, transactions: count!.n };
}

/**
 * Loads and removes synthetic demo data for the signed-in user. Everything created here is
 * flagged (accounts.is_demo, transactions.source = 'demo'), so reset removes exactly that.
 */
export function demoRouter({ database }: { database: DatabaseHandle }): Router {
  const { db } = database;
  const router = Router();

  router.get('/demo', async (req, res) => {
    res.json(await demoStatus(db, ctxOf(req)));
  });

  router.post('/demo', async (req, res) => {
    const ctx = ctxOf(req);
    const data = buildDemoData(today(ctx), seedFrom(ctx.userId));
    await db.transaction(async (tx) => {
      if ((await demoStatus(tx, ctx)).loaded) {
        throw conflict('Demo data is already loaded. Reset it first to load it again.');
      }
      const accountIds = new Map<DemoAccountKey, string>();
      for (const account of data.accounts) {
        const [row] = await tx
          .insert(accounts)
          .values({
            ownerId: ctx.userId,
            nickname: account.nickname,
            kind: account.kind,
            institution: account.institution,
            maskedReference: account.maskedReference,
            openingBalance: account.openingBalance,
            openingDate: data.startDate,
            notes: 'Demo account with synthetic data',
            isDemo: true,
          })
          .returning({ id: accounts.id });
        accountIds.set(account.key, row!.id);
      }
      const [salary] = await tx
        .insert(incomeSources)
        .values({
          ownerId: ctx.userId,
          name: data.salary.name,
          kind: 'salary',
          expectedAmount: data.salary.expectedAmount,
          frequency: 'monthly',
          startDate: data.startDate,
          expectedDay: data.salary.expectedDay,
          receivingAccountId: accountIds.get('salary')!,
          isDemo: true,
        })
        .returning({ id: incomeSources.id });
      const systemCategories = await tx
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(isNull(categories.ownerId));
      const categoryIds = new Map(systemCategories.map((c) => [c.name, c.id]));

      const rows = data.transactions.map((t) => ({
        ownerId: ctx.userId,
        type: t.type,
        amount: t.amount,
        valueDate: t.valueDate,
        accountId: accountIds.get(t.account)!,
        counterAccountId: t.counterAccount ? accountIds.get(t.counterAccount)! : null,
        categoryId: t.category ? (categoryIds.get(t.category) ?? null) : null,
        incomeSourceId: t.salary ? salary!.id : null,
        description: t.description,
        merchant: t.merchant ?? null,
        paymentMethod: t.paymentMethod ?? null,
        source: 'demo' as const,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(transactions).values(rows.slice(i, i + 500));
      }
      await recordAudit(tx, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'demo.load',
        metadata: { accounts: data.accounts.length, transactions: rows.length },
      });
    });
    res.status(201).json(await demoStatus(db, ctx));
  });

  router.delete('/demo', async (req, res) => {
    const ctx = ctxOf(req);
    const removed = await db.transaction(async (tx) => {
      const demoAccounts = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.ownerId, ctx.userId), eq(accounts.isDemo, true)));
      const ids = demoAccounts.map((a) => a.id);
      let removedTransactions = 0;
      if (ids.length > 0) {
        const deleted = await tx
          .delete(transactions)
          .where(
            or(inArray(transactions.accountId, ids), inArray(transactions.counterAccountId, ids)),
          )
          .returning({ id: transactions.id });
        removedTransactions = deleted.length;
      }
      await tx
        .delete(incomeSources)
        .where(and(eq(incomeSources.ownerId, ctx.userId), eq(incomeSources.isDemo, true)));
      if (ids.length > 0) await tx.delete(accounts).where(inArray(accounts.id, ids));
      await recordAudit(tx, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'demo.reset',
        metadata: { accounts: ids.length, transactions: removedTransactions },
      });
      return { accounts: ids.length, transactions: removedTransactions };
    });
    res.json({ removed });
  });

  return router;
}
