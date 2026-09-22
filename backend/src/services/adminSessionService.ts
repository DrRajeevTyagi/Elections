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

interface ActiveSession {
  clientId: string;
  issuedAt: number;
  lastSeenAt: number;
}

// Every admin-authenticated request re-confirms the lock (see
// checkSessionHolder in middleware/adminAuth.ts), and the dashboard already
// polls an admin route (storage-health) every 10 seconds while open, so a
// live tab's lock is refreshed constantly. This only needs to be generous
// enough to survive a missed beat or two of network hiccup before treating
// a silently closed/crashed tab as gone.
const IDLE_TIMEOUT_MS = 60 * 1000;

export interface ClaimResult {
  ok: boolean;
  activeSince?: number;
}

export class AdminSessionService {
  private session: ActiveSession | null = null;

  private isLive(session: ActiveSession): boolean {
    return Date.now() - session.lastSeenAt <= IDLE_TIMEOUT_MS;
  }

  // Called only from POST /admin/verify, after the secret itself has
  // already been checked. Grants the lock to `clientId` unless another
  // client currently holds a live lock and `force` was not set.
  claim(clientId: string, force: boolean): ClaimResult {
    const current = this.session;
    if (current && current.clientId !== clientId && this.isLive(current) && !force) {
      return { ok: false, activeSince: current.issuedAt };
    }
    const keepIssuedAt = current && current.clientId === clientId ? current.issuedAt : Date.now();
    this.session = { clientId, issuedAt: keepIssuedAt, lastSeenAt: Date.now() };
    return { ok: true };
  }

  // Called on every other admin-authenticated request. Confirms `clientId`
  // still holds a live lock and refreshes its heartbeat; does NOT grant the
  // lock to a new client -- only claim() (i.e. logging in) can do that.
  touch(clientId: string): boolean {
    const current = this.session;
    if (!current || current.clientId !== clientId || !this.isLive(current)) {
      return false;
    }
    current.lastSeenAt = Date.now();
    return true;
  }

  // Frees the lock immediately (rather than waiting out the idle timeout)
  // so the same terminal can hand off to another right away. A no-op if
  // this client isn't the one currently holding it.
  release(clientId: string): void {
    if (this.session && this.session.clientId === clientId) {
      this.session = null;
    }
  }
}

export const adminSessionService = new AdminSessionService();
