import { createApp } from './app';
import { loadConfig } from './config';
import { connectDatabase } from './db/client';
import { expectedMigrationCount } from './db/migrations';
import { createLogger } from './logger';

const config = loadConfig();
const logger = createLogger(config);
const database = await connectDatabase(config.database);

if (config.migrateOnStart) {
  await database.migrate();
  logger.info({ kind: database.kind }, 'migrations applied at startup');
}

const app = createApp({ config, logger, database, expectedMigrations: expectedMigrationCount() });
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env, db: database.kind }, 'SmartFin API listening');
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
  // Render sends SIGTERM and allows ~30 s; stop waiting for slow connections well before that.
  setTimeout(() => process.exit(1), 20_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
