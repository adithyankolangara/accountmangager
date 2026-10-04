import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseHandle } from '../db/client';
import { auditEvents, consents, users } from '../db/schema';
import { signUp, testApp, testDatabase } from '../test-utils';

let database: DatabaseHandle;
let app: ReturnType<typeof testApp>;

beforeAll(async () => {
  database = await testDatabase();
  app = testApp(database);
});
afterAll(async () => {
  await database.close();
});

const PASSWORD = 'correct horse battery';

describe('sign-up', () => {
  it('creates the user, records consent and starts a cookie session', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        displayName: 'Asha',
        email: 'Asha@Example.COM',
        password: PASSWORD,
        acceptPrivacyNotice: true,
      })
      .expect(201);
    expect(res.body.user).toMatchObject({
      email: 'asha@example.com',
      displayName: 'Asha',
      timeZone: 'Asia/Kolkata',
      preferredCurrency: 'INR',
    });
    expect(res.body.csrfToken).toEqual(expect.any(String));
    expect(res.body.sessionToken).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/sf_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const [row] = await database.db.select().from(users).where(eq(users.email, 'asha@example.com'));
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/);
    const consent = await database.db.select().from(consents).where(eq(consents.userId, row!.id));
    expect(consent).toHaveLength(1);
    expect(consent[0]!.kind).toBe('privacy_notice');
  });

  it('rejects a second account with the same email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        displayName: 'X',
        email: 'asha@example.com',
        password: PASSWORD,
        acceptPrivacyNotice: true,
      })
      .expect(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('validates the password length and privacy notice acceptance', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        displayName: 'X',
        email: 'x@example.com',
        password: 'short',
        acceptPrivacyNotice: false,
      })
      .expect(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['password', 'acceptPrivacyNotice']));
  });
});

describe('sign-in and sessions', () => {
  it('uses one message for a wrong password and an unknown email, and audits failures', async () => {
    const wrong = await request(app)
      .post('/api/v1/auth/signin')
      .send({ email: 'asha@example.com', password: 'wrong password' })
      .expect(401);
    const unknown = await request(app)
      .post('/api/v1/auth/signin')
      .send({ email: 'nobody@example.com', password: 'wrong password' })
      .expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    const failures = await database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'auth.signin_failed'));
    expect(failures.length).toBeGreaterThanOrEqual(2);
  });

  it('signs in, reports the session and signs out', async () => {
    const agent = request.agent(app);
    const signin = await agent
      .post('/api/v1/auth/signin')
      .send({ email: 'ASHA@example.com', password: PASSWORD })
      .expect(200);
    const session = await agent.get('/api/v1/auth/session').expect(200);
    expect(session.body.user.email).toBe('asha@example.com');
    expect(session.body.csrfToken).toBe(signin.body.csrfToken);

    await agent
      .post('/api/v1/auth/signout')
      .set('X-SmartFin-CSRF', signin.body.csrfToken)
      .expect(204);
    await agent.get('/api/v1/auth/session').expect(401);
  });

  it('issues bearer tokens to the Android client, without cookies or CSRF', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signin')
      .set('X-SmartFin-Client', 'android')
      .send({ email: 'asha@example.com', password: PASSWORD })
      .expect(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    const token = res.body.sessionToken as string;
    expect(token).toEqual(expect.any(String));
    await request(app)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ nickname: 'Phone', kind: 'wallet', openingDate: '2026-01-01' })
      .expect(201);
  });

  it('rejects unknown or malformed bearer tokens', async () => {
    await request(app).get('/api/v1/accounts').set('Authorization', 'Bearer nope').expect(401);
  });
});

describe('CSRF protection', () => {
  it('requires the CSRF header for cookie-authenticated changes', async () => {
    const user = await signUp(app);
    await user.agent
      .post('/api/v1/accounts')
      .send({ nickname: 'A', kind: 'cash', openingDate: '2026-01-01' })
      .expect(403);
    const res = await user.agent
      .post('/api/v1/accounts')
      .set('X-SmartFin-CSRF', 'forged')
      .send({ nickname: 'A', kind: 'cash', openingDate: '2026-01-01' })
      .expect(403);
    expect(res.body.error.code).toBe('csrf_failed');
    await user
      .post('/api/v1/accounts', { nickname: 'A', kind: 'cash', openingDate: '2026-01-01' })
      .expect(201);
  });

  it('allows reads without the header', async () => {
    const user = await signUp(app);
    await user.agent.get('/api/v1/accounts').expect(200);
  });

  it('rejects disallowed origins when origins are configured', async () => {
    const strict = testApp(database, { webOrigins: ['https://app.example.in'] });
    const user = await signUp(strict);
    await user.agent
      .post('/api/v1/accounts')
      .set('X-SmartFin-CSRF', user.csrf)
      .set('Origin', 'https://evil.example')
      .send({ nickname: 'A', kind: 'cash', openingDate: '2026-01-01' })
      .expect(403);
    await user.agent
      .post('/api/v1/accounts')
      .set('X-SmartFin-CSRF', user.csrf)
      .set('Origin', 'https://app.example.in')
      .send({ nickname: 'A', kind: 'cash', openingDate: '2026-01-01' })
      .expect(201);
  });
});

describe('profile', () => {
  it('updates the display name and time zone, and rejects unknown zones', async () => {
    const user = await signUp(app);
    const res = await user
      .patch('/api/v1/me', { displayName: 'Ravi K', timeZone: 'Asia/Dubai' })
      .expect(200);
    expect(res.body).toMatchObject({ displayName: 'Ravi K', timeZone: 'Asia/Dubai' });
    await user.patch('/api/v1/me', { timeZone: 'Mars/Olympus' }).expect(400);
  });
});

describe('rate limiting', () => {
  it('limits repeated sign-in attempts for the same email', async () => {
    const limited = testApp(database, { authRateLimit: 2 });
    const attempt = () =>
      request(limited)
        .post('/api/v1/auth/signin')
        .send({ email: 'asha@example.com', password: 'nope' });
    await attempt().expect(401);
    await attempt().expect(401);
    const res = await attempt().expect(429);
    expect(res.body.error.code).toBe('rate_limited');
  });
});
