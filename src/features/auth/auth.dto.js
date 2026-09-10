import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('올바른 이메일 형식이 아닙니다.')
  .max(255, '이메일은 255자 이하여야 합니다.');
const loginId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{6,12}$/, '아이디는 영문, 숫자 조합 6~12자여야 합니다.');
const password = z
  .string()
  .min(8, '비밀번호는 8자 이상이어야 합니다.')
  .max(100, '비밀번호는 100자 이하여야 합니다.')
  .regex(/[A-Za-z]/, '비밀번호에는 영문자가 1개 이상 포함되어야 합니다.')
  .regex(/[0-9]/, '비밀번호에는 숫자가 1개 이상 포함되어야 합니다.')
  .regex(/[^A-Za-z0-9]/, '비밀번호에는 특수문자가 1개 이상 포함되어야 합니다.');
const name = z.string().trim().min(1, '이름은 필수입니다.').max(50, '이름은 50자 이하여야 합니다.');
const phoneNumber = z
  .string()
  .trim()
  .regex(/^01[016789]-?\d{3,4}-?\d{4}$/, '올바른 전화번호 형식이 아닙니다.');
const emailVerificationCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, '인증 코드는 6자리 숫자여야 합니다.');
const refreshTokenBodySchema = z
  .object({
    refreshToken: z.string().trim().min(1, 'refreshToken은 필수입니다.'),
  })
  .strict();

export const signupDto = z.object({
  body: z
    .object({
      name,
      loginId,
      email,
      emailVerificationToken: z.string().min(1, '이메일 인증이 필요합니다.'),
      password,
      passwordConfirm: z.string().min(1, '비밀번호 확인은 필수입니다.'),
      phoneNumber,
    })
    .refine((data) => data.password === data.passwordConfirm, {
      message: '비밀번호가 일치하지 않습니다.',
      path: ['passwordConfirm'],
    }),
});

export const loginDto = z.object({
  body: z.object({ loginId, password }).strict(),
});

export const logoutDto = z.object({
  body: refreshTokenBodySchema,
});

export const kakaoLoginDto = z.object({
  body: z
    .object({ authorizationCode: z.string().trim().min(1, '인가 코드는 필수입니다.') })
    .strict(),
});

export const kakaoLinkPasswordDto = z.object({
  body: z
    .object({
      linkingToken: z.string().trim().min(1, '계정 연결 토큰은 필수입니다.'),
      password: z.string().min(1, '비밀번호는 필수입니다.'),
    })
    .strict(),
});

export const kakaoLinkEmailRequestDto = z.object({
  body: z.object({ linkingToken: z.string().trim().min(1) }).strict(),
});

export const kakaoLinkEmailConfirmDto = z.object({
  body: z
    .object({
      linkingToken: z.string().trim().min(1),
      code: emailVerificationCode,
    })
    .strict(),
});

export const refreshTokenDto = z.object({
  body: refreshTokenBodySchema,
});

export const checkEmailDto = z.object({
  query: z.object({ email }),
});

export const checkLoginIdDto = z.object({
  query: z.object({ loginId }),
});

export const emailVerificationRequestDto = z.object({
  body: z.object({ email }),
});

export const emailVerificationConfirmDto = z.object({
  body: z.object({ email, code: emailVerificationCode }),
});

export const passwordResetRequestDto = z.object({
  body: z.object({ email }).strict(),
});

export const loginIdRecoveryRequestDto = z.object({
  body: z.object({ email }).strict(),
});

export const passwordResetConfirmDto = z.object({
  body: z
    .object({
      email,
      code: emailVerificationCode,
      newPassword: password,
      newPasswordConfirm: z.string().min(1, '비밀번호 확인은 필수입니다.'),
    })
    .strict()
    .refine((data) => data.newPassword === data.newPasswordConfirm, {
      message: '비밀번호가 일치하지 않습니다.',
      path: ['newPasswordConfirm'],
    }),
});
