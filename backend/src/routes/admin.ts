import { Router } from 'express';
import { requireAdminSecret, requireAdminSession } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { adminSessionService } from '../services/adminSessionService.js';
import { logAction } from '../services/auditLogService.js';
import { BadRequestError, ConflictError } from '../utils/httpError.js';
import { kioskLimiterStore } from '../middleware/rateLimit.js';

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
  asyncHandler(async (req, res) => {
    const clientId = req.header('x-admin-client-id');
    if (!clientId) {
      throw new BadRequestError('Missing client id');
    }
    const force = req.header('x-admin-force') === 'true';
    // A short human-entered label ("Rajeev -- laptop"), optional -- see
    // adminSessionService.ts for why this exists: it's what lets the action
    // log (once a recording is active) say a real name instead of just this
    // client's random per-tab id.
    const { label } = req.body as { label?: string };
    const claim = adminSessionService.claim(clientId, force, label);
    if (!claim.ok) {
      throw new ConflictError(
        `The admin console is already open on another device (since ${new Date(claim.activeSince!).toLocaleTimeString()}). ` +
          'Ask them to log out, or take over to disconnect that device.',
        'ADMIN_SESSION_CONFLICT'
      );
    }
    if (claim.tookOverFrom) {
      await logAction(clientId, 'admin.session.takeover', { evicted: claim.tookOverFrom });
    } else {
      await logAction(clientId, 'admin.session.claim', {});
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

// Instantly un-blocks every device currently locked out of entering an
// officer code (see middleware/rateLimit.ts's kioskGuessLimiter) -- lets an
// admin recover during a live election instead of everyone waiting out the
// 10-minute window. Does not touch the (separate) admin-secret limiter.
adminRouter.post(
  '/rate-limit/reset',
  requireAdminSession,
  asyncHandler(async (req, res) => {
    await kioskLimiterStore.resetAll();
    const clientId = req.header('x-admin-client-id') ?? 'unknown';
    await logAction(clientId, 'admin.rateLimit.reset', {});
    res.status(204).send();
  })
);
