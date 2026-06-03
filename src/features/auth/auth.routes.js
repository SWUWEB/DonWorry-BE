import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import { createNotImplementedController } from './auth.controller.js';
import {
  checkEmailDto,
  emailVerificationConfirmDto,
  emailVerificationRequestDto,
  loginDto,
  passwordResetConfirmDto,
  passwordResetRequestDto,
  signupDto,
} from './auth.dto.js';

export const authRouter = Router();

const todo = createNotImplementedController('auth');

authRouter.post('/signup', validate(signupDto), todo);
authRouter.post('/login', validate(loginDto), todo);
authRouter.post('/logout', requireAuth, todo);
authRouter.post('/refresh', todo);
authRouter.get('/check-email', validate(checkEmailDto), todo);
authRouter.post('/email-verifications', validate(emailVerificationRequestDto), todo);
authRouter.post('/email-verifications/confirm', validate(emailVerificationConfirmDto), todo);
authRouter.post('/password-reset/request', validate(passwordResetRequestDto), todo);
authRouter.patch('/password-reset/confirm', validate(passwordResetConfirmDto), todo);
authRouter.post('/kakao/login', todo);
