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
  KAKAO_REDIRECT_URI: z.string().optional().default(''),
});

export const env = envSchema.parse(process.env);
