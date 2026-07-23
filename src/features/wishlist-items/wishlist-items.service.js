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
  try {
    const item = await prisma.wishlistItem.findUnique({
      where: { id: BigInt(validatedParams.wishlistId) },
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
  } catch (err) {
    if (err instanceof HttpError) throw err;

    if (
      err.code === 'P2025' ||
      err.message?.includes('not found') ||
      err.message?.includes('BigInt')
    ) {
      throw new HttpError(404, '해당 위시리스트 항목을 찾을 수 없습니다.', {
        errorCode: ERROR_CODES.WISH4041,
      });
    }
    throw err;
  }
};

export const getWishlistItemById = async (userId, validatedParams) => {
  return await getValidatedItem(userId, validatedParams);
};

export const updateWishlistItem = async (userId, validatedParams, updateData) => {
  if (!updateData || Object.keys(updateData).length === 0) {
    throw new HttpError(400, '수정할 값이 없습니다.', {
      errorCode: ERROR_CODES.COMMON4001,
    });
  }

  await getValidatedItem(userId, validatedParams);

  const dataToUpdate = {
    categoryCode: updateData.categoryCode,
    productName: updateData.productName,
    price: updateData.price,
    productUrl: updateData.productUrl,
    productImageUrl: updateData.productImageUrl,
    reason: updateData.reason,
  };

  if (updateData.waitType) {
    dataToUpdate.waitUntil = calculateWaitUntil(updateData.waitType);
    dataToUpdate.waitType = WAIT_TYPE_MAP[updateData.waitType];
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
