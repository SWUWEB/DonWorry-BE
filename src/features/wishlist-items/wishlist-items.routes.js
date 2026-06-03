import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createNotImplementedController } from './wishlist-items.controller.js';
import {
  createWishlistItemDto,
  updateWishlistItemDto,
  wishlistItemIdDto,
} from './wishlist-items.dto.js';

export const wishlistItemsRouter = Router();
const todo = createNotImplementedController('wishlist items');

wishlistItemsRouter.use(requireAuth);
wishlistItemsRouter.get('/', todo);
wishlistItemsRouter.post('/', validate(createWishlistItemDto), todo);
wishlistItemsRouter.get('/:wishlistId', validate(wishlistItemIdDto), todo);
wishlistItemsRouter.patch('/:wishlistId', validate(updateWishlistItemDto), todo);
wishlistItemsRouter.delete('/:wishlistId', validate(wishlistItemIdDto), todo);
