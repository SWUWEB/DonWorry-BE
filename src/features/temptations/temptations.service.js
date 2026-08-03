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

  // 1. BigInt 변환 파싱 에러 사전 검증
  let temptationId;
  try {
    temptationId = BigInt(temptationIdParam);
  } catch (_err) {
    throw new HttpError(404, '해당 위시리스트 항목을 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.WISH4041,
    });
  }

  // 2. DELAY 파라미터 사전 검증
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

  // 3. 트랜잭션 내에서 원자적(Atomic) 조회 및 동시성 검증
  return await prisma.$transaction(async (tx) => {
    // 트랜잭션 안에서 최신 데이터를 가져옴
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

    // 상태 검증: WAITING 상태가 아니면 거부 (동시성 요청 차단)
    if (temptation.status !== 'WAITING') {
      throw new HttpError(409, '이미 재판단이 완료되었거나 대기 상태가 아닌 항목입니다.', {
        errorCode: ERROR_CODES.WISH4091,
      });
    }

    // ⭐ [리뷰 반영] DELAY 시간 검증: 고민 연장 시간이 아직 안 지났는데 재판단/연장을 시도하는 경우 차단
    if (
      decisionType === 'DELAY' &&
      temptation.waitUntil &&
      new Date() < new Date(temptation.waitUntil)
    ) {
      throw new HttpError(400, '아직 재판단 시간이 되지 않았습니다.', {
        errorCode: ERROR_CODES.WISH4003, // 프로젝트의 에러 코드에 맞게 맞추어 주세요
      });
    }

    // 4. 결정 기록 생성
    const decision = await tx.wishlistDecision.create({
      data: {
        wishlistItemId: temptation.id,
        decisionType,
        selectedWaitType: mappedWaitType,
        selectedWaitUntil,
        decidedAt: new Date(),
      },
    });

    // 5. 위시리스트 항목 상태 업데이트
    const nextStatus = STATUS_MAP[decisionType];
    const updateData = { status: nextStatus };

    if (decisionType === 'DELAY') {
      updateData.waitType = mappedWaitType;
      updateData.waitUntil = selectedWaitUntil;
    }

    await tx.wishlistItem.update({
      where: { id: temptation.id },
      data: updateData,
    });

    // 6. SKIP인 경우 소비 기록(참은 소비) 자동 생성
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
          occurredAt: new Date(),
        },
      });
    }

    return decision;
  });
};
