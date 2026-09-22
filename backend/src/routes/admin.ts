import { Router } from 'express';
import { requireAdminSecret, requireAdminSession } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { adminSessionService } from '../services/adminSessionService.js';
import { BadRequestError, ConflictError } from '../utils/httpError.js';

export const adminRouter = Router();

// Lets the admin UI check a secret is correct before revealing any
// dashboard content, and claims the single admin-console slot for this
// browser tab (see adminSessionService) -- only one terminal may hold
// control of the election at a time. If another tab already holds it, this
// fails with 409 unless `x-admin-force` is sent, which deliberately evicts
// the other terminal (e.g. after it crashed without logging out).
adminRouter.post(
  '/verify',
  requireAdminSecret,
  asyncHandler((req, res) => {
    const clientId = req.header('x-admin-client-id');
    if (!clientId) {
      throw new BadRequestError('Missing client id');
    }
    const force = req.header('x-admin-force') === 'true';
    const claim = adminSessionService.claim(clientId, force);
    if (!claim.ok) {
      throw new ConflictError(
        `The admin console is already open on another device (since ${new Date(claim.activeSince!).toLocaleTimeString()}). ` +
          'Ask them to log out, or take over to disconnect that device.',
        'ADMIN_SESSION_CONFLICT'
      );
    }
    res.json({ ok: true });
  })
);

// Releases the admin-console slot immediately instead of leaving it to time
// out, so the same terminal can hand off to another right away.
adminRouter.post(
  '/logout',
  asyncHandler((req, res) => {
    const clientId = req.header('x-admin-client-id');
    if (clientId) {
      adminSessionService.release(clientId);
    }
    res.status(204).send();
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
  requireAdminSession,
  asyncHandler((_req, res) => {
    res.json(dataStore.getStorageHealth());
  })
);
