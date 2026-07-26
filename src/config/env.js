import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('1h'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('14d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  PRISMA_LOG_QUERIES: z.enum(['true', 'false']).default('false'),
  KAKAO_CLIENT_ID: z.string().optional().default(''),
  KAKAO_CLIENT_SECRET: z.string().optional().default(''),
  KAKAO_REDIRECT_URI: z.string().optional().default(''),
  KAKAO_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  KAKAO_LINK_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  KAKAO_LINK_PASSWORD_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  KAKAO_LINK_PASSWORD_LOCK_SECONDS: z.coerce.number().int().positive().default(300),
  AUTH_EMAIL_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  AUTH_EMAIL_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  AUTH_EMAIL_SEND_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
  AUTH_EMAIL_SEND_LIMIT: z.coerce.number().int().positive().default(3),
  AUTH_EMAIL_CONFIRM_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_EMAIL_CONFIRM_LOCK_SECONDS: z.coerce.number().int().positive().default(300),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),
});

export const env = envSchema.parse(process.env);
