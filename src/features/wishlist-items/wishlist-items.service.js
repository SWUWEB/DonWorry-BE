import { prisma } from '../../prisma/client.js';

const WAIT_TYPE_MAP = {
  '1H': 'ONE_HOUR',
  '1D': 'ONE_DAY',
  '3D': 'THREE_DAYS',
  '1W': 'ONE_WEEK',
};

// 대기 시간 계산 유틸 함수
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

// 1. 아이템 생성
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

// 2. 목록 조회 (해당 유저의 대기중인 상품만)
export const getWishlistItems = async (userId) => {
  return await prisma.wishlistItem.findMany({
    where: {
      userId,
      status: 'WAITING',
    },
    orderBy: { createdAt: 'desc' },
  });
};

// 3. 단일 조회 및 소유권 검증 유틸
const getValidatedItem = async (userId, wishlistId) => {
  try {
    const item = await prisma.wishlistItem.findUnique({
      where: { id: BigInt(wishlistId) },
    });

    if (!item) {
      const error = new Error('해당 위시리스트 항목을 찾을 수 없습니다.');
      error.status = 404;
      error.statusCode = 404;
      throw error;
    }

    if (item.userId !== userId) {
      const error = new Error('접근 권한이 없습니다.');
      error.status = 403;
      error.statusCode = 403;
      throw error;
    }
    return item;
  } catch (err) {
    if (err.status || err.statusCode) throw err;

    if (err.code === 'P2025' || err.message.includes('not found') || err.message.includes('BigInt')) {
      const error = new Error('해당 위시리스트 항목을 찾을 수 없습니다.');
      error.status = 404;
      error.statusCode = 404;
      throw error;
    }
    throw err;
  }
};

// 상세 조회 외부 노출
export const getWishlistItemById = async (userId, wishlistId) => {
  return await getValidatedItem(userId, wishlistId);
};

// 4. 아이템 수정
export const updateWishlistItem = async (userId, wishlistId, updateData) => {
  await getValidatedItem(userId, wishlistId);

  const dataToUpdate = { ...updateData };

  if (updateData.waitType) {
    dataToUpdate.waitUntil = calculateWaitUntil(updateData.waitType);
    dataToUpdate.waitType = WAIT_TYPE_MAP[updateData.waitType];
  }

  return await prisma.wishlistItem.update({
    where: { id: BigInt(wishlistId) },
    data: dataToUpdate,
  });
};

// 5. 아이템 삭제
export const deleteWishlistItem = async (userId, wishlistId) => {
  await getValidatedItem(userId, wishlistId);

  return await prisma.wishlistItem.delete({
    where: { id: BigInt(wishlistId) },
  });
};