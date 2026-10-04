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

let database: DatabaseHandle;
let app: ReturnType<typeof testApp>;
let user: TestUser;
let bank: { id: string };
let cash: { id: string };

beforeAll(async () => {
  database = await testDatabase();
  app = testApp(database);
  user = await signUp(app);
  bank = await createAccount(user, { nickname: 'Bank' });
  cash = await createAccount(user, { nickname: 'Cash', kind: 'cash' });
});
afterAll(async () => {
  await database.close();
});

describe('validation', () => {
  it('requires a different destination for transfers and none otherwise', async () => {
    const base = { amount: '10.00', valueDate: '2026-02-01', accountId: bank.id };
    const missing = await user
      .post('/api/v1/transactions', { ...base, type: 'transfer' })
      .expect(400);
    expect(missing.body.error.details[0].path).toBe('counterAccountId');
    await user
      .post('/api/v1/transactions', { ...base, type: 'transfer', counterAccountId: bank.id })
      .expect(400);
    await user
      .post('/api/v1/transactions', { ...base, type: 'expense', counterAccountId: cash.id })
      .expect(400);
  });

  it('rejects zero, negative and float-like amounts', async () => {
    const base = { type: 'expense', valueDate: '2026-02-01', accountId: bank.id };
    for (const amount of ['0', '-5.00', '1.234', 12.5]) {
      await user.post('/api/v1/transactions', { ...base, amount }).expect(400);
    }
  });

  it('checks the category kind matches the transaction type', async () => {
    const salary = await categoryId(user, 'Salary');
    const res = await user
      .post('/api/v1/transactions', {
        type: 'expense',
        amount: '10.00',
        valueDate: '2026-02-01',
        accountId: bank.id,
        categoryId: salary,
      })
      .expect(400);
    expect(res.body.error.message).toMatch(/expense category/);
  });

  it('does not allow creating adjustments directly', async () => {
    await user
      .post('/api/v1/transactions', {
        type: 'adjustment',
        amount: '10.00',
        valueDate: '2026-02-01',
        accountId: bank.id,
      })
      .expect(400);
  });
});

describe('duplicate warnings', () => {
  it('returns similar transactions on the same account within two days', async () => {
    const body = {
      type: 'expense',
      amount: '349.00',
      valueDate: '2026-03-10',
      accountId: bank.id,
      description: 'Movie',
    };
    const first = await user.post('/api/v1/transactions', body).expect(201);
    expect(first.body.possibleDuplicates).toEqual([]);
    const second = await user
      .post('/api/v1/transactions', { ...body, valueDate: '2026-03-11' })
      .expect(201);
    expect(second.body.possibleDuplicates.map((t: { id: string }) => t.id)).toEqual([
      first.body.transaction.id,
    ]);
    const other = await user
      .post('/api/v1/transactions', { ...body, accountId: cash.id })
      .expect(201);
    expect(other.body.possibleDuplicates).toEqual([]);
  });
});

