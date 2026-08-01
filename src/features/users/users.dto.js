import { z } from 'zod';

export const updateMeDto = z.object({
  body: z
    .object({
      nickname: z.string().min(1).max(50).optional(),
      profileImageUrl: z.string().url().max(500).nullable().optional(),
      interestTags: z.array(z.string().max(50)).max(20).optional(),
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
  body: z
    .object({
      notifyGoalEnabled: z.boolean().optional(),
      notifyTemptationEnabled: z.boolean().optional(),
      notifyGeneralEnabled: z.boolean().optional(),
      notifyPushEnabled: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: '수정할 설정 값이 최소 1개 이상 필요합니다.',
    })
    .refine(
      (body) => {
        const hasPush = body.notifyPushEnabled !== undefined;
        const hasDetail =
          body.notifyGoalEnabled !== undefined ||
          body.notifyTemptationEnabled !== undefined ||
          body.notifyGeneralEnabled !== undefined;
        return !(hasPush && hasDetail);
      },
      {
        message: '전체 알림과 세부 알림은 동일한 요청에서 함께 변경할 수 없습니다.',
      },
    ),
});

export const deleteUserDto = z.object({
  body: z.object({
    password: z.string().min(1, '비밀번호를 입력해주세요.'),
    reasonType: z
      .enum([
        'LOW_FREQUENCY',
        'MISSING_FEATURE',
        'INCONVENIENT',
        'PRIVACY_CONCERN',
        'SWITCHING_SERVICE',
        'OTHER',
      ])
      .optional(),
  }),
});
