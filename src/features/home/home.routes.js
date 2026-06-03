import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { createNotImplementedController } from './home.controller.js';

export const homeRouter = Router();
const todo = createNotImplementedController('home');

homeRouter.use(requireAuth);
homeRouter.get('/summary', todo);
homeRouter.get('/cheer-message', todo);
homeRouter.get('/daily-question', todo);
