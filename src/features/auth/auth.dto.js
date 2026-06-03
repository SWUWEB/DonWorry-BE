import { z } from 'zod';

const email = z.string().email().max(255);
const password = z.string().min(8).max(100);

export const signupDto = z.object({
  body: z.object({
    email,
    password,
    nickname: z.string().min(1).max(50),
    emailVerificationToken: z.string().min(1).optional(),
  }),
});

export const loginDto = z.object({
  body: z.object({ email, password }),
});

export const checkEmailDto = z.object({
  query: z.object({ email }),
});

export const emailVerificationRequestDto = z.object({
  body: z.object({ email }),
});

export const emailVerificationConfirmDto = z.object({
  body: z.object({ email, token: z.string().min(1) }),
});

export const passwordResetRequestDto = z.object({
  body: z.object({ email }),
});

export const passwordResetConfirmDto = z.object({
  body: z.object({ token: z.string().min(1), newPassword: password }),
});
