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

export const createWishlistItem = async (userId, itemData) => {
  const { categoryCode, productName, productUrl, price, productImageUrl, reason, waitType } =
    itemData;
  const waitUntil = calculateWaitUntil(waitType);

  return await prisma.wishlistItem.create({
    data: {
      userId,
      categoryCode,
      productName,
      productUrl,
      price,
      productImageUrl,
      reason,
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

const getValidatedItem = async (userId, validatedParams) => {
  let wishlistId;
  try {
    wishlistId = BigInt(validatedParams.wishlistId);
  } catch (_err) {
    throw new HttpError(404, '해당 위시리스트 항목을 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.WISH4041,
    });
  }

  const item = await prisma.wishlistItem.findUnique({
    where: { id: wishlistId },
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

export const getWishlistItemById = async (userId, validatedParams) => {
  return await getValidatedItem(userId, validatedParams);
};

export const updateWishlistItem = async (userId, validatedParams, updateData) => {
  // 1. DB 존재 여부(404) 및 작성자 권한(403)을 먼저 검증
  await getValidatedItem(userId, validatedParams);

  // 2. 업데이트할 데이터 구성
  const dataToUpdate = {};

  if (updateData?.categoryCode !== undefined) dataToUpdate.categoryCode = updateData.categoryCode;
  if (updateData?.productName !== undefined) dataToUpdate.productName = updateData.productName;
  if (updateData?.price !== undefined) dataToUpdate.price = updateData.price;
  if (updateData?.productUrl !== undefined) dataToUpdate.productUrl = updateData.productUrl;
  if (updateData?.productImageUrl !== undefined)
    dataToUpdate.productImageUrl = updateData.productImageUrl;
  if (updateData?.reason !== undefined) dataToUpdate.reason = updateData.reason;

  if (updateData?.waitType) {
    dataToUpdate.waitUntil = calculateWaitUntil(updateData.waitType);
    dataToUpdate.waitType = WAIT_TYPE_MAP[updateData.waitType];
  }

  // 3. 수정할 값이 비어있는지 확인 (400 Bad Request)
  if (Object.keys(dataToUpdate).length === 0) {
    throw new HttpError(400, '수정할 값이 없습니다.', {
      errorCode: ERROR_CODES.WISH4001,
    });
  }

  return await prisma.wishlistItem.update({
    where: { id: BigInt(validatedParams.wishlistId) },
    data: dataToUpdate,
  });
};

export const deleteWishlistItem = async (userId, validatedParams) => {
  await getValidatedItem(userId, validatedParams);

  return await prisma.wishlistItem.delete({
    where: { id: BigInt(validatedParams.wishlistId) },
  });
};
