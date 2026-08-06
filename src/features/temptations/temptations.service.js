import { prisma } from '../../prisma/client.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { HttpError } from '../../utils/http-error.js';

const WAIT_TYPE_MAP = {
  '1H': 'ONE_HOUR',
  '1D': 'ONE_DAY',
  '3D': 'THREE_DAYS',
  '1W': 'ONE_WEEK',
};

const calculateWaitUntil = (waitType) => {
  const now = new Date();
  switch (waitType) {
    case '1H':
      now.setHours(now.getHours() + 1);
      break;
    case '1D':
      now.setDate(now.getDate() + 1);
      break;
    case '3D':
      now.setDate(now.getDate() + 3);
      break;
    case '1W':
      now.setDate(now.getDate() + 7);
      break;
    default:
      now.setHours(now.getHours() + 1);
  }
  return now;
};

const STATUS_MAP = {
  BUY: 'DECIDED',
  SKIP: 'DECIDED',
  DELAY: 'WAITING',
};

export const createWishlistDecision = async (userId, temptationIdParam, bodyData) => {
  const { decisionType, selectedWaitType } = bodyData;

  let temptationId;
  try {
    temptationId = BigInt(temptationIdParam);
  } catch (_err) {
    throw new HttpError(404, '해당 위시리스트 항목을 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.WISH4041,
    });
  }

  let selectedWaitUntil = null;
  let mappedWaitType = null;

  if (decisionType === 'DELAY') {
    if (!selectedWaitType) {
      throw new HttpError(400, '고민 시간 연장 시 추가 대기 시간 선택은 필수입니다.', {
        errorCode: ERROR_CODES.WISH4002,
      });
    }
    selectedWaitUntil = calculateWaitUntil(selectedWaitType);
    mappedWaitType = WAIT_TYPE_MAP[selectedWaitType];
  }

  return await prisma.$transaction(async (tx) => {
    const temptation = await tx.wishlistItem.findUnique({
      where: { id: temptationId },
    });

    if (!temptation) {
      throw new HttpError(404, '해당 위시리스트 항목을 찾을 수 없습니다.', {
        errorCode: ERROR_CODES.WISH4041,
      });
    }

    if (temptation.userId !== userId) {
      throw new HttpError(403, '접근 권한이 없습니다.', {
        errorCode: ERROR_CODES.WISH4031,
      });
    }

    const now = new Date();
    const whereCondition = {
      id: temptationId,
      userId,
      status: 'WAITING',
    };

    if (decisionType === 'DELAY') {
      whereCondition.OR = [{ waitUntil: null }, { waitUntil: { lte: now } }];
    }

    const nextStatus = STATUS_MAP[decisionType];
    const updateData = { status: nextStatus };

    if (decisionType === 'DELAY') {
      updateData.waitType = mappedWaitType;
      updateData.waitUntil = selectedWaitUntil;
    }

    const updateResult = await tx.wishlistItem.updateMany({
      where: whereCondition,
      data: updateData,
    });

    if (updateResult.count === 0) {
      const latestItem = await tx.wishlistItem.findUnique({
        where: { id: temptationId },
      });

      if (!latestItem || latestItem.status !== 'WAITING') {
        throw new HttpError(409, '이미 재판단이 완료되었거나 대기 상태가 아닌 항목입니다.', {
          errorCode: ERROR_CODES.WISH4091,
        });
      }

      if (
        decisionType === 'DELAY' &&
        latestItem.waitUntil &&
        now < new Date(latestItem.waitUntil)
      ) {
        throw new HttpError(400, '아직 재판단 시간이 되지 않았습니다.', {
          errorCode: ERROR_CODES.WISH4003,
        });
      }

      throw new HttpError(409, '이미 처리가 완료되었거나 중복된 요청입니다.', {
        errorCode: ERROR_CODES.WISH4091,
      });
    }

    const decision = await tx.wishlistDecision.create({
      data: {
        wishlistItemId: temptation.id,
        decisionType,
        selectedWaitType: mappedWaitType,
        selectedWaitUntil,
        decidedAt: now,
      },
    });

    if (decisionType === 'SKIP') {
      await tx.consumptionRecord.create({
        data: {
          userId,
          productName: temptation.productName,
          price: temptation.price?.toString() ?? null,
          categoryCode: temptation.categoryCode ?? null,
          productUrl: temptation.productUrl ?? null,
          reason: temptation.reason ?? null,
          type: 'SKIPPED',
          occurredAt: now,
        },
      });
    }

    return decision;
  });
};
