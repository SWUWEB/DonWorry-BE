import { z } from 'zod';

export const upsertOnboardingDto = z.object({
  body: z.object({
    interestTags: z.array(z.string().max(50)).min(1).max(3),
    savingGoalText: z.string().min(1).max(255),
    targetSavingAmount: z.coerce.bigint().min(1000n).max(1_000_000_000n),
  }),
});
