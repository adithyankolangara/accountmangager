import type { Request } from 'express';
import { ApiError } from './errors';

export interface RequestAuth {
  userId: string;
  sessionId: string;
  timeZone: string;
  via: 'cookie' | 'bearer';
  /** Raw session token from the cookie or bearer header (never logged or stored). */
  token: string;
}

/** Everything a repository needs to scope a query to the signed-in user. */
export interface Ctx {
  userId: string;
  timeZone: string;
  requestId: string;
}

export function ctxOf(req: Request): Ctx {
  if (!req.auth) throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
  return { userId: req.auth.userId, timeZone: req.auth.timeZone, requestId: String(req.id) };
}
