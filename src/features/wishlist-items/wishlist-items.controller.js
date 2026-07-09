import { notImplemented } from '../../utils/api-response.js';
import * as wishlistItemsService from './wishlist-items.service.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

// BigInt 직렬화 변환 함수 (Serializer)
const serializeWishlistItem = (item) => {
  if (!item || !item.id) return null;
  return {
    ...item,
    id: item.id.toString(),
    userId: item.userId.toString(),
    price: item.price ? item.price.toString() : null,
  };
};

// 1. 위시리스트 추가
export const createItem = async (req, res, next) => {
  try {
    const itemData = req.validated.body;
    const loggedInUserId = BigInt(req.user.userId); // 🎉 진짜 로그인 사용자 ID 사용

    const newItem = await wishlistItemsService.createWishlistItem(loggedInUserId, itemData);

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
    const loggedInUserId = BigInt(req.user.userId); // 🎉 진짜 로그인 사용자 ID 사용
    const items = await wishlistItemsService.getWishlistItems(loggedInUserId);

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
    const loggedInUserId = BigInt(req.user.userId); // 🎉 진짜 로그인 사용자 ID 사용
    const item = await wishlistItemsService.getWishlistItemById(loggedInUserId, wishlistId);

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
    const updateData = req.validated.body; // 🔒 CodeRabbit 리뷰 반영 (req.body -> req.validated)
    const loggedInUserId = BigInt(req.user.userId); // 🎉 진짜 로그인 사용자 ID 사용

    const updatedItem = await wishlistItemsService.updateWishlistItem(
      loggedInUserId,
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
    const loggedInUserId = BigInt(req.user.userId); // 🎉 진짜 로그인 사용자 ID 사용
    await wishlistItemsService.deleteWishlistItem(loggedInUserId, wishlistId);

    return res.status(200).json({ success: true, message: '삭제 성공' });
  } catch (error) {
    next(error);
  }
};
