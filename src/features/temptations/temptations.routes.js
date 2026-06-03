import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createNotImplementedController } from './temptations.controller.js';
import { createWishlistDecisionDto, temptationIdDto } from './temptations.dto.js';

export const temptationsRouter = Router();
const todo = createNotImplementedController('temptations');

temptationsRouter.use(requireAuth);
temptationsRouter.get('/:temptationId/decisions', validate(temptationIdDto), todo);
temptationsRouter.post('/:temptationId/decisions', validate(createWishlistDecisionDto), todo);
