import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  changePasswordController,
  requestEmailChangeVerificationController,
  changeEmailController,
  getMeController,
  updateMeController,
  getSavingGoalController,
  updateSavingGoalController,
  deleteSavingGoalController,
  deleteUserController,
  getNotificationSettingsController,
  updateNotificationSettingsController,
  getBudgetController,
  setBudgetController,
} from './users.controller.js';
import {
  changePasswordDto,
  requestEmailChangeVerificationDto,
  changeEmailDto,
  notificationSettingsDto,
  savingGoalDto,
  updateMeDto,
  deleteUserDto,
  getBudgetDto,
  setBudgetDto,
} from './users.dto.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.get('/me', getMeController);
usersRouter.patch('/me', validate(updateMeDto), updateMeController);
usersRouter.delete('/me', validate(deleteUserDto), deleteUserController);
usersRouter.patch('/me/password', validate(changePasswordDto), changePasswordController);
usersRouter.post(
  '/me/email-verifications',
  validate(requestEmailChangeVerificationDto),
  requestEmailChangeVerificationController,
);
usersRouter.patch('/me/email', validate(changeEmailDto), changeEmailController);
usersRouter.get('/me/saving-goal', getSavingGoalController);
usersRouter.put('/me/saving-goal', validate(savingGoalDto), updateSavingGoalController);
usersRouter.delete('/me/saving-goal', deleteSavingGoalController);
usersRouter.get('/me/notification-settings', getNotificationSettingsController);
usersRouter.patch(
  '/me/notification-settings',
  validate(notificationSettingsDto),
  updateNotificationSettingsController,
);
usersRouter.get('/me/budget', validate(getBudgetDto), getBudgetController);
usersRouter.put('/me/budget', validate(setBudgetDto), setBudgetController);
