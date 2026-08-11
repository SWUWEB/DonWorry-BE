import { z } from 'zod';

export const parseProductUrlDto = z.object({
  body: z.object({
    productUrl: z
      .string()
      .url()
      .regex(/^https?:\/\/.+/i, {
        message: 'productUrl must start with http:// or https://',
      }),
  }),
});
