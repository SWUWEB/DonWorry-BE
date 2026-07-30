import { ERROR_CODES } from '../../config/error-codes.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { ok } from '../../utils/api-response.js';
import { HttpError } from '../../utils/http-error.js';
import { calculateRisk, listInterventionQuestions } from './interventions.service.js';

const getAuthenticatedUserId = (req) => req.user?.userId ?? req.user?.id ?? req.user?.user_id;

export const listInterventionQuestionsController = asyncHandler(async (req, res) => {
  try {
    const result = await listInterventionQuestions({
      userId: getAuthenticatedUserId(req),
      categoryCode: req.validated.query.category_code,
    });
    return ok(res, result, '개입 질문 목록 조회에 성공했습니다.');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, '개입 질문을 조회하는 중 오류가 발생했습니다.', {
      errorCode: ERROR_CODES.INTERVENTION5001,
    });
  }
});

export const calculateRiskController = asyncHandler(async (req, res) => {
  try {
    const result = await calculateRisk(req.validated.body);
    return ok(res, result, '소비 위험도 계산에 성공했습니다.');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, '소비 위험도를 계산하는 중 오류가 발생했습니다.', {
      errorCode: ERROR_CODES.RISK5001,
    });
  }
});
