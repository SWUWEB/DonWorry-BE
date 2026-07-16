import { z } from 'zod';

export const updateMeDto = z.object({
  body: z
    .object({
      nickname: z.string().min(1).max(50).optional(),
      profileImageUrl: z.string().url().max(500).nullable().optional(),
      interestTags: z.array(z.string()).optional(),
    })
    .refine(
      (body) =>
        body.nickname !== undefined ||
        body.profileImageUrl !== undefined ||
        body.interestTags !== undefined,
      { message: '최소 하나 이상의 수정 필드를 입력해야 합니다.' },
    ),
});

export const changePasswordDto = z.object({
  body: z.object({
    currentPassword: z.string().min(8).max(100),
    newPassword: z.string().min(8).max(100),
  }),
});

export const savingGoalDto = z.object({
  body: z.object({
    savingGoalText: z.string().min(1).max(255),
    targetSavingAmount: z.coerce.bigint().positive(),
    savingGoalIsActive: z.boolean().optional(),
  }),
});

export const notificationSettingsDto = z.object({
  body: z.object({
    notifyGoalEnabled: z.boolean().optional(),
    notifyTemptationEnabled: z.boolean().optional(),
    notifyGeneralEnabled: z.boolean().optional(),
    notifyPushEnabled: z.boolean().optional(),
  }),
});
