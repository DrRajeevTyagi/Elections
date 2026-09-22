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
// Deliberately has NO idle/inactivity timeout: once a client holds the
// slot, it holds it indefinitely -- through however long the poll stays
// open, a quiet dashboard tab, a backgrounded browser tab (where the
// browser itself throttles JS timers, which used to make a perfectly
// live tab look "idle" and get logged out), whatever. The ONLY way to lose
// the slot is another client logging in (an explicit takeover, see claim())
// or this client explicitly logging out (see release()).

interface ActiveSession {
  clientId: string;
  issuedAt: number;
  lastSeenAt: number;
  // A short human-entered label ("Rajeev -- laptop"), captured at
  // login/takeover time -- a minimal, pulled-forward slice of
  // ELECTION-INTEGRITY-AND-TRUST.md item 1, added specifically so the
  // Phase 3 action log (item 5) can say a real name instead of just an
  // opaque per-tab client id. Not independently verifiable (anyone can type
  // any label) -- combined with the immutable log, a false label is
  // evidence, not a lock by itself, same reasoning as item 3's officer name.
  label?: string;
}

export interface ClaimResult {
  ok: boolean;
  activeSince?: number;
  // True when this claim evicted a *different* client that already held the
  // slot -- lets callers (see routes/admin.ts) log a takeover distinctly
  // from an ordinary first login.
  tookOverFrom?: string;
}

export class AdminSessionService {
  private session: ActiveSession | null = null;

  // Called only from POST /admin/verify, after the secret itself has
  // already been checked. Grants the lock to `clientId` unless another
  // client currently holds it and `force` was not set -- holding the lock
  // never expires on its own, so this is the only path by which a client
  // can lose it against its will.
  claim(clientId: string, force: boolean, label?: string): ClaimResult {
    const current = this.session;
    if (current && current.clientId !== clientId && !force) {
      return { ok: false, activeSince: current.issuedAt };
    }
    const keepIssuedAt = current && current.clientId === clientId ? current.issuedAt : Date.now();
    const tookOverFrom = current && current.clientId !== clientId ? current.label ?? current.clientId : undefined;
    this.session = { clientId, issuedAt: keepIssuedAt, lastSeenAt: Date.now(), label: label?.trim() || undefined };
    return { ok: true, tookOverFrom };
  }

  // Read by the audit log service to attribute a logged action to a human
  // label instead of just the raw client id, when one was given at login.
  getLabel(clientId: string): string | undefined {
    return this.session && this.session.clientId === clientId ? this.session.label : undefined;
  }

  // Called on every other admin-authenticated request. Confirms `clientId`
  // still holds the lock; does NOT grant the lock to a new client -- only
  // claim() (i.e. logging in) can do that. No idle timeout: a client that
  // holds the lock keeps passing this check no matter how long since its
  // last request.
  touch(clientId: string): boolean {
    const current = this.session;
    if (!current || current.clientId !== clientId) {
      return false;
    }
    current.lastSeenAt = Date.now();
    return true;
  }

  // Frees the lock immediately -- since there's no idle timeout, this is
  // the only voluntary way to release it, letting the same terminal (or
  // another) log back in without needing a forced takeover. A no-op if
  // this client isn't the one currently holding it.
  release(clientId: string): void {
    if (this.session && this.session.clientId === clientId) {
      this.session = null;
    }
  }
}

export const adminSessionService = new AdminSessionService();
