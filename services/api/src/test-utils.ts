import { pino } from 'pino';
import { createApp, type AppDeps } from './app';
import { connectDatabase, type DatabaseHandle } from './db/client';
import { expectedMigrationCount } from './db/migrations';

export const silentLogger = pino({ level: 'silent' });

/** Fresh in-memory PGlite database, migrated unless asked otherwise. */
export async function testDatabase({ migrate = true } = {}): Promise<DatabaseHandle> {
  const database = await connectDatabase({ pgliteDataDir: undefined });
  if (migrate) await database.migrate();
  return database;
}

export function testApp(database: DatabaseHandle, config: Partial<AppDeps['config']> = {}) {
  return createApp({
    config: {
      trustProxyHops: 0,
      rateLimitPerMinute: 1000,
      apiDocsEnabled: true,
      version: '0.0.0-test',
      ...config,
    },
    logger: silentLogger,
    database,
    expectedMigrations: expectedMigrationCount(),
  });
}
