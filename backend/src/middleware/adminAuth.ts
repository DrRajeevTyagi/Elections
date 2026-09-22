import { timingSafeEqual } from 'crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/httpError.js';
import { adminGuessLimiter } from './rateLimit.js';
import { adminSessionService } from '../services/adminSessionService.js';

const HEADER = 'x-admin-secret';
const CLIENT_ID_HEADER = 'x-admin-client-id';

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

// Confirms this browser tab still holds the single admin-console slot (see
// adminSessionService) and refreshes its heartbeat. Only POST /admin/verify
// is allowed to grant that slot to a new client -- every other admin route
// just re-checks it, so a second terminal that knows the secret still can't
// act unless it actually takes over the slot via /admin/verify first.
const checkSessionHolder: RequestHandler = (req, _res, next) => {
  const clientId = req.header(CLIENT_ID_HEADER);
  if (!clientId || !adminSessionService.touch(clientId)) {
    throw new UnauthorizedError(
      'This admin console is no longer the active session -- it was taken over from another device. Please log in again.',
      'ADMIN_SESSION_LOST'
    );
  }
  next();
};

// Rate-limited first: repeated wrong guesses are throttled before they ever
// reach the (already constant-time) comparison above.
export const requireAdminSecret: RequestHandler[] = [adminGuessLimiter, checkAdminSecret];

// Used by every admin route except /admin/verify: the secret alone is not
// enough once a session exists elsewhere -- see checkSessionHolder above.
export const requireAdminSession: RequestHandler[] = [adminGuessLimiter, checkAdminSecret, checkSessionHolder];
