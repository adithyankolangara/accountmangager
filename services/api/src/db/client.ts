import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import type { Config } from '../config';
import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE, migrationsFolder } from './migrations';
import * as schema from './schema';

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DatabaseHandle {
  db: Database;
  kind: 'postgres' | 'pglite';
  /** Applies pending migrations from database/migrations. */
  migrate(): Promise<void>;
  /** Returns the number of migrations recorded as applied (0 if none have run). */
  appliedMigrationCount(): Promise<number>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

const migrationConfig = () => ({
  migrationsFolder: migrationsFolder(),
  migrationsSchema: MIGRATIONS_SCHEMA,
  migrationsTable: MIGRATIONS_TABLE,
});

export async function connectDatabase(database: Config['database']): Promise<DatabaseHandle> {
  if ('url' in database) {
    const pool = new pg.Pool({ connectionString: database.url, max: 10 });
    const db = drizzleNodePg({ client: pool, schema });
    return buildHandle(
      db,
      'postgres',
      () => migrateNodePg(db, migrationConfig()),
      () => pool.end(),
    );
  }

  if (database.pgliteDataDir) mkdirSync(database.pgliteDataDir, { recursive: true });
  const client = new PGlite(database.pgliteDataDir);
  await client.waitReady;
  const db = drizzlePglite({ client, schema });
  return buildHandle(
    db,
    'pglite',
    () => migratePglite(db, migrationConfig()),
    () => client.close(),
  );
}

function buildHandle(
  db: Database,
  kind: DatabaseHandle['kind'],
  migrate: () => Promise<void>,
  close: () => Promise<void>,
): DatabaseHandle {
  return {
    db,
    kind,
    migrate,
    close,
    async ping() {
      await db.execute(sql`select 1`);
    },
    async appliedMigrationCount() {
      const [table] = rows<{ exists: boolean }>(
        await db.execute(
          sql`select to_regclass(${`${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`}) is not null as exists`,
        ),
      );
      if (!table?.exists) return 0;
      const [result] = rows<{ count: number }>(
        await db.execute(
          sql`select count(*)::int as count from ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)}`,
        ),
      );
      return result?.count ?? 0;
    },
  };
}

/** Both drivers (node-postgres and PGlite) return raw query results as `{ rows }`. */
function rows<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}
