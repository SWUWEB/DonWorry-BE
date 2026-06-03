import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createNotImplementedController } from './interventions.controller.js';
import { calculateRiskScoreDto } from './interventions.dto.js';

export const interventionsRouter = Router();
const todo = createNotImplementedController('interventions');

interventionsRouter.use(requireAuth);
interventionsRouter.get('/', todo);
interventionsRouter.post('/risk-score', validate(calculateRiskScoreDto), todo);
