import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  createNotImplementedController,
  getConsumptionReportDetailController,
} from './reports.controller.js';
import { consumptionReportDetailDto } from './reports.dto.js';

export const reportsRouter = Router();
const todo = createNotImplementedController('reports');

reportsRouter.use(requireAuth);
reportsRouter.get('/consumption/summary', todo);
reportsRouter.get(
  '/consumption/detail',
  validate(consumptionReportDetailDto),
  getConsumptionReportDetailController,
);
