import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';
import { env } from './config/env.js';

export const createApp = () => {
  const app = express();

  // Cloud Run sits in front of this server and forwards the real client IP
  // via X-Forwarded-For. Without this, every request looks like it comes
  // from Cloud Run's own proxy, which would collapse the whole school onto
  // one bucket for the rate limiters below.
  app.set('trust proxy', 1);

  // CSP is left off: the UI relies heavily on inline `style={{...}}` (React
  // style props), which a default CSP would block. The other headers
  // (frameguard, X-Content-Type-Options, HSTS, etc.) still apply.
  app.use(helmet({ contentSecurityPolicy: false }));
  // No CORS needed -- the frontend is served from this same Express server
  // (or same-origin via the Vite dev proxy), and every sensitive route
  // already requires a secret header rather than relying on cookies.
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  app.use('/api', apiRouter);

  if (env.staticDir) {
    app.use(express.static(env.staticDir));
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(env.staticDir!, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
};
