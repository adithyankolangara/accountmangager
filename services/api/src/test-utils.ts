import { pino } from 'pino';
import request from 'supertest';
import type { Express } from 'express';
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
      rateLimitPerMinute: 10_000,
      authRateLimit: 1_000,
      webOrigins: [],
      secureCookies: false,
      apiDocsEnabled: true,
      version: '0.0.0-test',
      ...config,
    },
    logger: silentLogger,
    database,
    expectedMigrations: expectedMigrationCount(),
  });
}

let userCounter = 0;

/**
 * Signs up a fresh user and returns a client that keeps the session cookie and sends the CSRF
 * header on every change, like the web app does.
 */
export async function signUp(app: Express, name = 'Test User') {
  userCounter += 1;
  const agent = request.agent(app);
  const email = `user${userCounter}.${Date.now()}@example.com`;
  const res = await agent
    .post('/api/v1/auth/signup')
    .send({
      displayName: name,
      email,
      password: 'correct horse battery',
      acceptPrivacyNotice: true,
    })
    .expect(201);
  const csrf: string = res.body.csrfToken;
  const withCsrf = <T extends request.Test>(t: T) => t.set('X-SmartFin-CSRF', csrf);
  return {
    email,
    user: res.body.user as { id: string; email: string },
    csrf,
    agent,
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => withCsrf(agent.post(url)).send(body ?? {}),
    patch: (url: string, body: object) => withCsrf(agent.patch(url)).send(body),
    delete: (url: string) => withCsrf(agent.delete(url)),
  };
}
export type TestUser = Awaited<ReturnType<typeof signUp>>;

export async function createAccount(user: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await user
    .post('/api/v1/accounts', {
      nickname: 'Main account',
      kind: 'savings',
      openingBalance: '10000.00',
      openingDate: '2026-01-01',
      ...overrides,
    })
    .expect(201);
  return res.body as { id: string; balance: string; version: number };
}

export async function categoryId(user: TestUser, name: string): Promise<string> {
  const res = await user.get('/api/v1/categories').expect(200);
  const found = (res.body as { id: string; name: string }[]).find((c) => c.name === name);
  if (!found) throw new Error(`No category ${name}`);
  return found.id;
}

export async function createTransaction(user: TestUser, body: Record<string, unknown>) {
  const res = await user.post('/api/v1/transactions', body).expect(201);
  return res.body.transaction as { id: string; version: number; amount: string };
}
