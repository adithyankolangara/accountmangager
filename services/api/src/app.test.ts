import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorBody, healthResponse, readinessResponse } from '@smartfin/shared';
import type { DatabaseHandle } from './db/client';
import { testApp, testDatabase } from './test-utils';

let database: DatabaseHandle;
let app: ReturnType<typeof testApp>;

beforeAll(async () => {
  database = await testDatabase();
  app = testApp(database);
});
afterAll(async () => {
  await database.close();
});

describe('GET /api/v1/health', () => {
  it('reports liveness in the documented shape', async () => {
    const res = await request(app).get('/api/v1/health').expect(200);
    const body = healthResponse.parse(res.body);
    expect(body.version).toBe('0.0.0-test');
  });
});

describe('GET /api/v1/health/ready', () => {
  it('is ready when the database is reachable and migrated', async () => {
    const res = await request(app).get('/api/v1/health/ready').expect(200);
    expect(readinessResponse.parse(res.body)).toEqual({
      status: 'ready',
      checks: { database: 'ok', migrations: 'ok' },
    });
  });

  it('reports pending migrations with 503', async () => {
    const fresh = await testDatabase({ migrate: false });
    try {
      const res = await request(testApp(fresh)).get('/api/v1/health/ready').expect(503);
      expect(res.body).toEqual({
        status: 'not_ready',
        checks: { database: 'ok', migrations: 'pending' },
      });
    } finally {
      await fresh.close();
    }
  });

  it('reports an unreachable database with 503', async () => {
    const broken = await testDatabase();
    const brokenApp = testApp(broken);
    await broken.close();
    const res = await request(brokenApp).get('/api/v1/health/ready').expect(503);
    expect(res.body.checks).toEqual({ database: 'error', migrations: 'error' });
  });
});

describe('correlation ids', () => {
  it('generates a request id when none is sent', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reuses a well-formed incoming request id', async () => {
    const res = await request(app).get('/api/v1/health').set('X-Request-Id', 'render-abc.123');
    expect(res.headers['x-request-id']).toBe('render-abc.123');
  });

  it('replaces a malformed incoming request id', async () => {
    const res = await request(app).get('/api/v1/health').set('X-Request-Id', 'bad id <script>');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('errors', () => {
  it('returns the standard error body for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nope').set('X-Request-Id', 'req-1').expect(404);
    expect(errorBody.parse(res.body).error).toMatchObject({
      code: 'not_found',
      requestId: 'req-1',
    });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .set('Content-Type', 'application/json')
      .send('{"amount": ')
      .expect(400);
    expect(res.body.error.code).toBe('bad_request');
  });

  it('rejects oversized bodies with 413', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(1_100_000) }))
      .expect(413);
    expect(res.body.error.code).toBe('bad_request');
  });
});

describe('security headers', () => {
  it('sets helmet headers and hides the framework', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('returns 429 with the standard error body once the limit is reached', async () => {
    const limited = testApp(database, { rateLimitPerMinute: 2 });
    await request(limited).get('/api/v1/openapi.json').expect(200);
    await request(limited).get('/api/v1/openapi.json').expect(200);
    const res = await request(limited).get('/api/v1/openapi.json').expect(429);
    expect(res.body.error.code).toBe('rate_limited');
  });

  it('never rate-limits health checks', async () => {
    const limited = testApp(database, { rateLimitPerMinute: 1 });
    for (let i = 0; i < 3; i++) await request(limited).get('/api/v1/health').expect(200);
  });
});

describe('API documentation', () => {
  it('serves an OpenAPI 3.1 document covering the health endpoints', async () => {
    const res = await request(app).get('/api/v1/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/api/v1/health', '/api/v1/health/ready']),
    );
    expect(res.body.components.schemas).toHaveProperty('Error');
  });

  it('serves Swagger UI when enabled', async () => {
    const res = await request(app).get('/api/docs/').expect(200);
    expect(res.text).toContain('swagger-ui');
  });

  it('does not serve Swagger UI when disabled', async () => {
    await request(testApp(database, { apiDocsEnabled: false }))
      .get('/api/docs/')
      .expect(404);
  });
});
