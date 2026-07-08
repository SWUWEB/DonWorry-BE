import { ok, notImplemented } from '../../utils/api-response.js';
import { getMe } from './users.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

export const getMeController = asyncHandler(async (req, res) => {
  const result = await getMe(BigInt(req.user.userId));
  return ok(res, result, '회원 정보 조회 성공');
});
