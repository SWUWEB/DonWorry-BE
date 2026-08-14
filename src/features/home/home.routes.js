import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import {
  getHomeSummaryController,
  getDailyQuestionController,
  getCheerMessageController,
} from './home.controller.js';

export const homeRouter = Router();

homeRouter.use(requireAuth);
homeRouter.get('/summary', getHomeSummaryController);
homeRouter.get('/cheer-message', getCheerMessageController);
homeRouter.get('/daily-question', getDailyQuestionController);
