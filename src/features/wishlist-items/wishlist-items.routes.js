import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js'; // 🔓 주석 해제 (인증 활성화)
import { validate } from '../../middlewares/validate.js';
import * as wishlistItemsController from './wishlist-items.controller.js';
import {
  createWishlistItemDto,
  updateWishlistItemDto,
  wishlistItemIdDto,
} from './wishlist-items.dto.js';

export const wishlistItemsRouter = Router();

// 모든 위시리스트 API에 로그인 인증 미들웨어 적용 완료!
wishlistItemsRouter.use(requireAuth);

wishlistItemsRouter.get('/', wishlistItemsController.getItems);
wishlistItemsRouter.post('/', validate(createWishlistItemDto), wishlistItemsController.createItem);
wishlistItemsRouter.get(
  '/:wishlistId',
  validate(wishlistItemIdDto),
  wishlistItemsController.getItemById,
);
wishlistItemsRouter.patch(
  '/:wishlistId',
  validate(updateWishlistItemDto),
  wishlistItemsController.updateItem,
);
wishlistItemsRouter.delete(
  '/:wishlistId',
  validate(wishlistItemIdDto),
  wishlistItemsController.deleteItem,
);
