import { z } from 'zod';

export const notificationIdDto = z.object({
  params: z.object({ notificationId: z.coerce.bigint().positive() }),
});
