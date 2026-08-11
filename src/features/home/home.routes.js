import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import {
  createNotImplementedController,
  getHomeSummaryController,
  getDailyQuestionController,
} from './home.controller.js';

export const homeRouter = Router();
const todo = createNotImplementedController('home');

homeRouter.use(requireAuth);
homeRouter.get('/summary', getHomeSummaryController);
homeRouter.get('/cheer-message', todo);
homeRouter.get('/daily-question', getDailyQuestionController);
