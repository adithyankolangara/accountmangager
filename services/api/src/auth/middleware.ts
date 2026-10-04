import type { RequestHandler, Response } from 'express';
import type { DatabaseHandle } from '../db/client';
import { ApiError } from '../http/errors';
import { csrfTokenFor, findActiveSession, safeEqual, SESSION_ABSOLUTE_MS } from './sessions';

export const CSRF_HEADER = 'x-smartfin-csrf';
/** Clients that can't use cookies (the Android app) send this to receive a bearer token. */
export const CLIENT_HEADER = 'x-smartfin-client';

export interface CookieSettings {
  name: string;
  secure: boolean;
}

/** `__Host-` cookies must be Secure, so the prefix is used only over HTTPS. */
export function cookieSettings(secure: boolean): CookieSettings {
  return { name: secure ? '__Host-sf_session' : 'sf_session', secure };
}

export function setSessionCookie(res: Response, cookie: CookieSettings, token: string) {
  res.cookie(cookie.name, token, {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_ABSOLUTE_MS,
  });
}

export function clearSessionCookie(res: Response, cookie: CookieSettings) {
  res.clearCookie(cookie.name, {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: 'lax',
    path: '/',
  });
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Attaches req.auth when the request carries a valid bearer token or session cookie. */
export function authenticate(database: DatabaseHandle, cookie: CookieSettings): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    const token = bearer || readCookie(req.headers.cookie, cookie.name);
    if (token && token.length <= 200) {
      const session = await findActiveSession(database.db, token);
      if (session) req.auth = { ...session, token, via: bearer ? 'bearer' : 'cookie' };
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
  next();
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie-authenticated changes need the session's CSRF token in a header (which a cross-site
 * form can't set) and, when configured, an allowed Origin. Bearer requests are exempt: browsers
 * never attach bearer tokens automatically.
 */
export function csrfProtection(webOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || req.auth?.via !== 'cookie') {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (webOrigins.length > 0 && origin && !webOrigins.includes(origin)) {
      throw new ApiError(403, 'csrf_failed', 'Request origin not allowed');
    }
    const sent = req.headers[CSRF_HEADER];
    if (typeof sent !== 'string' || !safeEqual(sent, csrfTokenFor(req.auth.token))) {
      throw new ApiError(403, 'csrf_failed', 'Missing or invalid CSRF token. Reload the page.');
    }
    next();
  };
}
