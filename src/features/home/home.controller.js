import { notImplemented } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ok } from '../../utils/api-response.js';
import { getHomeSummary, getDailyQuestion } from './home.service.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

export const getHomeSummaryController = asyncHandler(async (req, res) => {
  const result = await getHomeSummary(BigInt(req.user.userId));
  return ok(res, result, '홈 요약 조회 성공');
});

export const getDailyQuestionController = asyncHandler(async (req, res) => {
  const result = await getDailyQuestion();
  return ok(res, result, '오늘의 소비 질문 조회 성공');
});
