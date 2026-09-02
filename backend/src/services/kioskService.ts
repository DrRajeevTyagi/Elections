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

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

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

  consumeSession(token: string): KioskSession {
    const session = this.sessions.get(token);
    if (!session) {
      throw new UnauthorizedError('Invalid kiosk session token');
    }

    if (session.consumedAt) {
      throw new ForbiddenError('Kiosk session already used');
    }

    if (session.activatedAt + SESSION_TTL_MS < Date.now()) {
      this.sessions.delete(token);
      throw new ForbiddenError('Kiosk session expired');
    }

    session.consumedAt = Date.now();
    this.sessions.delete(token);
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
