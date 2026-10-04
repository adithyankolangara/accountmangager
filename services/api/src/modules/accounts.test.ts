import { addDays, toLocalDateString } from '@smartfin/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../db/client';
import {
  createAccount,
  createTransaction,
  signUp,
  testApp,
  testDatabase,
  type TestUser,
} from '../test-utils';

let database: DatabaseHandle;
let app: ReturnType<typeof testApp>;
let user: TestUser;

beforeAll(async () => {
  database = await testDatabase();
  app = testApp(database);
  user = await signUp(app);
});
afterAll(async () => {
  await database.close();
});

const balanceOf = async (id: string) =>
  (await user.get(`/api/v1/accounts/${id}`).expect(200)).body.balance as string;

describe('account basics', () => {
  it('stores only the last four digits and validates IFSC', async () => {
    const bad = await user
      .post('/api/v1/accounts', {
        nickname: 'X',
        kind: 'savings',
        openingDate: '2026-01-01',
        maskedReference: '123456789012',
      })
      .expect(400);
    expect(bad.body.error.details[0].path).toBe('maskedReference');
    await user
      .post('/api/v1/accounts', {
        nickname: 'X',
        kind: 'savings',
        openingDate: '2026-01-01',
        ifsc: 'BAD',
      })
      .expect(400);
    const ok = await createAccount(user, { maskedReference: '4321', ifsc: 'abcd0123456' });
    const res = await user.get(`/api/v1/accounts/${ok.id}`).expect(200);
    expect(res.body).toMatchObject({
      maskedReference: '4321',
      ifsc: 'ABCD0123456',
      balance: '10000.00',
    });
  });

  it('updates only the fields sent, with optimistic concurrency', async () => {
    const account = await createAccount(user, { openingBalance: '2500.50' });
    const updated = await user
      .patch(`/api/v1/accounts/${account.id}`, { nickname: 'Renamed', version: account.version })
      .expect(200);
    expect(updated.body).toMatchObject({
      nickname: 'Renamed',
      openingBalance: '2500.50',
      version: 2,
    });
    const stale = await user
      .patch(`/api/v1/accounts/${account.id}`, { nickname: 'Stale', version: account.version })
      .expect(409);
    expect(stale.body.error.code).toBe('conflict');
  });

  it('deletes an unused account but refuses one with transactions', async () => {
    const unused = await createAccount(user);
    await user.delete(`/api/v1/accounts/${unused.id}`).expect(204);
    await user.get(`/api/v1/accounts/${unused.id}`).expect(404);

    const used = await createAccount(user);
    await createTransaction(user, {
      type: 'expense',
      amount: '1.00',
      valueDate: '2026-02-01',
      accountId: used.id,
    });
    const res = await user.delete(`/api/v1/accounts/${used.id}`).expect(409);
    expect(res.body.error.message).toMatch(/Close it instead/);
  });

  it('blocks new transactions on a closed account', async () => {
    const account = await createAccount(user);
    await user
      .patch(`/api/v1/accounts/${account.id}`, { status: 'closed', version: account.version })
      .expect(200);
    await user
      .post('/api/v1/transactions', {
        type: 'expense',
        amount: '1.00',
        valueDate: '2026-02-01',
        accountId: account.id,
      })
      .expect(409);
  });

  it('filters by kind for the cash & wallets screen', async () => {
    await createAccount(user, { nickname: 'Purse', kind: 'cash' });
    const res = await user.get('/api/v1/accounts?kind=cash,wallet').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((a: { kind: string }) => ['cash', 'wallet'].includes(a.kind))).toBe(true);
  });
});

