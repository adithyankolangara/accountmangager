import { loadConfig } from '../config';
import { createLogger } from '../logger';
import { connectDatabase } from './client';

/** Applies pending migrations, then exits. Used as the Render pre-deploy command. */
const config = loadConfig();
const logger = createLogger(config);
const database = await connectDatabase(config.database);
try {
  const before = await database.appliedMigrationCount();
  await database.migrate();
  const after = await database.appliedMigrationCount();
  logger.info(
    { kind: database.kind, applied: after - before, total: after },
    'migrations complete',
  );
} catch (err) {
  logger.error({ err }, 'migration failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
