import { asyncHandler } from '../../utils/async-handler.js';
import { created, ok, notImplemented } from '../../utils/api-response.js';
import {
  checkEmail,
  checkLoginId,
  confirmEmailVerification,
  login,
  refreshAccessToken,
  requestEmailVerification,
  signup,
} from './auth.service.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

export const signupController = asyncHandler(async (req, res) => {
  const user = await signup(req.validated.body);

  return created(res, user, '회원가입이 완료되었습니다.');
});

export const loginController = asyncHandler(async (req, res) => {
  const result = await login(req.validated.body);

  return ok(res, result, '로그인이 완료되었습니다.');
});

export const refreshTokenController = asyncHandler(async (req, res) => {
  const result = await refreshAccessToken(req.validated.body);

  return ok(res, result, '토큰 재발급이 완료되었습니다.');
});

export const checkEmailController = asyncHandler(async (req, res) => {
  const result = await checkEmail(req.validated.query);

  return ok(res, result);
});

export const checkLoginIdController = asyncHandler(async (req, res) => {
  const result = await checkLoginId(req.validated.query);

  return ok(res, result);
});

export const requestEmailVerificationController = asyncHandler(async (req, res) => {
  const result = await requestEmailVerification(req.validated.body);

  return ok(res, result, '이메일 인증 요청이 완료되었습니다.');
});

export const confirmEmailVerificationController = asyncHandler(async (req, res) => {
  const result = await confirmEmailVerification(req.validated.body);

  return ok(res, result, '이메일 인증이 완료되었습니다.');
});