describe('ledger balances', () => {
  it('applies each transaction type and never double counts transfers', async () => {
    const bank = await createAccount(user, { openingBalance: '10000.00' });
    const cash = await createAccount(user, { kind: 'cash', openingBalance: '500.00' });
    const base = { valueDate: '2026-09-10' };
    await createTransaction(user, {
      ...base,
      type: 'income',
      amount: '50000.00',
      accountId: bank.id,
    });
    await createTransaction(user, {
      ...base,
      type: 'expense',
      amount: '1234.56',
      accountId: bank.id,
    });
    await createTransaction(user, {
      ...base,
      type: 'refund',
      amount: '234.56',
      accountId: bank.id,
    });
    await createTransaction(user, {
      ...base,
      type: 'transfer',
      amount: '5000.00',
      accountId: bank.id,
      counterAccountId: cash.id,
    });
    expect(await balanceOf(bank.id)).toBe('54000.00'); // 10000 + 50000 − 1234.56 + 234.56 − 5000
    expect(await balanceOf(cash.id)).toBe('5500.00');

    const summary = await user
      .get('/api/v1/reports/summary?from=2026-09-01&to=2026-09-30')
      .expect(200);
    expect(summary.body).toMatchObject({
      income: '50000.00',
      expense: '1234.56',
      spending: '1000.00',
    });
  });

  it('ignores deleted, future-dated and pre-opening transactions', async () => {
    const account = await createAccount(user, {
      openingBalance: '1000.00',
      openingDate: '2026-03-01',
    });
    const tomorrow = addDays(toLocalDateString(new Date()), 1);
    await createTransaction(user, {
      type: 'expense',
      amount: '100.00',
      valueDate: tomorrow,
      accountId: account.id,
    });
    await createTransaction(user, {
      type: 'expense',
      amount: '200.00',
      valueDate: '2026-02-28',
      accountId: account.id,
    });
    const deleted = await createTransaction(user, {
      type: 'expense',
      amount: '300.00',
      valueDate: '2026-03-05',
      accountId: account.id,
    });
    await user.delete(`/api/v1/transactions/${deleted.id}`).expect(204);
    expect(await balanceOf(account.id)).toBe('1000.00');
    await user.post(`/api/v1/transactions/${deleted.id}/restore`).expect(200);
    expect(await balanceOf(account.id)).toBe('700.00');
  });
});

describe('reconciliation', () => {
  it('posts an adjustment so the balance matches what the bank shows', async () => {
    const account = await createAccount(user, {
      openingBalance: '1000.00',
      openingDate: '2026-01-01',
    });
    await createTransaction(user, {
      type: 'expense',
      amount: '250.00',
      valueDate: '2026-01-10',
      accountId: account.id,
    });

    const res = await user
      .post(`/api/v1/accounts/${account.id}/reconcile`, {
        actualBalance: '700.25',
        asOf: '2026-01-31',
        note: 'Passbook',
      })
      .expect(200);
    expect(res.body.difference).toBe('-49.75');
    expect(res.body.adjustment).toMatchObject({
      type: 'adjustment',
      direction: 'out',
      amount: '49.75',
      source: 'system',
      status: 'reconciled',
    });
    expect(res.body.account.balance).toBe('700.25');
    expect(res.body.account.lastObservation).toEqual({
      balance: '700.25',
      observedOn: '2026-01-31',
    });

    // Adjustments are excluded from income and spending.
    const summary = await user
      .get('/api/v1/reports/summary?from=2026-01-01&to=2026-01-31')
      .expect(200);
    expect(summary.body.spending).toBe('250.00');
  });

  it('can record a balance without adjusting', async () => {
    const account = await createAccount(user, { openingBalance: '1000.00' });
    const res = await user
      .post(`/api/v1/accounts/${account.id}/reconcile`, {
        actualBalance: '1500.00',
        asOf: '2026-01-31',
        createAdjustment: false,
      })
      .expect(200);
    expect(res.body).toMatchObject({ difference: '500.00', adjustment: null });
    expect(res.body.account.balance).toBe('1000.00');
    const observations = await user.get(`/api/v1/accounts/${account.id}/observations`).expect(200);
    expect(observations.body[0]).toMatchObject({ balance: '1500.00', observedOn: '2026-01-31' });
  });

  it('rejects dates before the opening date', async () => {
    const account = await createAccount(user, { openingDate: '2026-02-01' });
    await user
      .post(`/api/v1/accounts/${account.id}/reconcile`, {
        actualBalance: '1.00',
        asOf: '2026-01-31',
      })
      .expect(409);
  });
});
