import { getOnboarding, updateOnboarding } from './onboarding.service.js';
import { ok } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const getOnboardingController = asyncHandler(async (req, res) => {
  const result = await getOnboarding(BigInt(req.user.userId));
  return ok(res, result, '온보딩 정보 조회 성공');
});

export const updateOnboardingController = asyncHandler(async (req, res) => {
  const result = await updateOnboarding(BigInt(req.user.userId), req.validated.body);
  return ok(res, result, '온보딩 정보 저장 성공');
});
