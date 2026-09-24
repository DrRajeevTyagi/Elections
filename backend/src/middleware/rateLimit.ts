import rateLimit, { MemoryStore, ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

// Both limiters only count requests that FAIL (status >= 400) --
// skipSuccessfulRequests means a correct admin secret or officer code never
// counts against the limit, so legitimate use (including many different
// polling booths sharing one school WiFi's public IP) can never trip it.
// Only a run of wrong guesses from the same IP does.

const DEVICE_ID_HEADER = 'x-kiosk-device-id';
// Matches the crypto.randomUUID() the frontend generates (see
// services/api.ts) but is tolerant of length -- anything that doesn't look
// like a real id just falls back to the old IP-based key below.
const isPlausibleDeviceId = (value: string): boolean => /^[a-zA-Z0-9-]{8,64}$/.test(value);

// Keys the kiosk limiter by browser/device instead of network address. Real
// trial (2026-09-24) found many teachers on one shared network -- school
// WiFi at one branch, carrier mobile data (which routinely funnels many
// phones through very few public addresses) at another -- so a handful of
// mistyped codes tripped the OLD ip-only limiter for everyone on that
// network at once, not just the people who mistyped. Falls back to IP only
// when the device-id header is missing/malformed (e.g. a non-browser
// client) -- still safe to do, since kioskGuessLimiter's own 6-character
// code space is too large to brute force regardless of rate limiting.
const kioskKeyGenerator = (req: Request): string => {
  const deviceId = req.header(DEVICE_ID_HEADER);
  if (deviceId && isPlausibleDeviceId(deviceId)) {
    return deviceId;
  }
  return ipKeyGenerator(req.ip ?? '');
};

// A separate store instance (rather than the default one rateLimit() would
// create internally) so an admin can instantly clear every current lockout
// -- see routes/admin.ts's POST /admin/rate-limit/reset -- instead of
// everyone waiting out the 10-minute window during a live election.
export const kioskLimiterStore = new MemoryStore();

// Guards every x-admin-secret check. The admin secret is the single most
// valuable target in this app (full control: reset votes, close polls,
// delete candidates), so this is the tightest limiter.
export const adminGuessLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many incorrect admin secret attempts from this network. Please wait a few minutes and try again.'
    });
  }
});

// Guards officer-code entry points (kiosk activation, booth close). The
// 6-character code space is far too large to brute force regardless, but
// this keeps a scripted guesser (or a runaway retry loop) from hammering
// the endpoint. Limit is generous since many voters at many booths can
// share one IP over the course of a real polling day.
export const kioskGuessLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: kioskLimiterStore,
  keyGenerator: kioskKeyGenerator,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many incorrect codes entered from this device. Please wait a few minutes and try again, or ask the election administrator to clear lockouts.'
    });
  }
});
