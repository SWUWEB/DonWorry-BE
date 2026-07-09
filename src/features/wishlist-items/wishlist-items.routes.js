import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as wishlistItemsController from './wishlist-items.controller.js';
import {
  createWishlistItemDto,
  updateWishlistItemDto,
  wishlistItemIdDto,
} from './wishlist-items.dto.js';

export const wishlistItemsRouter = Router();

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
