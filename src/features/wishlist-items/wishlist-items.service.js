import { prisma } from '../../prisma/client.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { HttpError } from '../../utils/http-error.js';
import { createNotificationInTx } from '../notifications/notifications.service.js';

const WAIT_TYPE_MAP = {
  '1H': 'ONE_HOUR',
  '1D': 'ONE_DAY',
  '3D': 'THREE_DAYS',
  '1W': 'ONE_WEEK',
};

const WAIT_TYPE_LABEL = {
  '1H': '1시간',
  '1D': '1일',
  '3D': '3일',
  '1W': '1주일',
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
  const waitLabel = WAIT_TYPE_LABEL[waitType] || '1시간';

  return await prisma.$transaction(async (tx) => {
    const item = await tx.wishlistItem.create({
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
    await createNotificationInTx(tx, {
      userId,
      notificationType: 'TEMPTATION',
      title: '새로운 유혹이 추가됨',
      body: `'${productName}'를 위시리스트에 담았습니다. ${waitLabel} 뒤에 다시 물어볼게요!`,
      wishlistItemId: item.id,
    });

    await createNotificationInTx(tx, {
      userId,
      notificationType: 'TEMPTATION',
      title: '결단의 시간이 왔어요!',
      body: `'${productName}' 대기 시간이 끝났어요. 아직도 사고 싶으신가요?`,
      wishlistItemId: item.id,
      notifyAt: waitUntil,
    });
    return item;
  });
};

export const getWishlistItems = async (userId, queryParams = {}) => {
  const { query, categoryCode, sort = 'CREATED_DESC', page = 1, limit = 10 } = queryParams;

  const where = {
    userId,
    status: 'WAITING',
  };

  if (query) {
    where.productName = { contains: query };
  }

  if (categoryCode && categoryCode !== 'ALL') {
    where.categoryCode = categoryCode;
  }

  let orderBy = { createdAt: 'desc' };
  if (sort === 'NAME_ASC') {
    orderBy = { productName: 'asc' };
  } else if (sort === 'DEADLINE_ASC') {
    orderBy = { waitUntil: 'asc' };
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  const skip = (pageNum - 1) * limitNum;

  const [items, totalCount] = await Promise.all([
    prisma.wishlistItem.findMany({
      where,
      orderBy,
      skip,
      take: limitNum,
    }),
    prisma.wishlistItem.count({ where }),
  ]);

  return { items, totalCount };
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
  const existing = await getValidatedItem(userId, validatedParams);
  const dataToUpdate = {};

  if (updateData?.categoryCode !== undefined) dataToUpdate.categoryCode = updateData.categoryCode;
  if (updateData?.productName !== undefined) dataToUpdate.productName = updateData.productName;
  if (updateData?.price !== undefined) dataToUpdate.price = updateData.price;
  if (updateData?.productUrl !== undefined) dataToUpdate.productUrl = updateData.productUrl;
  if (updateData?.productImageUrl !== undefined)
    dataToUpdate.productImageUrl = updateData.productImageUrl;
  if (updateData?.reason !== undefined) dataToUpdate.reason = updateData.reason;

  let newWaitUntil = null;
  if (updateData?.waitType) {
    newWaitUntil = calculateWaitUntil(updateData.waitType);
    dataToUpdate.waitUntil = newWaitUntil;
    dataToUpdate.waitType = WAIT_TYPE_MAP[updateData.waitType];
  }

  if (Object.keys(dataToUpdate).length === 0) {
    throw new HttpError(400, '수정할 값이 없습니다.', {
      errorCode: ERROR_CODES.WISH4001,
    });
  }

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.wishlistItem.update({
      where: { id: existing.id },
      data: dataToUpdate,
    });
    if (newWaitUntil) {
      const productName = dataToUpdate.productName ?? existing.productName;

      await tx.notification.updateMany({
        where: {
          wishlistItemId: existing.id,
          notificationType: 'TEMPTATION',
          notifyAt: { gt: new Date() },
        },
        data: {
          notifyAt: newWaitUntil,
          body: `'${productName}' 대기 시간이 끝났어요. 아직도 사고 싶으신가요?`,
        },
      });
    }
    return updated;
  });
};

export const deleteWishlistItem = async (userId, validatedParams) => {
  const item = await getValidatedItem(userId, validatedParams);

  return await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({
      where: {
        wishlistItemId: item.id,
        notifyAt: { gt: new Date() },
      },
    });
    return await tx.wishlistItem.delete({ where: { id: item.id } });
  });
};
