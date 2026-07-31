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

const getValidatedTemptationItem = async (userId, temptationIdParam) => {
  let temptationId;
  try {
    temptationId = BigInt(temptationIdParam);
  } catch (_err) {
    throw new HttpError(404, '해당 위시리스트 항목을 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.WISH4041,
    });
  }

  const item = await prisma.wishlistItem.findUnique({
    where: { id: temptationId },
  });

  if (!item) {
    throw new HttpError(404, '해당 위시리스트 항목을 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.WISH4041,
    });
  }

  if (item.userId !== userId) {
    throw new HttpError(403, '접근 권한이 없습니다.', {
      errorCode: ERROR_CODES.WISH4031,
    });
  }

  return item;
};

// DecisionType에 따른 WishlistStatus 매핑
const STATUS_MAP = {
  BUY: 'DECIDED',
  SKIP: 'DECIDED',
  DELAY: 'WAITING',
};

export const createWishlistDecision = async (userId, temptationIdParam, bodyData) => {
  const { decisionType, selectedWaitType } = bodyData;

  const temptation = await getValidatedTemptationItem(userId, temptationIdParam);

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
    // [작업 A] 재판단 이력 생성
    const decision = await tx.wishlistDecision.create({
      data: {
        wishlistItemId: temptation.id,
        decisionType,
        selectedWaitType: mappedWaitType,
        selectedWaitUntil,
        decidedAt: new Date(),
      },
    });

    // 💡 [수정] decisionType에 따라 status를 WAITING 또는 DECIDED로 설정
    const nextStatus = STATUS_MAP[decisionType];

    const updateData = { status: nextStatus };
    if (decisionType === 'DELAY') {
      updateData.waitType = mappedWaitType;
      updateData.waitUntil = selectedWaitUntil;
    }

    // [작업 B] 위시리스트 항목 상태 갱신
    await tx.wishlistItem.update({
      where: { id: temptation.id },
      data: updateData,
    });

    // [작업 C] '안 살래요(SKIP)' 선택 시 참은 소비 자동 생성
    if (decisionType === 'SKIP') {
      await tx.consumptionRecord.create({
        data: {
          userId,
          productName: temptation.productName,
          price: temptation.price.toString(),
          categoryCode: temptation.categoryCode ?? null,
          productUrl: temptation.productUrl ?? null,
          reason: temptation.reason ?? null,
          type: 'SKIPPED',
          occurredAt: new Date(),
        },
      });
    }

    return decision;
  });
};