import { asyncHandler } from '../../utils/async-handler.js';
import { created, ok, notImplemented } from '../../utils/api-response.js';
import { checkEmail, checkLoginId, signup } from './auth.service.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

export const signupController = asyncHandler(async (req, res) => {
  const user = await signup(req.validated.body);

  return created(res, user, '회원가입이 완료되었습니다.');
});

export const checkEmailController = asyncHandler(async (req, res) => {
  const result = await checkEmail(req.validated.query);

  return ok(res, result);
});

export const checkLoginIdController = asyncHandler(async (req, res) => {
  const result = await checkLoginId(req.validated.query);

  return ok(res, result);
});
