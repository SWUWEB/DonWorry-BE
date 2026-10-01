import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { getConsumptionReportDetailController } from './reports.controller.js';
import { consumptionReportDetailDto } from './reports.dto.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);
reportsRouter.get(
  '/consumption/detail',
  validate(consumptionReportDetailDto),
  getConsumptionReportDetailController,
);
