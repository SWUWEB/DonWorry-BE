import * as temptationsService from './temptations.service.js';

/**
 * Prisma 모델의 BigInt 필드를 JSON 직렬화가 가능한 문자열로 변환하는 유틸 함수
 * @param {Object} decision - 변환할 재판단 기록 객체
 * @returns {Object|null} 직렬화된 객체 또는 null
 */
const serializeWishlistDecision = (decision) => {
  if (!decision || !decision.id) return null;
  return {
    ...decision,
    id: decision.id.toString(),
    wishlistItemId: decision.wishlistItemId.toString(),
    selectedWaitUntil: decision.selectedWaitUntil
      ? decision.selectedWaitUntil.toISOString()
      : null,
    decidedAt: decision.decidedAt ? decision.decidedAt.toISOString() : null,
  };
};

export const createWishlistDecisionController = async (req, res, next) => {
  try {
    const { temptationId } = req.validated.params;
    const bodyData = req.validated.body;
    const loggedInUserId = BigInt(req.user.userId);

    const newDecision = await temptationsService.createWishlistDecision(
      loggedInUserId,
      temptationId,
      bodyData
    );

    return res.status(201).json({
      success: true,
      data: serializeWishlistDecision(newDecision),
    });
  } catch (error) {
    next(error);
  }
};