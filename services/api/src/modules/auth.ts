import { Router, type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { and, eq, isNull } from 'drizzle-orm';
import {
  PRIVACY_NOTICE_VERSION,
  signInInput,
  signUpInput,
  updateProfileInput,
  type SessionResponse,
  type User,
} from '@smartfin/shared';
import { recordAudit } from '../audit';
import {
  CLIENT_HEADER,
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
  type CookieSettings,
} from '../auth/middleware';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { createSession, csrfTokenFor, revokeSession, type SessionClient } from '../auth/sessions';
import type { DatabaseHandle } from '../db/client';
import { consents, users } from '../db/schema';
import { ctxOf } from '../http/context';
import { ApiError, conflict, errorBody, invalidField } from '../http/errors';

type UserRow = typeof users.$inferSelect;

export function toUserDto(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    preferredCurrency: row.preferredCurrency,
    timeZone: row.timeZone,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface AuthDeps {
  database: DatabaseHandle;
  cookie: CookieSettings;
  authRateLimit: number;
}

export function authRouter({ database, cookie, authRateLimit }: AuthDeps): Router {
  const { db } = database;
  const router = Router();

  const limited = (windowMs: number, key: (req: Request) => string) =>
    rateLimit({
      windowMs,
      limit: authRateLimit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: key,
      handler: (req, res) => {
        res
          .status(429)
          .json(
            errorBody(
              'rate_limited',
              'Too many attempts. Wait a few minutes and try again.',
              String(req.id),
            ),
          );
      },
    });
  const ip = (req: Request) => ipKeyGenerator(req.ip ?? '');
  const signInLimiter = limited(15 * 60_000, (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    return `${ip(req)}|${email}`;
  });
  const signUpLimiter = limited(60 * 60_000, ip);

  /** Starts a session: a cookie for the web, a bearer token for clients that ask for one. */
  async function startSession(req: Request, res: Response, user: UserRow, status: number) {
    const client: SessionClient = req.headers[CLIENT_HEADER] === 'android' ? 'android' : 'web';
    const session = await createSession(db, user.id, client, req.headers['user-agent']);
    const body: SessionResponse = { user: toUserDto(user), csrfToken: csrfTokenFor(session.token) };
    if (client === 'android') body.sessionToken = session.token;
    else setSessionCookie(res, cookie, session.token);
    res.status(status).json(body);
  }

  router.post('/auth/signup', signUpLimiter, async (req, res) => {
    const input = signUpInput.parse(req.body);
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing) throw conflict('An account with this email already exists. Sign in instead.');

    const passwordHash = await hashPassword(input.password);
    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ email: input.email, displayName: input.displayName, passwordHash })
        .returning();
      await tx
        .insert(consents)
        .values({ userId: created!.id, kind: 'privacy_notice', version: PRIVACY_NOTICE_VERSION });
      await recordAudit(tx, {
        actorUserId: created!.id,
        requestId: String(req.id),
        action: 'auth.signup',
        entityType: 'user',
        entityId: created!.id,
      });
      return created!;
    });
    await startSession(req, res, user, 201);
  });

  router.post('/auth/signin', signInLimiter, async (req, res) => {
    const input = signInInput.parse(req.body);
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, input.email), isNull(users.deletedAt)))
      .limit(1);
    const ok = await verifyPassword(user?.passwordHash ?? null, input.password);
    if (!user || !ok) {
      await recordAudit(db, {
        actorUserId: user?.id ?? null,
        requestId: String(req.id),
        action: 'auth.signin_failed',
        entityType: 'user',
        entityId: user?.id,
      });
      throw new ApiError(401, 'unauthenticated', 'Email or password is incorrect');
    }
    await recordAudit(db, {
      actorUserId: user.id,
      requestId: String(req.id),
      action: 'auth.signin',
      entityType: 'user',
      entityId: user.id,
    });
    await startSession(req, res, user, 200);
  });

  router.post('/auth/signout', requireAuth, async (req, res) => {
    const ctx = ctxOf(req);
    await revokeSession(db, req.auth!.sessionId);
    await recordAudit(db, {
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      action: 'auth.signout',
      entityType: 'user',
      entityId: ctx.userId,
    });
    clearSessionCookie(res, cookie);
    res.status(204).end();
  });

  router.get('/auth/session', requireAuth, async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1);
    const body: SessionResponse = {
      user: toUserDto(user!),
      csrfToken: csrfTokenFor(req.auth!.token),
    };
    res.json(body);
  });

  router.patch('/me', requireAuth, async (req, res) => {
    const ctx = ctxOf(req);
    const input = updateProfileInput.parse(req.body);
    if (input.timeZone && !Intl.supportedValuesOf('timeZone').includes(input.timeZone)) {
      throw invalidField('timeZone', 'Unknown time zone');
    }
    const [user] = await db
      .update(users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(users.id, ctx.userId))
      .returning();
    await recordAudit(db, {
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      action: 'user.update_profile',
      entityType: 'user',
      entityId: ctx.userId,
      metadata: { fields: Object.keys(input) },
    });
    res.json(toUserDto(user!));
  });

  return router;
}
