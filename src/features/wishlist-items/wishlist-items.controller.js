import { notImplemented } from '../../utils/api-response.js';
import * as wishlistItemsService from './wishlist-items.service.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

// 💡 임시 사용자 ID 설정 (BigInt형)
const MOCK_USER_ID = 1n;

/**
 * 💡 팀 노션 가이드라인 반영: BigInt 직렬화 변환 함수 (Serializer)
 * Prisma 객체에서 BigInt 타입인 id와 userId를 문자열로 안전하게 변환합니다.
 */
const serializeWishlistItem = (item) => {
  if (!item) return null;
  return {
    ...item,
    id: item.id.toString(), // BigInt -> String 변환
    userId: item.userId.toString(), // BigInt -> String 변환
    // 만약 price도 BigInt로 설계되어 있다면 아래 주석을 해제하세요!
    price: item.price ? item.price.toString() : null,
  };
};

// 1. 위시리스트 추가
export const createItem = async (req, res, next) => {
  try {
    const itemData = req.body;
    const newItem = await wishlistItemsService.createWishlistItem(MOCK_USER_ID, itemData);

    // 💡 변환 함수를 거쳐서 응답을 보냅니다.
    return res.status(201).json({
      success: true,
      data: serializeWishlistItem(newItem),
    });
  } catch (error) {
    next(error);
  }
};

// 2. 위시리스트 목록 조회
export const getItems = async (req, res, next) => {
  try {
    const items = await wishlistItemsService.getWishlistItems(MOCK_USER_ID);

    // 💡 배열 내부의 모든 아이템을 하나씩 변환(map)해서 보냅니다.
    return res.status(200).json({
      success: true,
      data: items.map(serializeWishlistItem),
    });
  } catch (error) {
    next(error);
  }
};

// 3. 위시리스트 상세 조회
export const getItemById = async (req, res, next) => {
  try {
    const { wishlistId } = req.params;
    const item = await wishlistItemsService.getWishlistItemById(MOCK_USER_ID, wishlistId);

    return res.status(200).json({
      success: true,
      data: serializeWishlistItem(item),
    });
  } catch (error) {
    next(error);
  }
};

// 4. 위시리스트 수정
export const updateItem = async (req, res, next) => {
  try {
    const { wishlistId } = req.params;
    const updateData = req.body;
    const updatedItem = await wishlistItemsService.updateWishlistItem(
      MOCK_USER_ID,
      wishlistId,
      updateData,
    );

    return res.status(200).json({
      success: true,
      data: serializeWishlistItem(updatedItem),
    });
  } catch (error) {
    next(error);
  }
};

// 5. 위시리스트 삭제
export const deleteItem = async (req, res, next) => {
  try {
    const { wishlistId } = req.params;
    await wishlistItemsService.deleteWishlistItem(MOCK_USER_ID, wishlistId);

    return res.status(200).json({ success: true, message: '삭제 성공' });
  } catch (error) {
    next(error);
  }
};
