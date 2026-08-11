import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { requireAuth } from '../../middlewares/auth.js';
import {
  checkEmailController,
  checkLoginIdController,
  confirmEmailVerificationController,
  confirmPasswordResetController,
  confirmKakaoLinkEmailController,
  kakaoLinkPasswordController,
  kakaoLoginController,
  loginController,
  logoutController,
  refreshTokenController,
  requestKakaoLinkEmailController,
  requestEmailVerificationController,
  requestPasswordResetController,
  signupController,
} from './auth.controller.js';
import {
  checkEmailDto,
  checkLoginIdDto,
  emailVerificationConfirmDto,
  emailVerificationRequestDto,
  kakaoLinkEmailConfirmDto,
  kakaoLinkEmailRequestDto,
  kakaoLinkPasswordDto,
  kakaoLoginDto,
  loginDto,
  logoutDto,
  passwordResetConfirmDto,
  passwordResetRequestDto,
  refreshTokenDto,
  signupDto,
} from './auth.dto.js';

export const authRouter = Router();

authRouter.post('/signup', validate(signupDto), signupController);
authRouter.post('/login', validate(loginDto), loginController);
authRouter.post('/logout', requireAuth, validate(logoutDto), logoutController);
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
authRouter.post(
  '/password-reset/request',
  validate(passwordResetRequestDto),
  requestPasswordResetController,
);
authRouter.patch(
  '/password-reset/confirm',
  validate(passwordResetConfirmDto),
  confirmPasswordResetController,
);
authRouter.post('/kakao/login', validate(kakaoLoginDto), kakaoLoginController);
authRouter.post('/kakao/link', validate(kakaoLinkPasswordDto), kakaoLinkPasswordController);
authRouter.post(
  '/kakao/link/email-verifications',
  validate(kakaoLinkEmailRequestDto),
  requestKakaoLinkEmailController,
);
authRouter.post(
  '/kakao/link/email-verifications/confirm',
  validate(kakaoLinkEmailConfirmDto),
  confirmKakaoLinkEmailController,
);
