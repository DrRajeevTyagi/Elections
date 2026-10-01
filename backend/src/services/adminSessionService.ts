// Enforces "only one terminal at a time" for the admin dashboard. The admin
// secret itself is a single shared password (see middleware/adminAuth.ts),
// so nothing stops two people who both know it from opening the dashboard
// at once -- this adds a single-slot lock on top of that check so only one
// browser tab can hold control of the election at any given moment.
//
// The lock is identified by a random client id the frontend generates once
// per tab (not derived from the secret) and sends on every admin request.
// It is intentionally in-memory only, matching the rest of this service's
// "single Cloud Run instance" architecture (see storage/datastore.ts) --
// losing the lock on a restart is fine, since that logs every terminal out
// anyway.
//
// Handing control over (decided 2026-10-01, replacing the old one-click
// forced takeover): a second device that knows the secret can only ASK for
// control. The device in control sees the request (it checks in every few
// seconds, see GET /admin/session-status) and either allows it -- control
// moves and it is signed out -- or denies it and stays in control. An
// unanswered request expires after TAKEOVER_REQUEST_TTL_MS.
//
// The holder never loses the slot just by going quiet (a backgrounded
// browser tab throttles its timers, which must not log anyone out). But a
// holder that has been silent for HOLDER_SILENT_MS -- laptop crashed,
// closed, battery dead -- can no longer answer, so a new login is let in
// without asking. That is the escape route; without it a dead laptop would
// lock everyone out until the server restarts.

export const TAKEOVER_REQUEST_TTL_MS = 60 * 1000;
export const HOLDER_SILENT_MS = 3 * 60 * 1000;
// A requester that stops checking on its own request (tab closed) can no
// longer be handed control -- otherwise allowing it would sign the holder
// out with nobody left in charge.
const REQUESTER_GONE_MS = 15 * 1000;

interface ActiveSession {
  clientId: string;
  issuedAt: number;
  lastSeenAt: number;
  // A short device label ("Chrome / Windows · 3f2a"), captured at login --
  // lets the action log and the takeover messages name a device instead of
  // an opaque per-tab client id. Not independently verifiable; see
  // ELECTION-INTEGRITY-AND-TRUST.md item 1.
  label?: string;
}

export type TakeoverStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled';

export interface TakeoverRequest {
  id: string;
  clientId: string;
  label?: string;
  createdAt: number;
  expiresAt: number;
  status: TakeoverStatus;
  lastPolledAt: number;
}

export interface ClaimResult {
  ok: boolean;
  // Set when the claim was refused because another live device holds the slot.
  activeSince?: number;
  holderLabel?: string;
  // When the current holder will count as gone if it stays silent -- lets
  // the login screen say "if that device is switched off, try again after X".
  takeableAt?: number;
  // Set when this claim replaced a *different* holder that had gone silent
  // for HOLDER_SILENT_MS -- lets callers log it distinctly.
  tookOverFrom?: string;
}

export type RequestTakeoverResult =
  | { ok: true; request: TakeoverRequest }
  | { ok: false; reason: 'noConflict' | 'anotherPending' };

export type RespondResult =
  | { ok: true; request: TakeoverRequest; previousHolder?: string }
  | { ok: false; reason: 'notHolder' | 'notFound' | 'notPending' };

export interface RequestStatusResult {
  request: TakeoverRequest;
  // Set when this check itself handed control over because the holder had
  // logged out or gone silent while the request was waiting.
  grantedFrom?: string;
}

