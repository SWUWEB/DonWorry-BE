import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { createNotImplementedController } from './reports.controller.js';

export const reportsRouter = Router();
const todo = createNotImplementedController('reports');

reportsRouter.use(requireAuth);
reportsRouter.get('/consumption/summary', todo);
reportsRouter.get('/consumption/detail', todo);
