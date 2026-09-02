import type { RequestHandler } from 'express';
import { kioskService } from '../services/kioskService.js';
import { UnauthorizedError } from '../utils/httpError.js';

const TOKEN_HEADER = 'x-kiosk-token';

export const requireKioskSession: RequestHandler = (req, res, next) => {
  const token = req.header(TOKEN_HEADER);

  if (!token) {
    throw new UnauthorizedError('Kiosk session token missing');
  }

  const session = kioskService.consumeSession(token.trim());
  res.locals.kioskSession = session;
  next();
};
