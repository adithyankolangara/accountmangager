import { Router } from 'express';
import { and, between, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Money, summaryQuery, toMoneyString, type Summary } from '@smartfin/shared';
import type { DatabaseHandle } from '../db/client';
import { transactions } from '../db/schema';
import { ctxOf } from '../http/context';

type Paisa = InstanceType<typeof Money>;

/**
 * Income and spending for a date range (docs/architecture.md §3): transfers and balance
 * adjustments are excluded, refunds reduce spending in their category.
 */
export function reportsRouter({ database }: { database: DatabaseHandle }): Router {
  const { db } = database;
  const router = Router();

  router.get('/reports/summary', async (req, res) => {
    const ctx = ctxOf(req);
    const { from, to } = summaryQuery.parse(req.query);
    const rows = await db
      .select({
        type: transactions.type,
        categoryId: transactions.categoryId,
        paymentMethod: transactions.paymentMethod,
        accountId: transactions.accountId,
        total: sql<string>`sum(${transactions.amount})::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.ownerId, ctx.userId),
          isNull(transactions.deletedAt),
          inArray(transactions.type, ['income', 'expense', 'refund']),
          between(transactions.valueDate, from, to),
        ),
      )
      .groupBy(
        transactions.type,
        transactions.categoryId,
        transactions.paymentMethod,
        transactions.accountId,
      );

    const zero = () => new Money(0);
    let income = zero();
    let expense = zero();
    let refunds = zero();
    const byCategory = new Map<
      string,
      { categoryId: string | null; kind: 'income' | 'expense'; total: Paisa; count: number }
    >();
    const byMethod = new Map<string | null, Paisa>();
    const byAccount = new Map<string, { income: Paisa; spending: Paisa }>();

    for (const row of rows) {
      const amount = new Money(row.total);
      const kind = row.type === 'income' ? 'income' : 'expense';
      const signed = row.type === 'refund' ? amount.negated() : amount;
      if (row.type === 'income') income = income.plus(amount);
      if (row.type === 'expense') expense = expense.plus(amount);
      if (row.type === 'refund') refunds = refunds.plus(amount);

      const catKey = `${kind}|${row.categoryId ?? ''}`;
      const cat = byCategory.get(catKey) ?? {
        categoryId: row.categoryId,
        kind,
        total: zero(),
        count: 0,
      };
      cat.total = cat.total.plus(signed);
      if (row.type !== 'refund') cat.count += row.count;
      byCategory.set(catKey, cat);

      const acct = byAccount.get(row.accountId) ?? { income: zero(), spending: zero() };
      if (kind === 'income') acct.income = acct.income.plus(amount);
      else {
        acct.spending = acct.spending.plus(signed);
        byMethod.set(row.paymentMethod, (byMethod.get(row.paymentMethod) ?? zero()).plus(signed));
      }
      byAccount.set(row.accountId, acct);
    }

    const spending = expense.minus(refunds);
    const savings = income.minus(spending);
    const body: Summary = {
      from,
      to,
      income: toMoneyString(income),
      expense: toMoneyString(expense),
      refunds: toMoneyString(refunds),
      spending: toMoneyString(spending),
      savings: toMoneyString(savings),
      savingsRate: income.gt(0) ? savings.div(income).times(100).toFixed(1) : null,
      byCategory: [...byCategory.values()]
        .sort((a, b) => b.total.comparedTo(a.total))
        .map((c) => ({ ...c, total: toMoneyString(c.total) })),
      byPaymentMethod: [...byMethod.entries()]
        .sort((a, b) => b[1].comparedTo(a[1]))
        .map(([paymentMethod, total]) => ({
          paymentMethod: paymentMethod as Summary['byPaymentMethod'][number]['paymentMethod'],
          total: toMoneyString(total),
        })),
      byAccount: [...byAccount.entries()].map(([accountId, v]) => ({
        accountId,
        income: toMoneyString(v.income),
        spending: toMoneyString(v.spending),
      })),
    };
    res.json(body);
  });

  return router;
}
