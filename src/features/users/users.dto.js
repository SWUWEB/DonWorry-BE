import { z } from 'zod';
import { CATEGORY_CODE_SET } from '../../config/categories.js';

const name = z
  .string()
  .trim()
  .min(2, '이름은 2~20자로 입력해주세요.')
  .max(20, '이름은 2~20자로 입력해주세요.');

const phoneNumber = z
  .preprocess(
    (val) => (val === null || val === '' ? null : val),
    z
      .string()
      .trim()
      .regex(/^01[016789]-?\d{3,4}-?\d{4}$/, '올바른 휴대폰 번호 형식이 아닙니다.')
      .nullable(),
  )
  .optional();

const birthDate = z
  .preprocess(
    (val) => (val === null || val === '' ? null : val),
    z
      .string()
      .trim()
      .date('올바른 생년월일을 선택해주세요.')
      .refine((value) => new Date(value) <= new Date(), '올바른 생년월일을 선택해주세요.')
      .nullable(),
  )
  .optional();

export const updateMeDto = z.object({
  body: z
    .object({
      nickname: name.optional(),
      profileImageUrl: z.string().url().max(500).nullable().optional(),
      interestTags: z.array(z.string().max(50)).max(20).optional(),
      phoneNumber,
      birthDate,
      gender: z.enum(['FEMALE', 'MALE']).optional(),
    })
    .refine(
      (body) =>
        body.nickname !== undefined ||
        body.profileImageUrl !== undefined ||
        body.interestTags !== undefined ||
        body.phoneNumber !== undefined ||
        body.birthDate !== undefined ||
        body.gender !== undefined,
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

const YEAR_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
export const getBudgetDto = z.object({
  query: z.object({
    yearMonth: z
      .string()
      .regex(YEAR_MONTH_REGEX, 'yearMonth는 YYYY-MM 형식이어야 합니다.')
      .optional(),
  }),
});

export const setBudgetDto = z.object({
  body: z.object({
    yearMonth: z.string().regex(YEAR_MONTH_REGEX, 'yearMonth는 YYYY-MM 형식이어야 합니다.'),
    monthlyIncome: z.coerce.bigint().nonnegative('수입 금액은 0원 이상이어야 합니다.').optional(),
    monthlyBudget: z.coerce.bigint().nonnegative('예산 금액은 0원 이상이어야 합니다.').optional(),

    categoryBudgets: z
      .array(
        z.object({
          categoryCode: z
            .string()
            .min(1)
            .refine((val) => CATEGORY_CODE_SET.has(val), {
              message: '유효한 카테고리 코드가 아닙니다.',
            }),
          budgetAmount: z.coerce.bigint().nonnegative('예산 금액은 0원 이상이어야 합니다.'),
        }),
      )
      .optional(),
  }),
});
