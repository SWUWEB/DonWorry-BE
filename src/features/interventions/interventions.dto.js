import { z } from 'zod';

const questionId = z
  .union([z.number().int().positive().safe(), z.string().regex(/^[1-9]\d*$/)])
  .transform((value) => BigInt(value));

export const listInterventionQuestionsDto = z.object({
  query: z.object({
    category_code: z.string().min(1),
  }),
});

export const calculateRiskScoreDto = z.object({
  body: z.object({
    price: z.coerce.number().nonnegative(),
    interventionAnswers: z.array(z.object({ questionId, answerValue: z.boolean() })),
  }),
});
