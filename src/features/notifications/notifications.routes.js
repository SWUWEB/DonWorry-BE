import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  listNotificationsController,
  markNotificationReadController,
  markAllNotificationsReadController,
} from './notifications.controller.js';
import { notificationIdDto, listNotificationsDto } from './notifications.dto.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get('/', validate(listNotificationsDto), listNotificationsController);
notificationsRouter.patch('/read-all', markAllNotificationsReadController);
notificationsRouter.patch(
  '/:notificationId/read',
  validate(notificationIdDto),
  markNotificationReadController,
);
