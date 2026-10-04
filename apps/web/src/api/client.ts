import { API_PREFIX, errorBody, type ErrorCode } from '@smartfin/shared';
import type { z } from 'zod';

/**
 * Empty on the web: requests go to /api on the page's own origin (Vercel rewrites them to Render).
 * The Android build sets VITE_API_BASE_URL to the Render URL.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network_error' | 'invalid_response',
    message: string,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Field-level problems reported by the API (validation errors). */
  get fieldIssues(): FieldIssue[] {
    return Array.isArray(this.details)
      ? this.details.filter(
          (d): d is FieldIssue => typeof d?.path === 'string' && typeof d?.message === 'string',
        )
      : [];
  }
}

/** Held in memory only; refreshed from /auth/session on every page load. */
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions<S extends z.ZodType | undefined> {
  schema?: S;
  body?: unknown;
  query?: Query;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Non-2xx statuses whose body still matches the schema (e.g. 503 from the readiness check). */
  acceptStatuses?: number[];
}

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${API_BASE_URL}${API_PREFIX}${path}${qs ? `?${qs}` : ''}`;
}

export async function api<S extends z.ZodType | undefined = undefined>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  { schema, body, query, headers = {}, signal, acceptStatuses = [] }: RequestOptions<S> = {},
): Promise<S extends z.ZodType ? z.infer<S> : undefined> {
  const requestHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) requestHeaders['X-SmartFin-CSRF'] = csrfToken;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiRequestError(0, 'network_error', 'Could not reach the SmartFin server');
  }

  if (response.status === 204) return undefined as never;
  const json: unknown = await response.json().catch(() => undefined);
  if (response.ok || acceptStatuses.includes(response.status)) {
    if (!schema) return undefined as never;
    const parsed = schema.safeParse(json);
    if (parsed.success) return parsed.data as never;
    throw new ApiRequestError(response.status, 'invalid_response', 'Unexpected server response');
  }

  const error = errorBody.safeParse(json);
  if (error.success) {
    const { code, message, requestId, details } = error.data.error;
    throw new ApiRequestError(response.status, code, message, requestId, details);
  }
  throw new ApiRequestError(
    response.status,
    'invalid_response',
    `Request failed (${response.status})`,
  );
}

export function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
  options: Omit<RequestOptions<S>, 'schema' | 'body'> = {},
): Promise<z.infer<S>> {
  return api('GET', path, { ...options, schema }) as Promise<z.infer<S>>;
}

/** User-facing description of any error thrown by the API layer. */
export function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const ref = error.requestId && error.status >= 500 ? ` (reference ${error.requestId})` : '';
    return `${error.message}${ref}`;
  }
  return 'Something went wrong. Please try again.';
}
