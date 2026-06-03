import { z } from 'zod';

export const upsertOnboardingDto = z.object({
  body: z.object({
    nickname: z.string().min(1).max(50).optional(),
    interestTags: z.array(z.string()).optional(),
    savingGoalText: z.string().max(255).optional(),
    targetSavingAmount: z.coerce.bigint().positive().optional(),
    notifyGoalEnabled: z.boolean().optional(),
    notifyTemptationEnabled: z.boolean().optional(),
    notifyGeneralEnabled: z.boolean().optional(),
    notifyPushEnabled: z.boolean().optional(),
  }),
});
