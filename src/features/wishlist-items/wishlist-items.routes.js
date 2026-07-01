import { Router } from 'express';
// import { requireAuth } from '../../middlewares/auth.js'; // 💡 우선 주석 처리 (비인증 개발)
import { validate } from '../../middlewares/validate.js';
import * as wishlistItemsController from './wishlist-items.controller.js'; // 💡 변경
import {
  createWishlistItemDto,
  updateWishlistItemDto,
  wishlistItemIdDto,
} from './wishlist-items.dto.js';

export const wishlistItemsRouter = Router();

// wishlistItemsRouter.use(requireAuth); // 💡 우선 주석 처리

// 💡 todo 대신 실제 컨트롤러 메서드 매핑
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
