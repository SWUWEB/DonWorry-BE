import { z } from 'zod';

export const consumptionReportDetailDto = z.object({
  query: z.object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month은 YYYY-MM 형식이어야 합니다.')
      .optional(),
  }),
});
