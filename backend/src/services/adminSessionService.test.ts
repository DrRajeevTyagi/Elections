import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminSessionService, HOLDER_SILENT_MS, TAKEOVER_REQUEST_TTL_MS } from './adminSessionService.js';

describe('AdminSessionService', () => {
  let service: AdminSessionService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new AdminSessionService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lets the first client claim the empty slot', () => {
    expect(service.claim('terminal-a')).toEqual({ ok: true });
    expect(service.touch('terminal-a')).toBe(true);
  });

  it('refuses a second client while the first is live, naming the holder', () => {
    service.claim('terminal-a', 'Chrome / Windows');
    const result = service.claim('terminal-b');
    expect(result).toEqual({
      ok: false,
      activeSince: expect.any(Number),
      holderLabel: 'Chrome / Windows',
      takeableAt: expect.any(Number)
    });
    expect(service.touch('terminal-a')).toBe(true);
    expect(service.touch('terminal-b')).toBe(false);
  });

  it('getLabel returns the current holder\'s label, and undefined for anyone else', () => {
    service.claim('terminal-a', 'Rajeev -- laptop');
    expect(service.getLabel('terminal-a')).toBe('Rajeev -- laptop');
    expect(service.getLabel('terminal-b')).toBeUndefined();
  });

  it('lets the same client re-claim (e.g. a page refresh) without conflict', () => {
    service.claim('terminal-a');
    expect(service.claim('terminal-a')).toEqual({ ok: true });
    expect(service.touch('terminal-a')).toBe(true);
  });

  it('never takes the slot away from a quiet holder by itself', () => {
    service.claim('terminal-a');
    // A quiet tab, a backgrounded browser throttling its timers, an admin
    // who steps away -- none of these must silently free the slot.
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(service.touch('terminal-a')).toBe(true);
  });

  it('lets a new login in without asking once the holder has been silent for 3 minutes', () => {
    service.claim('terminal-a', 'Old laptop');
    vi.advanceTimersByTime(HOLDER_SILENT_MS - 1000);
    expect(service.claim('terminal-b').ok).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(service.claim('terminal-b')).toEqual({ ok: true, tookOverFrom: 'Old laptop' });
    expect(service.touch('terminal-a')).toBe(false);
  });

  it('counts any check-in as the holder being alive', () => {
    service.claim('terminal-a');
    vi.advanceTimersByTime(HOLDER_SILENT_MS - 1000);
    service.touch('terminal-a');
    vi.advanceTimersByTime(HOLDER_SILENT_MS - 1000);
    expect(service.claim('terminal-b').ok).toBe(false);
  });

  it('release() frees the slot immediately for the holder only', () => {
    service.claim('terminal-a');
    service.release('terminal-b');
    expect(service.touch('terminal-a')).toBe(true);
    service.release('terminal-a');
    expect(service.claim('terminal-b')).toEqual({ ok: true });
  });

  describe('asking for control', () => {
    const ask = () => {
      service.claim('terminal-a', 'Holder');
      const result = service.requestTakeover('terminal-b', 'Asker');
      if (!result.ok) {
        throw new Error('expected request to be created');
      }
      return result.request;
    };

    it('shows the request to the holder only', () => {
      const request = ask();
      expect(service.pendingRequestFor('terminal-a')).toMatchObject({ id: request.id, label: 'Asker', status: 'pending' });
      expect(service.pendingRequestFor('terminal-b')).toBeUndefined();
    });

    it('Allow hands control to the asking device and signs the holder out', () => {
      const request = ask();
      const result = service.respond('terminal-a', request.id, true);
      expect(result).toMatchObject({ ok: true, previousHolder: 'Holder', request: { status: 'approved' } });
      expect(service.touch('terminal-a')).toBe(false);
      expect(service.touch('terminal-b')).toBe(true);
      expect(service.checkRequest('terminal-b', request.id)?.request.status).toBe('approved');
    });

    it('Deny keeps the holder in control', () => {
      const request = ask();
      expect(service.respond('terminal-a', request.id, false)).toMatchObject({ ok: true, request: { status: 'denied' } });
      expect(service.touch('terminal-a')).toBe(true);
      expect(service.touch('terminal-b')).toBe(false);
      expect(service.checkRequest('terminal-b', request.id)?.request.status).toBe('denied');
    });

    it('only the holder can answer', () => {
      const request = ask();
      expect(service.respond('terminal-b', request.id, true)).toEqual({ ok: false, reason: 'notHolder' });
    });

    it('expires an unanswered request after a minute, and it can no longer be allowed', () => {
      const request = ask();
      vi.advanceTimersByTime(TAKEOVER_REQUEST_TTL_MS);
      service.touch('terminal-a');
      expect(service.sweepExpired()).toMatchObject({ id: request.id, status: 'expired' });
      expect(service.sweepExpired()).toBeUndefined();
      expect(service.respond('terminal-a', request.id, true)).toEqual({ ok: false, reason: 'notPending' });
      expect(service.touch('terminal-a')).toBe(true);
    });

    it('allows only one waiting request at a time', () => {
      ask();
      expect(service.requestTakeover('terminal-c')).toEqual({ ok: false, reason: 'anotherPending' });
      // Asking again from the same device just returns the same request.
      expect(service.requestTakeover('terminal-b')).toMatchObject({ ok: true });
    });

    it('says no request is needed when nobody else is in control', () => {
      expect(service.requestTakeover('terminal-b')).toEqual({ ok: false, reason: 'noConflict' });
      service.claim('terminal-b');
      expect(service.requestTakeover('terminal-b')).toEqual({ ok: false, reason: 'noConflict' });
    });

    it('hands control over if the holder logs out while the request waits', () => {
      const request = ask();
      service.release('terminal-a');
      expect(service.checkRequest('terminal-b', request.id)).toMatchObject({ request: { status: 'approved' } });
      expect(service.touch('terminal-b')).toBe(true);
    });

    it('will not hand control to an asking device that has gone away', () => {
      const request = ask();
      vi.advanceTimersByTime(20 * 1000);
      service.touch('terminal-a');
      expect(service.respond('terminal-a', request.id, true)).toEqual({ ok: false, reason: 'notPending' });
      expect(service.touch('terminal-a')).toBe(true);
    });

    it('a cancelled request can no longer be allowed', () => {
      const request = ask();
      expect(service.cancelRequest('terminal-b', request.id)).toBe(true);
      expect(service.pendingRequestFor('terminal-a')).toBeUndefined();
      expect(service.respond('terminal-a', request.id, true)).toEqual({ ok: false, reason: 'notPending' });
    });

    it('only the asking device can read or cancel its request', () => {
      const request = ask();
      expect(service.checkRequest('terminal-c', request.id)).toBeUndefined();
      expect(service.cancelRequest('terminal-c', request.id)).toBe(false);
    });
  });
});
