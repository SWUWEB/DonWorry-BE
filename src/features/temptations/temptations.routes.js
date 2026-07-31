import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createWishlistDecisionController } from './temptations.controller.js';
import { createWishlistDecisionDto } from './temptations.dto.js';

export const temptationsRouter = Router();

temptationsRouter.use(requireAuth);

// 재판단 기록 추가 API만 유지 (조회 GET API 제거)
temptationsRouter.post(
  '/:temptationId/decisions', 
  validate(createWishlistDecisionDto), 
  createWishlistDecisionController
);