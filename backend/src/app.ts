import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  app.use('/api', apiRouter);

  app.use(errorHandler);

  return app;
};
