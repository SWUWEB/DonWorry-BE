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

export const getWishlistItemsQueryDto = z.object({
  query: z.object({
    query: z.string().optional(),
    categoryCode: z
      .string()
      .optional()
      .refine((val) => val === undefined || CATEGORY_CODE_SET.has(val), {
        message: '유효한 카테고리 코드가 아닙니다.',
      }),
    sort: z.enum(['CREATED_DESC', 'NAME_ASC', 'DEADLINE_ASC']).default('CREATED_DESC'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().default(10),
  }),
});

export const updateWishlistItemDto = wishlistItemIdDto.extend({
  body: z.object({
    categoryCode: z
      .string()
      .optional()
      .refine((val) => val === undefined || CATEGORY_CODE_SET.has(val), {
        message: '유효한 카테고리 코드가 아닙니다.',
      }),
    productName: z.string().min(1).max(255).optional(),
    productUrl: z.string().url().optional(),
    price: z.coerce.bigint().positive().optional(),
    productImageUrl: z.string().url().max(500).optional(),
    reason: z.string().max(255).optional(),
    waitType: waitType.optional(),
  }),
});
