import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminSessionService } from './adminSessionService.js';

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
    expect(service.claim('terminal-a', false)).toEqual({ ok: true });
    expect(service.touch('terminal-a')).toBe(true);
  });

  it('refuses a second client without force while the first is live', () => {
    service.claim('terminal-a', false);
    const result = service.claim('terminal-b', false);
    expect(result.ok).toBe(false);
    expect(result.activeSince).toBeTypeOf('number');
    // The second client never got the slot -- the first still holds it.
    expect(service.touch('terminal-a')).toBe(true);
    expect(service.touch('terminal-b')).toBe(false);
  });

  it('lets a second client force a takeover, evicting the first', () => {
    service.claim('terminal-a', false);
    expect(service.claim('terminal-b', true)).toEqual({ ok: true });
    expect(service.touch('terminal-a')).toBe(false);
    expect(service.touch('terminal-b')).toBe(true);
  });

  it('lets the same client re-claim (e.g. a page refresh) without conflict', () => {
    service.claim('terminal-a', false);
    expect(service.claim('terminal-a', false)).toEqual({ ok: true });
    expect(service.touch('terminal-a')).toBe(true);
  });

  it('never expires the holder no matter how long it goes quiet', () => {
    service.claim('terminal-a', false);
    // Deliberately no idle timeout -- a quiet tab, a backgrounded browser
    // throttling its timers, an admin who steps away for hours, etc. must
    // never silently free the slot. A day of silence changes nothing.
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(service.touch('terminal-a')).toBe(true);
    // ...and a second client still can't claim it without force.
    expect(service.claim('terminal-b', false)).toEqual({ ok: false, activeSince: expect.any(Number) });
  });

  it('release() frees the slot immediately for the holder', () => {
    service.claim('terminal-a', false);
    service.release('terminal-a');
    expect(service.claim('terminal-b', false)).toEqual({ ok: true });
  });

  it('release() is a no-op for a client that does not hold the slot', () => {
    service.claim('terminal-a', false);
    service.release('terminal-b');
    expect(service.touch('terminal-a')).toBe(true);
  });
});
