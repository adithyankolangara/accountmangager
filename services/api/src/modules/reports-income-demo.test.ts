import { toLocalDateString } from '@smartfin/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../db/client';
import {
  categoryId,
  createAccount,
  createTransaction,
  signUp,
  testApp,
  testDatabase,
} from '../test-utils';
import { buildDemoData } from './demo-data';

let database: DatabaseHandle;
let app: ReturnType<typeof testApp>;

beforeAll(async () => {
  database = await testDatabase();
  app = testApp(database);
});
afterAll(async () => {
  await database.close();
});

describe('summary report', () => {
  it('computes income, spending (net of refunds), savings and breakdowns', async () => {
    const user = await signUp(app);
    const bank = await createAccount(user);
    const cash = await createAccount(user, { kind: 'cash' });
    const [salary, groceries, shopping] = await Promise.all([
      categoryId(user, 'Salary'),
      categoryId(user, 'Groceries'),
      categoryId(user, 'Shopping'),
    ]);
    const d = '2026-07-15';
    await createTransaction(user, {
      type: 'income',
      amount: '40000.00',
      valueDate: d,
      accountId: bank.id,
      categoryId: salary,
    });
    await createTransaction(user, {
      type: 'expense',
      amount: '3000.00',
      valueDate: d,
      accountId: bank.id,
      categoryId: groceries,
      paymentMethod: 'upi',
    });
    await createTransaction(user, {
      type: 'expense',
      amount: '2000.00',
      valueDate: d,
      accountId: bank.id,
      categoryId: shopping,
      paymentMethod: 'debit_card',
    });
    await createTransaction(user, {
      type: 'refund',
      amount: '500.00',
      valueDate: d,
      accountId: bank.id,
      categoryId: shopping,
      paymentMethod: 'debit_card',
    });
    await createTransaction(user, {
      type: 'transfer',
      amount: '7000.00',
      valueDate: d,
      accountId: bank.id,
      counterAccountId: cash.id,
    });
    await createTransaction(user, {
      type: 'expense',
      amount: '1.00',
      valueDate: '2026-08-01',
      accountId: bank.id,
    });

    const res = await user.get('/api/v1/reports/summary?from=2026-07-01&to=2026-07-31').expect(200);
    expect(res.body).toMatchObject({
      income: '40000.00',
      expense: '5000.00',
      refunds: '500.00',
      spending: '4500.00',
      savings: '35500.00',
      savingsRate: '88.8',
    });
    const cats = Object.fromEntries(
      res.body.byCategory.map((c: { categoryId: string; total: string }) => [
        c.categoryId,
        c.total,
      ]),
    );
    expect(cats[groceries]).toBe('3000.00');
    expect(cats[shopping]).toBe('1500.00');
    expect(res.body.byPaymentMethod).toEqual([
      { paymentMethod: 'upi', total: '3000.00' },
      { paymentMethod: 'debit_card', total: '1500.00' },
    ]);
  });

  it('reports a null savings rate when there is no income', async () => {
    const user = await signUp(app);
    const bank = await createAccount(user);
    await createTransaction(user, {
      type: 'expense',
      amount: '10.00',
      valueDate: '2026-07-01',
      accountId: bank.id,
    });
    const res = await user.get('/api/v1/reports/summary?from=2026-07-01&to=2026-07-31').expect(200);
    expect(res.body.savingsRate).toBeNull();
    expect(res.body.savings).toBe('-10.00');
  });

  it('rejects a reversed date range', async () => {
    const user = await signUp(app);
    await user.get('/api/v1/reports/summary?from=2026-07-31&to=2026-07-01').expect(400);
  });
});

