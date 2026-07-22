import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  createNotImplementedController,
  getMeController,
  updateMeController,
  updateSavingGoalController,
  deleteSavingGoalController,
} from './users.controller.js';
import {
  changePasswordDto,
  notificationSettingsDto,
  savingGoalDto,
  updateMeDto,
} from './users.dto.js';

export const usersRouter = Router();
const todo = createNotImplementedController('users');

usersRouter.use(requireAuth);
usersRouter.get('/me', getMeController);
usersRouter.patch('/me', validate(updateMeDto), updateMeController);
usersRouter.delete('/me', todo);
usersRouter.patch('/me/password', validate(changePasswordDto), todo);
usersRouter.put('/me/saving-goal', validate(savingGoalDto), updateSavingGoalController);
usersRouter.delete('/me/saving-goal', deleteSavingGoalController);
usersRouter.patch('/me/notification-settings', validate(notificationSettingsDto), todo);
