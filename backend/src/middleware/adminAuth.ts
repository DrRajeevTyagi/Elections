import { timingSafeEqual } from 'crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/httpError.js';
import { adminGuessLimiter } from './rateLimit.js';

const HEADER = 'x-admin-secret';

// Constant-time comparison -- a plain `!==` leaks how many leading
// characters matched via response timing, which matters here since this is
// the one secret in the app that's a human-chosen string rather than a
// random high-entropy code.
const isCorrectSecret = (provided: string): boolean => {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(env.adminSecret);
  if (providedBuf.length !== expectedBuf.length) {
    // timingSafeEqual throws on mismatched lengths; a length mismatch
    // already means "wrong", so short-circuit instead of padding.
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
};

const checkAdminSecret: RequestHandler = (req, _res, next) => {
  const secret = req.header(HEADER);
  if (!secret || !isCorrectSecret(secret)) {
    throw new UnauthorizedError('Admin authentication failed');
  }
  next();
};

// Rate-limited first: repeated wrong guesses are throttled before they ever
// reach the (already constant-time) comparison above.
export const requireAdminSecret: RequestHandler[] = [adminGuessLimiter, checkAdminSecret];
