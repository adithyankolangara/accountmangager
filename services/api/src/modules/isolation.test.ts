import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../db/client';
import {
  categoryId,
  createAccount,
  createTransaction,
  signUp,
  testApp,
  testDatabase,
  type TestUser,
} from '../test-utils';

/**
 * docs/permissions.md §8: a user can never read, change or reference another user's private
 * records. Unknown and not-yours look identical (404) so ids leak nothing.
 */
let database: DatabaseHandle;
let app: ReturnType<typeof testApp>;
let alice: TestUser;
let bob: TestUser;
let aliceAccount: { id: string };
let aliceTx: { id: string; version: number };
let aliceIncome: { id: string; version: number };
let aliceCategory: { id: string };

beforeAll(async () => {
  database = await testDatabase();
  app = testApp(database);
  alice = await signUp(app, 'Alice');
  bob = await signUp(app, 'Bob');
  aliceAccount = await createAccount(alice);
  aliceTx = await createTransaction(alice, {
    type: 'expense',
    amount: '500.00',
    valueDate: '2026-02-01',
    accountId: aliceAccount.id,
    categoryId: await categoryId(alice, 'Groceries'),
    description: 'Alice groceries',
  });
  aliceIncome = (
    await alice
      .post('/api/v1/income-sources', {
        name: 'Alice salary',
        kind: 'salary',
        frequency: 'monthly',
        expectedAmount: '50000.00',
        startDate: '2026-01-01',
      })
      .expect(201)
  ).body;
  aliceCategory = (
    await alice.post('/api/v1/categories', { name: 'Alice only', kind: 'expense' }).expect(201)
  ).body;
});
afterAll(async () => {
  await database.close();
});

describe('reading another user’s records', () => {
  it('returns 404 for accounts, transactions and history', async () => {
    await bob.get(`/api/v1/accounts/${aliceAccount.id}`).expect(404);
    await bob.get(`/api/v1/transactions/${aliceTx.id}`).expect(404);
    await bob.get(`/api/v1/transactions/${aliceTx.id}/history`).expect(404);
    await bob.get(`/api/v1/accounts/${aliceAccount.id}/observations`).expect(404);
  });

  it('never includes them in lists, search or reports', async () => {
    expect((await bob.get('/api/v1/accounts').expect(200)).body).toEqual([]);
    expect((await bob.get('/api/v1/transactions?q=Alice').expect(200)).body.items).toEqual([]);
    expect((await bob.get('/api/v1/income-sources').expect(200)).body).toEqual([]);
    const categories = (await bob.get('/api/v1/categories').expect(200)).body as { id: string }[];
    expect(categories.map((c) => c.id)).not.toContain(aliceCategory.id);
    const summary = await bob
      .get('/api/v1/reports/summary?from=2026-01-01&to=2026-12-31')
      .expect(200);
    expect(summary.body.expense).toBe('0.00');
    const filtered = await bob.get(`/api/v1/transactions?accountId=${aliceAccount.id}`).expect(200);
    expect(filtered.body.items).toEqual([]);
  });
});

describe('changing another user’s records', () => {
  it('returns 404 and leaves the record untouched', async () => {
    await bob
      .patch(`/api/v1/accounts/${aliceAccount.id}`, { nickname: 'Hacked', version: 1 })
      .expect(404);
    await bob.delete(`/api/v1/accounts/${aliceAccount.id}`).expect(404);
    await bob
      .patch(`/api/v1/transactions/${aliceTx.id}`, { amount: '1.00', version: aliceTx.version })
      .expect(404);
    await bob.delete(`/api/v1/transactions/${aliceTx.id}`).expect(404);
    await bob.post(`/api/v1/transactions/${aliceTx.id}/restore`).expect(404);
    await bob
      .patch(`/api/v1/income-sources/${aliceIncome.id}`, {
        name: 'Hacked',
        version: aliceIncome.version,
      })
      .expect(404);
    await bob.delete(`/api/v1/income-sources/${aliceIncome.id}`).expect(404);
    await bob.patch(`/api/v1/categories/${aliceCategory.id}`, { name: 'Hacked' }).expect(404);
    await bob
      .post(`/api/v1/accounts/${aliceAccount.id}/reconcile`, {
        actualBalance: '0',
        asOf: '2026-02-01',
      })
      .expect(404);

    const account = await alice.get(`/api/v1/accounts/${aliceAccount.id}`).expect(200);
    expect(account.body.nickname).toBe('Main account');
    const tx = await alice.get(`/api/v1/transactions/${aliceTx.id}`).expect(200);
    expect(tx.body.amount).toBe('500.00');
  });
});

describe('referencing another user’s records', () => {
  it('cannot post to, transfer into or import into their accounts', async () => {
    const bobAccount = await createAccount(bob);
    await bob
      .post('/api/v1/transactions', {
        type: 'expense',
        amount: '1.00',
        valueDate: '2026-02-01',
        accountId: aliceAccount.id,
      })
      .expect(404);
    await bob
      .post('/api/v1/transactions', {
        type: 'transfer',
        amount: '1.00',
        valueDate: '2026-02-01',
        accountId: bobAccount.id,
        counterAccountId: aliceAccount.id,
      })
      .expect(404);
    await bob
      .post('/api/v1/imports/preview', {
        accountId: aliceAccount.id,
        rows: [{ rowNumber: 1, valueDate: '2026-02-01', amount: '-1.00' }],
      })
      .expect(404);
  });

  it('cannot use their categories or income sources', async () => {
    const bobAccount = await createAccount(bob, { nickname: 'Bob 2' });
    const withCategory = await bob
      .post('/api/v1/transactions', {
        type: 'expense',
        amount: '1.00',
        valueDate: '2026-02-01',
        accountId: bobAccount.id,
        categoryId: aliceCategory.id,
      })
      .expect(400);
    expect(withCategory.body.error.details[0].path).toBe('categoryId');
    await bob
      .post('/api/v1/transactions', {
        type: 'income',
        amount: '1.00',
        valueDate: '2026-02-01',
        accountId: bobAccount.id,
        incomeSourceId: aliceIncome.id,
      })
      .expect(400);
  });

  it('ignores ownership fields sent by the client', async () => {
    const res = await bob
      .post('/api/v1/accounts', {
        nickname: 'Sneaky',
        kind: 'cash',
        openingDate: '2026-01-01',
        ownerId: alice.user.id,
        visibility: 'family',
      })
      .expect(201);
    expect(res.body.visibility).toBe('private');
    expect((await alice.get(`/api/v1/accounts/${res.body.id}`)).status).toBe(404);
  });
});
