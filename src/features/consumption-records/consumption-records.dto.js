import { z } from 'zod';

export const consumptionRecordIdDto = z.object({
  params: z.object({ consumptionRecordId: z.coerce.bigint().positive() }),
});

export const createConsumptionRecordDto = z.object({
  body: z.object({
    type: z.enum(['CONSUMED', 'SKIPPED']),
    productName: z.string().min(1).max(255),
    price: z.coerce.number().min(0),
    productUrl: z.string().url().optional(),
    reason: z.string().max(255).optional(),
    occurredAt: z.string().optional(),
    riskScore: z.number().min(0).max(100).optional(),
    workHoursNeeded: z.number().min(0).optional(),
    category_code: z.string().max(50).optional(),
    category_label: z.string().max(50).optional(),
    interventionAnswers: z
      .array(z.object({ questionId: z.coerce.bigint().positive(), answerValue: z.boolean() }))
      .optional(),
  }),
});

export const updateConsumptionRecordDto = consumptionRecordIdDto.extend({
  body: createConsumptionRecordDto.shape.body.partial(),
});
