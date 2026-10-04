import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from '../test-utils';
import type { DatabaseHandle } from './client';
import { expectedMigrationCount } from './migrations';
import { userSessions, users } from './schema';

let database: DatabaseHandle;

beforeAll(async () => {
  database = await testDatabase();
});
afterAll(async () => {
  await database.close();
});

describe('migrations', () => {
  it('records every shipped migration as applied', async () => {
    expect(expectedMigrationCount()).toBeGreaterThan(0);
    expect(await database.appliedMigrationCount()).toBe(expectedMigrationCount());
  });

  it('is idempotent when run again', async () => {
    await database.migrate();
    expect(await database.appliedMigrationCount()).toBe(expectedMigrationCount());
  });

  it('creates the foundation tables', async () => {
    const result = (await database.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    )) as unknown as { rows: { table_name: string }[] };
    expect(result.rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        'audit_events',
        'user_sessions',
        'users',
        'consents',
        'accounts',
        'balance_observations',
        'categories',
        'income_sources',
        'import_batches',
        'transactions',
      ]),
    );
  });

  it('seeds the built-in categories', async () => {
    const result = (await database.db.execute(
      sql`select kind, count(*)::int as n from categories where owner_id is null group by kind order by kind`,
    )) as unknown as { rows: { kind: string; n: number }[] };
    expect(result.rows).toEqual([
      { kind: 'expense', n: 20 },
      { kind: 'income', n: 10 },
    ]);
  });
});

describe('constraints', () => {
  it('stores emails lower-cased only', async () => {
    await expect(
      database.db.insert(users).values({ email: 'Asha@Example.com', displayName: 'Asha' }),
    ).rejects.toThrow();
    await database.db.insert(users).values({ email: 'asha@example.com', displayName: 'Asha' });
    await expect(
      database.db.insert(users).values({ email: 'asha@example.com', displayName: 'Dup' }),
    ).rejects.toThrow();
  });

  it('applies INR and Asia/Kolkata defaults', async () => {
    const [row] = await database.db
      .insert(users)
      .values({ email: 'ravi@example.com', displayName: 'Ravi' })
      .returning();
    expect(row).toMatchObject({ preferredCurrency: 'INR', timeZone: 'Asia/Kolkata' });
  });

  it('rejects unknown session clients at the database level', async () => {
    const [user] = await database.db
      .insert(users)
      .values({ email: 'meera@example.com', displayName: 'Meera' })
      .returning();
    const expires = new Date(Date.now() + 60_000);
    await expect(
      database.db.execute(
        sql`insert into user_sessions (user_id, token_hash, client, idle_expires_at, absolute_expires_at)
            values (${user!.id}, 'h1', 'desktop', ${expires.toISOString()}, ${expires.toISOString()})`,
      ),
    ).rejects.toThrow();
    await database.db.insert(userSessions).values({
      userId: user!.id,
      tokenHash: 'h2',
      client: 'web',
      idleExpiresAt: expires,
      absoluteExpiresAt: expires,
    });
  });
});
