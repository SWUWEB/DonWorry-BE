import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './openapi.js';

export const swaggerRouter = Router();

swaggerRouter.get('/api-docs.json', (_req, res) => {
  res.json(openApiDocument);
});

swaggerRouter.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    explorer: true,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
    customSiteTitle: 'DonWorry API Docs',
  }),
);
