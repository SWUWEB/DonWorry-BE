import { prisma } from '../../prisma/client.js';
import { HttpError } from '../../utils/http-error.js';
import { ERROR_CODES } from '../../config/error-codes.js';

const serializeNotification = (notification) => ({
  id: notification.id.toString(),
  notificationType: notification.notificationType,
  isRead: notification.isRead,
  readAt: notification.readAt,
  wishlistItemId: notification.wishlistItemId ? notification.wishlistItemId.toString() : null,
  createdAt: notification.createdAt,
});

const buildOrderBy = (sort) => {
  if (sort === 'OLDEST') return [{ createdAt: 'asc' }, { id: 'asc' }];
  if (sort === 'UNREAD_FIRST') return [{ isRead: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }];
  return [{ createdAt: 'desc' }, { id: 'desc' }];
};

export const listNotifications = async (userId, query) => {
  const where = { userId };

  if (query.type !== 'ALL') {
    where.notificationType = query.type;
  }
  const notifications = await prisma.notification.findMany({
    where,
    orderBy: buildOrderBy(query.sort),
    select: {
      id: true,
      notificationType: true,
      isRead: true,
      readAt: true,
      wishlistItemId: true,
      createdAt: true,
    },
  });
  return notifications.map(serializeNotification);
};

export const markNotificationRead = async (userId, notificationId) => {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  if (result.count > 0) return;

  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select: { id: true },
  });
  if (!notification) {
    throw new HttpError(404, '요청한 알림을 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.NOTIFICATION4041,
    });
  }
};

export const markAllNotificationsRead = async (userId) => {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
};
