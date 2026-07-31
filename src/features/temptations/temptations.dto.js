import { z } from 'zod';

export const temptationIdDto = z.object({
  params: z.object({ 
    temptationId: z.coerce.bigint().positive() 
  }),
});

export const createWishlistDecisionDto = temptationIdDto.extend({
  body: z.object({
    decisionType: z.enum(['BUY', 'SKIP', 'DELAY']),
    selectedWaitType: z.enum(['1H', '1D', '3D', '1W']).optional(),
  }).refine((data) => {
    if (data.decisionType === 'DELAY' && !data.selectedWaitType) {
      return false;
    }
    return true;
  }, {
    message: "decisionType이 'DELAY'일 때는 selectedWaitType이 필수입니다.",
    path: ['selectedWaitType'],
  }),
});