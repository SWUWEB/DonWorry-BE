import { asyncHandler } from '../../utils/async-handler.js';
import { created, ok, notImplemented } from '../../utils/api-response.js';
import { checkLoginId, requestEmailVerification, signup } from './auth.service.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

export const signupController = asyncHandler(async (req, res) => {
  const user = await signup(req.validated.body);

  return created(res, user, '회원가입이 완료되었습니다.');
});

export const checkLoginIdController = asyncHandler(async (req, res) => {
  const result = await checkLoginId(req.validated.query);

  return ok(res, result);
});

export const requestEmailVerificationController = asyncHandler(async (req, res) => {
  const result = await requestEmailVerification(req.validated.body);

  return ok(res, result, '이메일 인증 요청이 완료되었습니다.');
});
