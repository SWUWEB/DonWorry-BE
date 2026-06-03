import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createNotImplementedController } from './consumption-records.controller.js';
import {
  consumptionRecordIdDto,
  createConsumptionRecordDto,
  updateConsumptionRecordDto,
} from './consumption-records.dto.js';

export const consumptionRecordsRouter = Router();
const todo = createNotImplementedController('consumption records');

consumptionRecordsRouter.use(requireAuth);
consumptionRecordsRouter.get('/', todo);
consumptionRecordsRouter.post('/', validate(createConsumptionRecordDto), todo);
consumptionRecordsRouter.get('/:consumptionRecordId', validate(consumptionRecordIdDto), todo);
consumptionRecordsRouter.patch('/:consumptionRecordId', validate(updateConsumptionRecordDto), todo);
consumptionRecordsRouter.delete('/:consumptionRecordId', validate(consumptionRecordIdDto), todo);
