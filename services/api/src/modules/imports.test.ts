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
let account: { id: string };

beforeAll(async () => {
  database = await testDatabase();
  app = testApp(database);
  user = await signUp(app);
  account = await createAccount(user, { openingBalance: '0.00' });
  await createTransaction(user, {
    type: 'expense',
    amount: '450.00',
    valueDate: '2026-06-05',
    accountId: account.id,
    description: 'UPI/Swiggy order',
  });
  await createTransaction(user, {
    type: 'expense',
    amount: '999.00',
    valueDate: '2026-06-09',
    accountId: account.id,
    description: 'Something else',
  });
});
afterAll(async () => {
  await database.close();
});

const rows = [
  { rowNumber: 2, valueDate: '2026-06-05', amount: '-450.00', description: 'UPI-SWIGGY-ORDER' },
  { rowNumber: 3, valueDate: '2026-06-10', amount: '-999.00', description: 'Different text' },
  {
    rowNumber: 4,
    valueDate: '2026-06-12',
    amount: '25000.00',
    description: 'NEFT salary',
    reference: 'UTR123',
  },
  {
    rowNumber: 5,
    valueDate: '2026-06-12',
    amount: '25000.00',
    description: 'NEFT salary',
    reference: 'UTR123',
  },
  { rowNumber: 6, valueDate: '2026-06-20', amount: '-120.00', description: 'Tea' },
];

describe('import preview', () => {
  it('classifies rows as likely, possible or new duplicates', async () => {
    const res = await user
      .post('/api/v1/imports/preview', { accountId: account.id, rows })
      .expect(200);
    const byRow = Object.fromEntries(
      res.body.rows.map((r: { rowNumber: number; duplicate: string }) => [
        r.rowNumber,
        r.duplicate,
      ]),
    );
    expect(byRow).toEqual({ 2: 'likely', 3: 'possible', 4: 'none', 5: 'likely', 6: 'none' });
    expect(res.body.rows[0]).toMatchObject({ type: 'expense', amount: '450.00' });
    expect(res.body.rows[2]).toMatchObject({ type: 'income', amount: '25000.00' });
    expect(res.body.counts).toEqual({ total: 5, likely: 2, possible: 1 });
  });

  it('rejects zero amounts and invalid dates', async () => {
    await user
      .post('/api/v1/imports/preview', {
        accountId: account.id,
        rows: [{ rowNumber: 1, valueDate: '2026-02-30', amount: '0.00' }],
      })
      .expect(400);
  });
});

describe('import commit', () => {
  it('imports included rows once, even when retried', async () => {
    const food = await categoryId(user, 'Food & dining');
    const body = {
      accountId: account.id,
      fileName: 'june.csv',
      rows: rows.map((r) => ({
        ...r,
        include: r.rowNumber !== 2 && r.rowNumber !== 5,
        categoryId: r.rowNumber === 6 ? food : null,
      })),
    };
    const first = await user
      .post('/api/v1/imports/commit', body)
      .set('Idempotency-Key', 'import-june-0001')
      .expect(201);
    expect(first.body).toMatchObject({ imported: 3, skipped: 2, replayed: false });

    const retry = await user
      .post('/api/v1/imports/commit', body)
      .set('Idempotency-Key', 'import-june-0001')
      .expect(200);
    expect(retry.body).toEqual({ ...first.body, replayed: true });

    const imported = await user
      .get(`/api/v1/transactions?importBatchId=${first.body.batchId}`)
      .expect(200);
    expect(imported.body.items).toHaveLength(3);
    expect(imported.body.items.every((t: { source: string }) => t.source === 'import')).toBe(true);
    const tea = imported.body.items.find((t: { description: string }) => t.description === 'Tea');
    expect(tea.categoryId).toBe(food);

    const balance = await user.get(`/api/v1/accounts/${account.id}`).expect(200);
    // 0 − 450 − 999 (manual) − 999 − 120 + 25000 (imported)
    expect(balance.body.balance).toBe('22432.00');
  });

  it('requires an Idempotency-Key header', async () => {
    const res = await user
      .post('/api/v1/imports/commit', {
        accountId: account.id,
        fileName: 'x.csv',
        rows: [{ ...rows[0], include: true }],
      })
      .expect(400);
    expect(res.body.error.message).toMatch(/Idempotency-Key/);
  });

  it('checks category kinds per row', async () => {
    const salary = await categoryId(user, 'Salary');
    await user
      .post('/api/v1/imports/commit', {
        accountId: account.id,
        fileName: 'x.csv',
        rows: [{ ...rows[4], include: true, categoryId: salary }],
      })
      .set('Idempotency-Key', 'import-bad-category')
      .expect(400);
  });
});
