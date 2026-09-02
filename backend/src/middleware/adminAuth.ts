import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/httpError.js';

const HEADER = 'x-admin-secret';

export const requireAdminSecret: RequestHandler = (req, _res, next) => {
  const secret = req.header(HEADER);
  if (!secret || secret !== env.adminSecret) {
    throw new UnauthorizedError('Admin authentication failed');
  }
  next();
};
