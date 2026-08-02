import { ok } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from './notifications.service.js';

export const listNotificationsController = asyncHandler(async (req, res) => {
  const result = await listNotifications(BigInt(req.user.userId), req.validated.query);
  return ok(res, result, '알림 목록 조회 성공');
});

export const markNotificationReadController = asyncHandler(async (req, res) => {
  await markNotificationRead(BigInt(req.user.userId), req.validated.params.notificationId);
  return ok(res, null, '알림 읽음 처리 성공');
});

export const markAllNotificationsReadController = asyncHandler(async (req, res) => {
  await markAllNotificationsRead(BigInt(req.user.userId));
  return ok(res, null, '알림 전체 읽음 처리 성공');
});
