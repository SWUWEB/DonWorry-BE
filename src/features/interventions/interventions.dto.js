import { z } from 'zod';

export const calculateRiskScoreDto = z.object({
  body: z.object({
    answers: z
      .array(z.object({ questionId: z.coerce.bigint().positive(), answerValue: z.boolean() }))
      .min(1),
  }),
});
