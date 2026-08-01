import { z } from 'zod';

export const notificationIdDto = z.object({
  params: z.object({ notificationId: z.coerce.bigint().positive() }),
});

export const listNotificationsDto = z.object({
  query: z.object({
    type: z.enum(['ALL', 'GENERAL', 'GOAL', 'TEMPTATION']).default('ALL'),
    sort: z.enum(['LATEST', 'OLDEST', 'UNREAD_FIRST']).default('LATEST'),
  }),
});
