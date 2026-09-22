import { randomUUID } from 'crypto';
import { ForbiddenError, UnauthorizedError } from '../utils/httpError.js';
import { HouseId } from '../types/election.js';

export interface KioskSession {
  token: string;
  activatedAt: number;
  consumedAt?: number;
  house?: HouseId; // Required for house elections
  officerCode?: string; // Which polling officer's code activated this session
}

export const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class KioskService {
  private sessions = new Map<string, KioskSession>();

  createSession(officerCode?: string, house?: HouseId): KioskSession {
    const token = randomUUID();
    const session: KioskSession = {
      token,
      activatedAt: Date.now(),
      house,
      officerCode
    };
    this.sessions.set(token, session);
    return session;
  }

  // Validates a token without consuming it, so a request that fails
  // validation *after* this check (bad payload, a candidate removed
  // mid-vote, etc.) never burns the voter's one-time code. Call
  // markConsumed() only once the vote is actually about to be recorded.
  getActiveSession(token: string): KioskSession {
    const session = this.sessions.get(token);
    if (!session) {
      throw new UnauthorizedError('Invalid kiosk session token');
    }

    if (session.activatedAt + SESSION_TTL_MS < Date.now()) {
      this.sessions.delete(token);
      throw new ForbiddenError('Kiosk session expired');
    }

    if (session.consumedAt) {
      // Deliberately not deleted on consumption (see markConsumed) so a
      // retry after a dropped response -- the vote was recorded, but the
      // confirmation never reached the browser -- gets this specific,
      // reassuring message instead of a generic "invalid token" error.
      throw new ForbiddenError(
        'This ballot has already been submitted. If the officer already saw a confirmation or vote count for this voter, do not vote again -- ask the election administrator if unsure.'
      );
    }

    return session;
  }

  // Marks the token used. Only call this once the vote has passed
  // validation and is about to be persisted -- see getActiveSession above.
  markConsumed(token: string): KioskSession {
    const session = this.sessions.get(token);
    if (!session) {
      throw new UnauthorizedError('Invalid kiosk session token');
    }
    session.consumedAt = Date.now();
    return session;
  }

  revokeSession(token: string): void {
    this.sessions.delete(token);
  }

  clearSessions(): void {
    this.sessions.clear();
  }
}

export const kioskService = new KioskService();
