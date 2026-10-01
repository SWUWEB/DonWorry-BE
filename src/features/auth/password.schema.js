import { z } from 'zod';

const passwordByteLimitMessage = '비밀번호는 UTF-8 기준 72바이트 이하여야 합니다.';
const withinBcryptLimit = (value) => Buffer.byteLength(value, 'utf8') <= 72;

export const newPasswordSchema = z
  .string({ error: '비밀번호는 8자 이상이어야 합니다.' })
  .min(8, '비밀번호는 8자 이상이어야 합니다.')
  .max(100, '비밀번호는 100자 이하여야 합니다.')
  .regex(/[A-Za-z]/, '비밀번호에는 영문자가 1개 이상 포함되어야 합니다.')
  .regex(/[0-9]/, '비밀번호에는 숫자가 1개 이상 포함되어야 합니다.')
  .regex(/[\p{P}\p{S}]/u, '비밀번호에는 특수문자가 1개 이상 포함되어야 합니다.')
  .refine(withinBcryptLimit, { message: passwordByteLimitMessage })
  .describe('8~100자, 영문·숫자·문장부호 또는 기호 포함, UTF-8 기준 최대 72바이트');

export const passwordCredentialSchema = (requiredMessage = '비밀번호는 필수입니다.') =>
  z
    .string({ error: requiredMessage })
    .min(1, requiredMessage)
    .refine(withinBcryptLimit, { message: passwordByteLimitMessage })
    .describe(
      'UTF-8 기준 최대 72바이트. 기존에 더 긴 비밀번호를 사용했다면 비밀번호 재설정이 필요합니다.',
    );