describe('listing', () => {
  let list: TestUser;
  let a: { id: string };
  let b: { id: string };

  beforeAll(async () => {
    list = await signUp(app, 'Lister');
    a = await createAccount(list, { nickname: 'A' });
    b = await createAccount(list, { nickname: 'B', kind: 'cash' });
    for (let day = 1; day <= 25; day++) {
      await createTransaction(list, {
        type: 'expense',
        amount: `${day}.00`,
        valueDate: `2026-04-${String(day).padStart(2, '0')}`,
        accountId: a.id,
        description: day === 7 ? 'Coffee 100% arabica' : `Item ${day}`,
        paymentMethod: day % 2 ? 'upi' : 'cash',
      });
    }
    await createTransaction(list, {
      type: 'transfer',
      amount: '500.00',
      valueDate: '2026-04-15',
      accountId: a.id,
      counterAccountId: b.id,
    });
  });

  it('pages newest first without gaps or repeats', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/api/v1/transactions?limit=10${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await list.get(url).expect(200);
      seen.push(...res.body.items.map((t: { id: string }) => t.id));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(26);
    expect(new Set(seen).size).toBe(26);
    const first = await list.get('/api/v1/transactions?limit=1').expect(200);
    expect(first.body.items[0].valueDate).toBe('2026-04-25');
  });

  it('filters by date range, type, payment method and account (including transfers in)', async () => {
    const range = await list.get('/api/v1/transactions?from=2026-04-10&to=2026-04-12').expect(200);
    expect(range.body.items).toHaveLength(3);
    const transfers = await list.get('/api/v1/transactions?type=transfer').expect(200);
    expect(transfers.body.items).toHaveLength(1);
    const upi = await list.get('/api/v1/transactions?paymentMethod=upi&limit=100').expect(200);
    expect(upi.body.items).toHaveLength(13);
    const intoB = await list.get(`/api/v1/transactions?accountId=${b.id}`).expect(200);
    expect(intoB.body.items.map((t: { type: string }) => t.type)).toEqual(['transfer']);
  });

  it('searches text safely, treating % and _ literally', async () => {
    const res = await list.get(`/api/v1/transactions?q=${encodeURIComponent('100%')}`).expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].description).toBe('Coffee 100% arabica');
    const none = await list.get(`/api/v1/transactions?q=${encodeURIComponent('_')}`).expect(200);
    expect(none.body.items).toHaveLength(0);
  });

  it('rejects a tampered cursor', async () => {
    await list.get('/api/v1/transactions?cursor=not-a-cursor').expect(400);
  });
});

describe('editing', () => {
  it('updates with version checks and records a field-level history', async () => {
    const tx = await createTransaction(user, {
      type: 'expense',
      amount: '100.00',
      valueDate: '2026-05-01',
      accountId: bank.id,
      description: 'Groceries',
    });
    const updated = await user
      .patch(`/api/v1/transactions/${tx.id}`, {
        amount: '120.50',
        notes: 'Corrected',
        version: tx.version,
      })
      .expect(200);
    expect(updated.body).toMatchObject({ amount: '120.50', notes: 'Corrected', version: 2 });
    await user
      .patch(`/api/v1/transactions/${tx.id}`, { amount: '1.00', version: tx.version })
      .expect(409);

    const history = await user.get(`/api/v1/transactions/${tx.id}/history`).expect(200);
    expect(history.body.map((h: { action: string }) => h.action)).toEqual([
      'transaction.create',
      'transaction.update',
    ]);
    expect(history.body[1].changes).toEqual({
      amount: { from: '100.00', to: '120.50' },
      notes: { from: null, to: 'Corrected' },
    });
  });

  it('re-validates the merged shape when the type changes', async () => {
    const tx = await createTransaction(user, {
      type: 'transfer',
      amount: '50.00',
      valueDate: '2026-05-02',
      accountId: bank.id,
      counterAccountId: cash.id,
    });
    await user
      .patch(`/api/v1/transactions/${tx.id}`, { type: 'expense', version: tx.version })
      .expect(400);
    const ok = await user
      .patch(`/api/v1/transactions/${tx.id}`, {
        type: 'expense',
        counterAccountId: null,
        version: tx.version,
      })
      .expect(200);
    expect(ok.body).toMatchObject({ type: 'expense', counterAccountId: null });
  });

  it('soft-deletes, lists deleted items and restores them', async () => {
    const tx = await createTransaction(user, {
      type: 'expense',
      amount: '9.99',
      valueDate: '2026-05-03',
      accountId: bank.id,
    });
    await user.delete(`/api/v1/transactions/${tx.id}`).expect(204);
    await user.delete(`/api/v1/transactions/${tx.id}`).expect(404);
    const deleted = await user.get('/api/v1/transactions?deleted=only').expect(200);
    expect(deleted.body.items.map((t: { id: string }) => t.id)).toContain(tx.id);
    const restored = await user.post(`/api/v1/transactions/${tx.id}/restore`).expect(200);
    expect(restored.body.deletedAt).toBeNull();
  });
});
