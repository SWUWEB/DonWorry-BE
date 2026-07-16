import { ok, notImplemented } from '../../utils/api-response.js';
import { getMe, updateMe } from './users.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

export const getMeController = asyncHandler(async (req, res) => {
  const result = await getMe(BigInt(req.user.userId));
  return ok(res, result, '회원 정보 조회 성공');
});

export const updateMeController = asyncHandler(async (req, res) => {
  const result = await updateMe(BigInt(req.user.userId), req.body);
  return ok(res, result, '회원 정보 수정 성공');
});
