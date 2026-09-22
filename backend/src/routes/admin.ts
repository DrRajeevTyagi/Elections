import { Router } from 'express';
import { requireAdminSecret } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
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

// Backs the dashboard's Storage status indicator -- the one signal that
// tells an admin apart "a vote's save blipped and already recovered" from
// "saves are failing right now" when an officer reports the
// VOTE_SAVE_UNCONFIRMED error (see routes/votes.ts). A vote count alone
// can't answer that: a vote is counted in memory before its save to
// Firestore/disk is even attempted.
adminRouter.get(
  '/storage-health',
  requireAdminSecret,
  asyncHandler((_req, res) => {
    res.json(dataStore.getStorageHealth());
  })
);
