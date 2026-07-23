import { z } from 'zod';
import { CATEGORY_CODE_SET } from '../../config/categories.js';

const waitType = z.enum(['1H', '1D', '3D', '1W']);

export const wishlistItemIdDto = z.object({
  params: z.object({ wishlistId: z.coerce.bigint().positive() }),
});

export const createWishlistItemDto = z.object({
  body: z.object({
    categoryCode: z.string().refine((val) => CATEGORY_CODE_SET.has(val), {
      message: '유효한 카테고리 코드가 아닙니다.',
    }),
    productName: z.string().min(1).max(255),
    productUrl: z.string().url().optional(),
    price: z.coerce.bigint().positive().optional(),
    productImageUrl: z.string().url().max(500).optional(),
    reason: z.string().max(255).optional(),
    waitType: waitType.default('1H'),
  }),
});

export const updateWishlistItemDto = wishlistItemIdDto.extend({
  body: createWishlistItemDto.shape.body.partial(),
});
