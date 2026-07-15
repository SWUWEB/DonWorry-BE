import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  createConsumptionRecordController,
  deleteConsumptionRecordController,
  getConsumptionRecordController,
  listConsumptionRecordsController,
  updateConsumptionRecordController,
} from './consumption-records.controller.js';
import {
  consumptionRecordIdDto,
  createConsumptionRecordDto,
  listConsumptionRecordsDto,
  updateConsumptionRecordDto,
  validateConsumptionRecord,
} from './consumption-records.dto.js';

export const consumptionRecordsRouter = Router();

consumptionRecordsRouter.use(requireAuth);
consumptionRecordsRouter.get(
  '/',
  validate(listConsumptionRecordsDto),
  listConsumptionRecordsController,
);
consumptionRecordsRouter.post(
  '/',
  validateConsumptionRecord(createConsumptionRecordDto),
  createConsumptionRecordController,
);
consumptionRecordsRouter.get(
  '/:consumptionRecordId',
  validate(consumptionRecordIdDto),
  getConsumptionRecordController,
);
consumptionRecordsRouter.put(
  '/:consumptionRecordId',
  validateConsumptionRecord(updateConsumptionRecordDto),
  updateConsumptionRecordController,
);
consumptionRecordsRouter.delete(
  '/:consumptionRecordId',
  validate(consumptionRecordIdDto),
  deleteConsumptionRecordController,
);
