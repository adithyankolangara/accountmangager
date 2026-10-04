import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

describe('loadConfig', () => {
  it('defaults to an embedded PGlite database in development', () => {
    const config = loadConfig({});
    expect(config.env).toBe('development');
    expect(config.database).toEqual({ pgliteDataDir: '.data/pglite' });
    expect(config.migrateOnStart).toBe(true);
    expect(config.port).toBe(4000);
  });

  it('keeps PGlite in memory when asked', () => {
    expect(loadConfig({ PGLITE_DATA_DIR: 'memory' }).database).toEqual({
      pgliteDataDir: undefined,
    });
  });

  it('requires DATABASE_URL in production and does not migrate on start by default', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
    const config = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@host:5432/smartfin',
    });
    expect(config.database).toEqual({ url: 'postgresql://u:p@host:5432/smartfin' });
    expect(config.migrateOnStart).toBe(false);
  });

  it('rejects non-postgres database URLs', () => {
    expect(() => loadConfig({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('parses booleans and numbers from strings', () => {
    const config = loadConfig({
      MIGRATE_ON_START: 'false',
      API_DOCS_ENABLED: 'false',
      TRUST_PROXY_HOPS: '2',
    });
    expect(config).toMatchObject({
      migrateOnStart: false,
      apiDocsEnabled: false,
      trustProxyHops: 2,
    });
  });

  it('derives the version from the Render commit', () => {
    expect(loadConfig({ RENDER_GIT_COMMIT: '3f2a1c9d8e7b' }).version).toMatch(/\+3f2a1c9$/);
    expect(loadConfig({ APP_VERSION: '1.2.3' }).version).toBe('1.2.3');
  });
});
