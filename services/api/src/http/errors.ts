import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ErrorBody, ErrorCode } from '@smartfin/shared';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 404 for both "doesn't exist" and "not yours", so ids never reveal other users' records. */
export const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found`);
export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, 'conflict', message, details);
export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, 'bad_request', message, details);
export const forbidden = (message: string) => new ApiError(403, 'forbidden', message);

/** Field-level validation error, in the same shape as Zod failures. */
export const invalidField = (path: string, message: string) =>
  new ApiError(400, 'validation_failed', message, [{ path, message }]);

export function errorBody(
  code: ErrorCode,
  message: string,
  requestId: string | undefined,
  details?: unknown,
): ErrorBody {
  return {
    error: { code, message, ...(details === undefined ? {} : { details }), requestId },
  };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json(errorBody('not_found', `No route for ${req.method} ${req.path}`, String(req.id)));
};

/** Body-parser errors carry an HTTP status and a type; anything else is unexpected. */
interface HttpLikeError {
  status?: number;
  type?: string;
}

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const requestId = String(req.id);

  if (err instanceof ApiError) {
    res.status(err.status).json(errorBody(err.code, err.message, requestId, err.details));
    return;
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const message =
      details.length === 1 ? details[0]!.message : 'Please correct the highlighted fields';
    res.status(400).json(errorBody('validation_failed', message, requestId, details));
    return;
  }
  const httpErr = err as HttpLikeError;
  if (httpErr.type === 'entity.parse.failed') {
    res.status(400).json(errorBody('bad_request', 'Malformed JSON body', requestId));
    return;
  }
  if (httpErr.type === 'entity.too.large') {
    res.status(413).json(errorBody('bad_request', 'Request body too large', requestId));
    return;
  }

  req.log.error({ err }, 'unhandled error');
  res.status(500).json(errorBody('internal_error', 'Something went wrong', requestId));
};
