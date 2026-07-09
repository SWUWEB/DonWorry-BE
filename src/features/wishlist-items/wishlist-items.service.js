import { prisma } from '../../prisma/client.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { HttpError } from '../../utils/http-error.js';

const WAIT_TYPE_MAP = {
  '1H': 'ONE_HOUR',
  '1D': 'ONE_DAY',
  '3D': 'THREE_DAYS',
  '1W': 'ONE_WEEK',
};

/**
 * 사용자가 선택한 대기 타입을 기반으로 만료 날짜(waitUntil)를 계산하는 유틸 함수
 * @param {string} waitType - 대기 타임 코드 ('1H', '1D', '3D', '1W')
 * @returns {Date} 계산된 미래 시점의 Date 객체
 */
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

export const createWishlistItem = async (userId, itemData) => {
  const { productName, productUrl, price, productImageUrl, waitType } = itemData;
  const waitUntil = calculateWaitUntil(waitType);

  return await prisma.wishlistItem.create({
    data: {
      userId,
      productName,
      productUrl,
      price,
      productImageUrl,
      waitType: WAIT_TYPE_MAP[waitType] || 'ONE_HOUR',
      waitUntil,
      status: 'WAITING',
    },
  });
};

export const getWishlistItems = async (userId) => {
  return await prisma.wishlistItem.findMany({
    where: {
      userId,
      status: 'WAITING',
    },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * 아이템의 존재 여부 및 현재 사용자의 소유권을 유효성 검사하는 비즈니스 유틸 함수
 * @throws {Error} 존재하지 않는 경우 404 에러, 타인 소유인 경우 403 에러 발생
 */
const getValidatedItem = async (userId, wishlistId) => {
  try {
    const item = await prisma.wishlistItem.findUnique({
      where: { id: BigInt(wishlistId) },
    });

    if (!item) {
      throw new HttpError(404, '해당 위시리스트 항목을 찾을 수 없습니다.', {
        errorCode: ERROR_CODES.WISH4041 || 'WISH4041',
      });
    }

    if (item.userId !== userId) {
      throw new HttpError(403, '접근 권한이 없습니다.', {
        errorCode: ERROR_CODES.WISH4031 || 'WISH4031',
      });
    }
    return item;
  } catch (err) {
    if (err instanceof HttpError) throw err;

    // Prisma 예외 및 BigInt 캐스팅 오류 시 일관된 404 예외 처리를 보장하기 위한 분기
    if (
      err.code === 'P2025' ||
      err.message.includes('not found') ||
      err.message.includes('BigInt')
    ) {
      throw new HttpError(404, '해당 위시리스트 항목을 찾을 수 없습니다.', {
        errorCode: ERROR_CODES.WISH4041 || 'WISH4041',
      });
    }
    throw err;
  }
};

export const getWishlistItemById = async (userId, wishlistId) => {
  return await getValidatedItem(userId, wishlistId);
};

export const updateWishlistItem = async (userId, wishlistId, updateData) => {
  await getValidatedItem(userId, wishlistId);

  const dataToUpdate = {
    productName: updateData.productName,
    price: updateData.price,
    productUrl: updateData.productUrl,
    productImageUrl: updateData.productImageUrl,
  };

  if (updateData.waitType) {
    dataToUpdate.waitUntil = calculateWaitUntil(updateData.waitType);
    dataToUpdate.waitType = WAIT_TYPE_MAP[updateData.waitType];
  }

  return await prisma.wishlistItem.update({
    where: { id: BigInt(wishlistId) },
    data: dataToUpdate,
  });
};

export const deleteWishlistItem = async (userId, wishlistId) => {
  await getValidatedItem(userId, wishlistId);

  return await prisma.wishlistItem.delete({
    where: { id: BigInt(wishlistId) },
  });
};
