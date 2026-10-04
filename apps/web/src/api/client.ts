import { API_PREFIX, errorBody, type ErrorCode } from '@smartfin/shared';
import type { z } from 'zod';

/**
 * Empty on the web: requests go to /api on the page's own origin (Vercel rewrites them to Render).
 * The Android build sets VITE_API_BASE_URL to the Render URL.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network_error' | 'invalid_response',
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface GetOptions {
  signal?: AbortSignal;
  /** Non-2xx statuses whose body still matches the schema (e.g. 503 from the readiness check). */
  acceptStatuses?: number[];
}

export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
  { signal, acceptStatuses = [] }: GetOptions = {},
): Promise<z.infer<S>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiRequestError(0, 'network_error', 'Could not reach the SmartFin server');
  }

  const json: unknown = await response.json().catch(() => undefined);
  if (response.ok || acceptStatuses.includes(response.status)) {
    const parsed = schema.safeParse(json);
    if (parsed.success) return parsed.data;
    throw new ApiRequestError(response.status, 'invalid_response', 'Unexpected server response');
  }

  const error = errorBody.safeParse(json);
  if (error.success) {
    const { code, message, requestId } = error.data.error;
    throw new ApiRequestError(response.status, code, message, requestId);
  }
  throw new ApiRequestError(
    response.status,
    'invalid_response',
    `Request failed (${response.status})`,
  );
}
