import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import {
  checkEmailController,
  checkLoginIdController,
  confirmEmailVerificationController,
  createNotImplementedController,
  loginController,
  refreshTokenController,
  requestEmailVerificationController,
  signupController,
} from './auth.controller.js';
import {
  checkEmailDto,
  checkLoginIdDto,
  emailVerificationConfirmDto,
  emailVerificationRequestDto,
  loginDto,
  passwordResetConfirmDto,
  passwordResetRequestDto,
  refreshTokenDto,
  signupDto,
} from './auth.dto.js';

export const authRouter = Router();

const todo = createNotImplementedController('auth');

authRouter.post('/signup', validate(signupDto), signupController);
authRouter.post('/login', validate(loginDto), loginController);
authRouter.post('/logout', requireAuth, todo);
authRouter.post('/refresh', validate(refreshTokenDto), refreshTokenController);
authRouter.get('/check-email', validate(checkEmailDto), checkEmailController);
authRouter.get('/check-login-id', validate(checkLoginIdDto), checkLoginIdController);
authRouter.post(
  '/email-verifications',
  validate(emailVerificationRequestDto),
  requestEmailVerificationController,
);
authRouter.post(
  '/email-verifications/confirm',
  validate(emailVerificationConfirmDto),
  confirmEmailVerificationController,
);
authRouter.post('/password-reset/request', validate(passwordResetRequestDto), todo);
authRouter.patch('/password-reset/confirm', validate(passwordResetConfirmDto), todo);
authRouter.post('/kakao/login', todo);
