import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createNotImplementedController } from './notifications.controller.js';
import { notificationIdDto } from './notifications.dto.js';

export const notificationsRouter = Router();
const todo = createNotImplementedController('notifications');

notificationsRouter.use(requireAuth);
notificationsRouter.get('/', todo);
notificationsRouter.patch('/read-all', todo);
notificationsRouter.patch('/:notificationId/read', validate(notificationIdDto), todo);
