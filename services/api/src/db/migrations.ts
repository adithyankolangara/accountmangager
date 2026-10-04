import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';

export const MIGRATIONS_SCHEMA = 'drizzle';
export const MIGRATIONS_TABLE = '__drizzle_migrations';

let cachedFolder: string | undefined;

/**
 * Locates database/migrations by walking up from this module. The same code runs from
 * src/ (tsx, tests) and from the bundled dist/, which sit at different depths.
 */
export function migrationsFolder(): string {
  if (cachedFolder) return cachedFolder;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'database', 'migrations');
    if (existsSync(join(candidate, 'meta', '_journal.json'))) {
      cachedFolder = candidate;
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Could not find database/migrations/meta/_journal.json');
    dir = parent;
  }
}

/** Number of migration files shipped with this build. */
export function expectedMigrationCount(): number {
  return readMigrationFiles({ migrationsFolder: migrationsFolder() }).length;
}
