import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { userSessions, users } from '../db/schema';

export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000;
/** Sliding expiry is refreshed at most this often, to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export type SessionClient = 'web' | 'android';

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * CSRF token for cookie sessions, derived from the session token. An attacker who can't read the
 * HttpOnly cookie can't compute it, and the server stores nothing extra.
 */
export function csrfTokenFor(sessionToken: string): string {
  return createHash('sha256').update(`csrf:${sessionToken}`).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createSession(
  db: Database,
  userId: string,
  client: SessionClient,
  userAgent: string | undefined,
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + SESSION_ABSOLUTE_MS);
  const [row] = await db
    .insert(userSessions)
    .values({
      userId,
      tokenHash: sha256Hex(token),
      client,
      userAgent: userAgent?.slice(0, 300) ?? null,
      idleExpiresAt: new Date(now + SESSION_IDLE_MS),
      absoluteExpiresAt,
    })
    .returning({ id: userSessions.id });
  return { token, sessionId: row!.id, expiresAt: absoluteExpiresAt };
}

export interface ActiveSession {
  sessionId: string;
  userId: string;
  timeZone: string;
}

/** Resolves a session token to an active session, or null if unknown, revoked or expired. */
export async function findActiveSession(
  db: Database,
  token: string,
): Promise<ActiveSession | null> {
  const now = new Date();
  const [row] = await db
    .select({
      sessionId: userSessions.id,
      userId: users.id,
      timeZone: users.timeZone,
      lastSeenAt: userSessions.lastSeenAt,
    })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(
      and(
        eq(userSessions.tokenHash, sha256Hex(token)),
        isNull(userSessions.revokedAt),
        gt(userSessions.idleExpiresAt, now),
        gt(userSessions.absoluteExpiresAt, now),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(userSessions)
      .set({ lastSeenAt: now, idleExpiresAt: new Date(now.getTime() + SESSION_IDLE_MS) })
      .where(eq(userSessions.id, row.sessionId));
  }
  return { sessionId: row.sessionId, userId: row.userId, timeZone: row.timeZone };
}

export async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(userSessions.id, sessionId), isNull(userSessions.revokedAt)));
}