const newRequestId = (): string => `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class AdminSessionService {
  private session: ActiveSession | null = null;
  private request: TakeoverRequest | null = null;

  private holderIsSilent(now: number): boolean {
    return Boolean(this.session && now - this.session.lastSeenAt >= HOLDER_SILENT_MS);
  }

  private grantTo(clientId: string, label: string | undefined, now: number): string | undefined {
    const previous = this.session ? this.session.label ?? this.session.clientId : undefined;
    this.session = { clientId, issuedAt: now, lastSeenAt: now, label: label?.trim() || undefined };
    return previous;
  }

  // Called only from POST /admin/verify, after the secret itself has
  // already been checked. Grants the slot to `clientId` if it is free,
  // already this client's (a page refresh), or held by a device that has
  // gone silent for HOLDER_SILENT_MS. Otherwise refuses -- the caller must
  // then ask via requestTakeover().
  claim(clientId: string, label?: string): ClaimResult {
    const now = Date.now();
    const current = this.session;
    if (current && current.clientId !== clientId && !this.holderIsSilent(now)) {
      return {
        ok: false,
        activeSince: current.issuedAt,
        holderLabel: current.label,
        takeableAt: current.lastSeenAt + HOLDER_SILENT_MS
      };
    }
    if (current && current.clientId === clientId) {
      current.lastSeenAt = now;
      current.label = label?.trim() || current.label;
      return { ok: true };
    }
    // Only a silent holder can still be here (the live-holder case returned above).
    const tookOverFrom = this.grantTo(clientId, label, now);
    if (this.request?.status === 'pending') {
      // Whoever was being asked is no longer in control, so the question is moot.
      this.request.status = 'cancelled';
    }
    return tookOverFrom ? { ok: true, tookOverFrom } : { ok: true };
  }

  // Read by the audit log service to attribute a logged action to a human
  // label instead of just the raw client id, when one was given at login.
  getLabel(clientId: string): string | undefined {
    return this.session && this.session.clientId === clientId ? this.session.label : undefined;
  }

  getHolderLabel(): string | undefined {
    return this.session ? this.session.label ?? this.session.clientId : undefined;
  }

  // Called on every other admin-authenticated request. Confirms `clientId`
  // still holds the lock and records that it was just seen; does NOT grant
  // the lock to a new client.
  touch(clientId: string): boolean {
    const current = this.session;
    if (!current || current.clientId !== clientId) {
      return false;
    }
    current.lastSeenAt = Date.now();
    return true;
  }

  // Frees the lock immediately (Log out). A no-op if this client isn't the
  // one currently holding it.
  release(clientId: string): void {
    if (this.session && this.session.clientId === clientId) {
      this.session = null;
    }
  }

  // Marks a pending request expired once its time is up. Returns it only on
  // the call that actually expired it, so the caller can log that once.
  sweepExpired(): TakeoverRequest | undefined {
    if (this.request?.status === 'pending' && Date.now() >= this.request.expiresAt) {
      this.request.status = 'expired';
      return { ...this.request };
    }
    return undefined;
  }

  // A second device asking for control. Only one request can wait at a time.
  requestTakeover(clientId: string, label?: string): RequestTakeoverResult {
    const now = Date.now();
    this.sweepExpired();
    if (!this.session || this.session.clientId === clientId || this.holderIsSilent(now)) {
      return { ok: false, reason: 'noConflict' };
    }
    if (this.request?.status === 'pending') {
      if (this.request.clientId !== clientId) {
        return { ok: false, reason: 'anotherPending' };
      }
      this.request.lastPolledAt = now;
      return { ok: true, request: { ...this.request } };
    }
    this.request = {
      id: newRequestId(),
      clientId,
      label: label?.trim() || undefined,
      createdAt: now,
      expiresAt: now + TAKEOVER_REQUEST_TTL_MS,
      status: 'pending',
      lastPolledAt: now
    };
    return { ok: true, request: { ...this.request } };
  }

  // The asking device checking on its own request. If the holder has logged
  // out or gone silent meanwhile, control is handed over right here --
  // nobody is left to answer.
  checkRequest(clientId: string, requestId: string): RequestStatusResult | undefined {
    const request = this.request;
    if (!request || request.id !== requestId || request.clientId !== clientId) {
      return undefined;
    }
    const now = Date.now();
    request.lastPolledAt = now;
    if (request.status === 'pending' && (!this.session || this.holderIsSilent(now))) {
      const grantedFrom = this.grantTo(request.clientId, request.label, now);
      request.status = 'approved';
      return { request: { ...request }, grantedFrom: grantedFrom ?? 'nobody (logged out)' };
    }
    this.sweepExpired();
    return { request: { ...request } };
  }

  cancelRequest(clientId: string, requestId: string): boolean {
    const request = this.request;
    if (!request || request.id !== requestId || request.clientId !== clientId || request.status !== 'pending') {
      return false;
    }
    request.status = 'cancelled';
    return true;
  }

  // What the device in control needs to show: a request waiting for its answer.
  pendingRequestFor(holderClientId: string): TakeoverRequest | undefined {
    this.sweepExpired();
    if (!this.session || this.session.clientId !== holderClientId || this.request?.status !== 'pending') {
      return undefined;
    }
    return { ...this.request };
  }

  // The device in control answering. Allowing hands the slot to the
  // requester straight away; the old holder's next request is refused.
  respond(holderClientId: string, requestId: string, allow: boolean): RespondResult {
    if (!this.session || this.session.clientId !== holderClientId) {
      return { ok: false, reason: 'notHolder' };
    }
    this.sweepExpired();
    const request = this.request;
    if (!request || request.id !== requestId) {
      return { ok: false, reason: 'notFound' };
    }
    if (request.status !== 'pending') {
      return { ok: false, reason: 'notPending' };
    }
    const now = Date.now();
    if (!allow) {
      request.status = 'denied';
      return { ok: true, request: { ...request } };
    }
    if (now - request.lastPolledAt >= REQUESTER_GONE_MS) {
      // The asking device has gone away -- allowing would leave nobody in control.
      request.status = 'cancelled';
      return { ok: false, reason: 'notPending' };
    }
    const previousHolder = this.grantTo(request.clientId, request.label, now);
    request.status = 'approved';
    return { ok: true, request: { ...request }, previousHolder };
  }
}

export const adminSessionService = new AdminSessionService();
