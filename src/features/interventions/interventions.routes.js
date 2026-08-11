import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  calculateRiskController,
  listInterventionQuestionsController,
} from './interventions.controller.js';
import { calculateRiskScoreDto, listInterventionQuestionsDto } from './interventions.dto.js';

export const interventionsRouter = Router();
export const interventionQuestionsRouter = Router();

interventionsRouter.use(requireAuth);
interventionsRouter.post('/risk-score', validate(calculateRiskScoreDto), calculateRiskController);

interventionQuestionsRouter.use(requireAuth);
interventionQuestionsRouter.get(
  '/',
  validate(listInterventionQuestionsDto),
  listInterventionQuestionsController,
);
