import { z } from 'zod';

export const temptationIdDto = z.object({
  params: z.object({ temptationId: z.coerce.bigint().positive() }),
});

export const createWishlistDecisionDto = temptationIdDto.extend({
  body: z.object({
    decisionType: z.enum(['BUY', 'SKIP', 'DELAY']),
    reasonAlternative: z.boolean().optional(),
    reasonNeed: z.boolean().optional(),
    reasonRecentBuy: z.boolean().optional(),
    reasonType: z
      .enum([
        'NECESSARY',
        'HAS_ALTERNATIVE',
        'LOW_NECESSITY',
        'RECENT_SIMILAR_PURCHASE',
        'PRICE_BURDEN',
        'NEED_MORE_TIME',
        'OTHER',
      ])
      .optional(),
    reasonDetail: z.string().optional(),
    selectedWaitType: z.enum(['1H', '1D', '3D', '1W']).optional(),
  }),
});