describe('income sources', () => {
  it('tracks expected vs received per month from linked income', async () => {
    const user = await signUp(app);
    const bank = await createAccount(user);
    const source = (
      await user
        .post('/api/v1/income-sources', {
          name: 'Salary',
          kind: 'salary',
          frequency: 'monthly',
          expectedAmount: '60000.00',
          startDate: '2026-01-01',
          expectedDay: 1,
          receivingAccountId: bank.id,
        })
        .expect(201)
    ).body;
    const rent = (
      await user
        .post('/api/v1/income-sources', {
          name: 'Flat rent',
          kind: 'rent',
          frequency: 'quarterly',
          expectedAmount: '30000.00',
          startDate: '2026-01-05',
        })
        .expect(201)
    ).body;

    await createTransaction(user, {
      type: 'income',
      amount: '25000.00',
      valueDate: '2026-03-01',
      accountId: bank.id,
      incomeSourceId: source.id,
    });
    const march = await user.get('/api/v1/income-sources?month=2026-03').expect(200);
    const salary = march.body.find((s: { id: string }) => s.id === source.id);
    expect(salary.period).toEqual({
      month: '2026-03',
      expected: '60000.00',
      received: '25000.00',
      pending: '35000.00',
      status: 'partial',
    });
    const rentMarch = march.body.find((s: { id: string }) => s.id === rent.id);
    expect(rentMarch.period.status).toBe('not_expected');
    const april = await user.get('/api/v1/income-sources?month=2026-04').expect(200);
    expect(april.body.find((s: { id: string }) => s.id === rent.id).period.status).toBe('pending');

    await createTransaction(user, {
      type: 'income',
      amount: '35000.00',
      valueDate: '2026-03-02',
      accountId: bank.id,
      incomeSourceId: source.id,
    });
    const paid = await user.get('/api/v1/income-sources?month=2026-03').expect(200);
    expect(paid.body.find((s: { id: string }) => s.id === source.id).period.status).toBe(
      'received',
    );
  });

  it('unlinks transactions when a source is deleted', async () => {
    const user = await signUp(app);
    const bank = await createAccount(user);
    const source = (
      await user
        .post('/api/v1/income-sources', {
          name: 'Gig',
          kind: 'freelance',
          frequency: 'irregular',
          startDate: '2026-01-01',
        })
        .expect(201)
    ).body;
    expect(source.period.status).toBe('not_expected');
    const tx = await createTransaction(user, {
      type: 'income',
      amount: '100.00',
      valueDate: '2026-03-01',
      accountId: bank.id,
      incomeSourceId: source.id,
    });
    await user.delete(`/api/v1/income-sources/${source.id}`).expect(204);
    const after = await user.get(`/api/v1/transactions/${tx.id}`).expect(200);
    expect(after.body.incomeSourceId).toBeNull();
  });
});

describe('demo data', () => {
  it('generates deterministic, plausible synthetic data', () => {
    const a = buildDemoData('2026-10-04', 42);
    const b = buildDemoData('2026-10-04', 42);
    expect(a).toEqual(b);
    expect(a.startDate).toBe('2026-07-07');
    expect(a.transactions.length).toBeGreaterThan(100);
    expect(
      a.transactions.every((t) => t.valueDate >= a.startDate && t.valueDate <= '2026-10-04'),
    ).toBe(true);
    expect(a.transactions.filter((t) => t.salary)).toHaveLength(3);
  });

  it('loads once, keeps balances non-negative and resets cleanly', async () => {
    const user = await signUp(app);
    const real = await createAccount(user, { nickname: 'My real account' });

    const loaded = await user.post('/api/v1/demo').expect(201);
    expect(loaded.body).toMatchObject({ loaded: true, accounts: 4 });
    expect(loaded.body.transactions).toBeGreaterThan(100);
    await user.post('/api/v1/demo').expect(409);

    const accounts = (await user.get('/api/v1/accounts').expect(200)).body as {
      nickname: string;
      balance: string;
      isDemo: boolean;
    }[];
    for (const account of accounts.filter((a) => a.isDemo)) {
      expect(Number(account.balance)).toBeGreaterThanOrEqual(0);
    }
    const month = toLocalDateString(new Date()).slice(0, 7);
    const income = await user.get(`/api/v1/income-sources?month=${month}`).expect(200);
    expect(income.body[0].period.received).toBe('85000.00');

    const reset = await user.delete('/api/v1/demo').expect(200);
    expect(reset.body.removed.accounts).toBe(4);
    const status = await user.get('/api/v1/demo').expect(200);
    expect(status.body).toEqual({ loaded: false, accounts: 0, transactions: 0 });
    const remaining = (await user.get('/api/v1/accounts').expect(200)).body as { id: string }[];
    expect(remaining.map((a) => a.id)).toEqual([real.id]);
    expect((await user.get('/api/v1/income-sources').expect(200)).body).toEqual([]);
  });
});
