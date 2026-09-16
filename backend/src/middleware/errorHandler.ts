import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../utils/httpError.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let message = 'Internal Server Error';
  let code: string | undefined;

  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
    code = err.code;
  } else if (typeof err === 'object' && err !== null) {
    if ('status' in err && typeof err.status === 'number') {
      status = err.status;
    }
    if ('message' in err && typeof err.message === 'string') {
      message = err.message;
    }
  }

  res.status(status).json(code ? { error: message, code } : { error: message });
};
