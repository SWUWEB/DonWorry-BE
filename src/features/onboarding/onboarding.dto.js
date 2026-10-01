import { z } from 'zod';
import { requiredInterestTagsSchema } from '../../config/interest-tags.js';

export const upsertOnboardingDto = z.object({
  body: z.object({
    interestTags: requiredInterestTagsSchema,
    savingGoalText: z.string().min(1).max(255),
    targetSavingAmount: z.coerce.bigint().min(1000n).max(1_000_000_000n),
  }),
});
