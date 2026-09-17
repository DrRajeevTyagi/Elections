import rateLimit from 'express-rate-limit';

// Both limiters only count requests that FAIL (status >= 400) --
// skipSuccessfulRequests means a correct admin secret or officer code never
// counts against the limit, so legitimate use (including many different
// polling booths sharing one school WiFi's public IP) can never trip it.
// Only a run of wrong guesses from the same IP does.

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
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many incorrect codes entered from this network. Please wait a few minutes and try again, or check the code with the election administrator.'
    });
  }
});
