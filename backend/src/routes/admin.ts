import { Router } from 'express';
import { requireAdminSecret, requireAdminSession } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { adminSessionService } from '../services/adminSessionService.js';
import { logAction } from '../services/auditLogService.js';
import { BadRequestError, ConflictError } from '../utils/httpError.js';
import { kioskLimiterStore } from '../middleware/rateLimit.js';

export const adminRouter = Router();

const requireClientId = (clientId: string | undefined): string => {
  if (!clientId) {
    throw new BadRequestError('Missing client id');
  }
  return clientId;
};

// Logs a takeover request that ran out of time unanswered -- at most once,
// on whichever request first notices it (see adminSessionService.sweepExpired).
const logIfExpired = async (): Promise<void> => {
  const expired = adminSessionService.sweepExpired();
  if (expired) {
    await logAction(expired.clientId, 'admin.session.takeoverExpired', {
      requester: expired.label ?? expired.clientId,
      holder: adminSessionService.getHolderLabel()
    });
  }
};

// Lets the admin UI check a secret is correct before revealing any
// dashboard content, and claims the single admin-console slot for this
// browser tab (see adminSessionService) -- only one terminal may hold
// control of the election at a time. If another live device holds it, this
// fails with 409 ADMIN_SESSION_CONFLICT; the caller can then ask that
// device for control (POST /admin/takeover-requests). A holder that has
// been silent for 3+ minutes (crashed, closed) is replaced without asking.
adminRouter.post(
  '/verify',
  requireAdminSecret,
  asyncHandler(async (req, res) => {
    const clientId = requireClientId(req.header('x-admin-client-id'));
    // A short device label ("Chrome / Windows · 3f2a") -- see
    // adminSessionService.ts for why this exists: it's what lets the action
    // log and the takeover messages name a device instead of a random id.
    const { label } = req.body as { label?: string };
    const claim = adminSessionService.claim(clientId, label);
    if (!claim.ok) {
      throw new ConflictError(
        `The admin console is in use on ${claim.holderLabel ?? 'another device'} (since ${new Date(claim.activeSince!).toLocaleTimeString()}).`,
        'ADMIN_SESSION_CONFLICT',
        { holderLabel: claim.holderLabel, activeSince: claim.activeSince, takeableAt: claim.takeableAt }
      );
    }
    if (claim.tookOverFrom) {
      await logAction(clientId, 'admin.session.takeover', { evicted: claim.tookOverFrom, reason: 'previous device silent for 3+ minutes' });
    } else {
      await logAction(clientId, 'admin.session.claim', {});
    }
    res.json({ ok: true });
  })
);

// A second device asking the device in control to hand over. The secret is
// still required -- only someone who knows it can even ask.
adminRouter.post(
  '/takeover-requests',
  requireAdminSecret,
  asyncHandler(async (req, res) => {
    const clientId = requireClientId(req.header('x-admin-client-id'));
    const { label } = req.body as { label?: string };
    await logIfExpired();
    const result = adminSessionService.requestTakeover(clientId, label);
    if (!result.ok) {
      if (result.reason === 'anotherPending') {
        throw new ConflictError('Another device is already asking for control. Please wait a minute and try again.', 'TAKEOVER_ALREADY_PENDING');
      }
      throw new ConflictError('Nobody else is in control right now -- just log in.', 'TAKEOVER_NOT_NEEDED');
    }
    await logAction(clientId, 'admin.session.takeoverRequested', {
      requester: result.request.label ?? clientId,
      holder: adminSessionService.getHolderLabel()
    });
    res.status(201).json({ request: result.request });
  })
);

// The asking device checking for an answer. Only the device that asked can
// read its own request.
adminRouter.get(
  '/takeover-requests/:id',
  requireAdminSecret,
  asyncHandler(async (req, res) => {
    const clientId = requireClientId(req.header('x-admin-client-id'));
    await logIfExpired();
    const holderBefore = adminSessionService.getHolderLabel();
    const result = adminSessionService.checkRequest(clientId, req.params.id);
    if (!result) {
      throw new BadRequestError('Request not found');
    }
    if (result.grantedFrom) {
      await logAction(clientId, 'admin.session.takeover', {
        evicted: holderBefore ?? result.grantedFrom,
        reason: 'device in control logged out or went silent while the request was waiting'
      });
    }
    res.json({ request: result.request });
  })
);

adminRouter.delete(
  '/takeover-requests/:id',
  requireAdminSecret,
  asyncHandler((req, res) => {
    const clientId = requireClientId(req.header('x-admin-client-id'));
    adminSessionService.cancelRequest(clientId, req.params.id);
    res.status(204).send();
  })
);

// The device in control checks in here every few seconds: this is both how
// it finds out someone is asking for control, and how the server knows it
// is still alive (requireAdminSession records the visit).
adminRouter.get(
  '/session-status',
  requireAdminSession,
  asyncHandler(async (req, res) => {
    await logIfExpired();
    const request = adminSessionService.pendingRequestFor(req.header('x-admin-client-id') ?? '');
    res.json({
      pendingRequest: request ? { id: request.id, label: request.label, createdAt: request.createdAt, expiresAt: request.expiresAt } : null
    });
  })
);

// The device in control answering Allow / Deny.
adminRouter.post(
  '/takeover-requests/:id/respond',
  requireAdminSession,
  asyncHandler(async (req, res) => {
    const clientId = requireClientId(req.header('x-admin-client-id'));
    const { allow } = req.body as { allow?: unknown };
    if (typeof allow !== 'boolean') {
      throw new BadRequestError('Missing allow flag');
    }
    // Resolved before answering: once control moves, this client's label
    // is no longer the holder's.
    const actor = adminSessionService.getHolderLabel() ?? clientId;
    await logIfExpired();
    const result = adminSessionService.respond(clientId, req.params.id, allow);
    if (!result.ok) {
      throw new ConflictError('That request is no longer waiting for an answer.', 'TAKEOVER_NOT_PENDING');
    }
    const requester = result.request.label ?? result.request.clientId;
    if (allow) {
      // Logged under the new holder so the actor resolves to its label.
      await logAction(result.request.clientId, 'admin.session.takeover', { evicted: actor, reason: 'allowed by the device in control' });
    } else {
      await logAction(clientId, 'admin.session.takeoverDenied', { requester, holder: actor });
    }
    res.json({ request: result.request });
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
