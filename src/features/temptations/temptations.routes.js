import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createWishlistDecisionController } from './temptations.controller.js';
import { createWishlistDecisionDto } from './temptations.dto.js';

export const temptationsRouter = Router();

temptationsRouter.use(requireAuth);

temptationsRouter.post(
  '/:temptationId/decisions',
  validate(createWishlistDecisionDto),
  createWishlistDecisionController,
);
