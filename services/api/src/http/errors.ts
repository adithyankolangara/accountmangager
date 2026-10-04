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
    res
      .status(400)
      .json(errorBody('validation_failed', 'Request validation failed', requestId, err.issues));
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
