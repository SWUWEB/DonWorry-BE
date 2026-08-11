import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { API_PREFIX } from './config/constants.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { apiRouter } from './routes/index.js';
import { swaggerRouter } from './swagger/swagger.routes.js';

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  app.get('/health', (_req, res) => {
    res.json({ success: true, message: 'DonWorry API is healthy' });
  });

  app.use(swaggerRouter);
  app.use(API_PREFIX, apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
