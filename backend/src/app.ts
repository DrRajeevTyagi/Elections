import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import path from 'path';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';
import { env } from './config/env.js';

export const createApp = () => {
  const app = express();

  app.use(cors());
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
