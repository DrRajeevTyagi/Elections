import { Router } from 'express';
import { requireAdminSecret } from '../middleware/adminAuth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const adminRouter = Router();

// Lets the admin UI check a secret is correct before revealing any dashboard content.
adminRouter.post(
  '/verify',
  requireAdminSecret,
  asyncHandler((_req, res) => {
    res.json({ ok: true });
  })
);
