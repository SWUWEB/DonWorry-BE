import { notImplemented } from '../../utils/api-response.js';
import * as wishlistItemsService from './wishlist-items.service.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

/**
 * Prisma 모델의 BigInt 필드를 JSON 직렬화가 가능한 문자열로 변환하는 유틸 함수
 * @param {Object} item - 변환할 위시리스트 아이템 객체
 * @returns {Object|null} 직렬화된 객체 또는 null
 */
const serializeWishlistItem = (item) => {
  if (!item || !item.id) return null;
  return {
    ...item,
    id: item.id.toString(),
    userId: item.userId.toString(),
    price: item.price ? item.price.toString() : null,
  };
};

export const createItem = async (req, res, next) => {
  try {
    const itemData = req.validated.body;
    const loggedInUserId = BigInt(req.user.userId);

    const newItem = await wishlistItemsService.createWishlistItem(loggedInUserId, itemData);

    return res.status(201).json({
      success: true,
      data: serializeWishlistItem(newItem),
    });
  } catch (error) {
    next(error);
  }
};

export const getItems = async (req, res, next) => {
  try {
    const loggedInUserId = BigInt(req.user.userId);
    const items = await wishlistItemsService.getWishlistItems(loggedInUserId);

    return res.status(200).json({
      success: true,
      data: items.map(serializeWishlistItem),
    });
  } catch (error) {
    next(error);
  }
};

export const getItemById = async (req, res, next) => {
  try {
    const { wishlistId } = req.params;
    const loggedInUserId = BigInt(req.user.userId);
    const item = await wishlistItemsService.getWishlistItemById(loggedInUserId, wishlistId);

    return res.status(200).json({
      success: true,
      data: serializeWishlistItem(item),
    });
  } catch (error) {
    next(error);
  }
};

export const updateItem = async (req, res, next) => {
  try {
    const { wishlistId } = req.params;
    const updateData = req.validated.body;
    const loggedInUserId = BigInt(req.user.userId);

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

export const deleteItem = async (req, res, next) => {
  try {
    const { wishlistId } = req.params;
    const loggedInUserId = BigInt(req.user.userId);
    await wishlistItemsService.deleteWishlistItem(loggedInUserId, wishlistId);

    return res.status(200).json({ success: true, message: '삭제 성공' });
  } catch (error) {
    next(error);
  }
};
