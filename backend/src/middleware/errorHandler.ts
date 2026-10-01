import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../utils/httpError.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let message = 'Internal Server Error';
  let code: string | undefined;
  let details: Record<string, unknown> | undefined;

  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
    code = err.code;
    details = err.details;
  } else if (typeof err === 'object' && err !== null) {
    if ('status' in err && typeof err.status === 'number') {
      status = err.status;
    }
    if ('message' in err && typeof err.message === 'string') {
      message = err.message;
    }
  }

  res.status(status).json({ error: message, ...(code ? { code } : {}), ...(details ? { details } : {}) });
};
