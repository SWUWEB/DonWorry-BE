import { z } from 'zod';
import { ERROR_CODES } from '../../config/error-codes.js';
import { CATEGORY_CODE_SET } from '../../config/categories.js';

export const consumptionRecordIdDto = z.object({
  params: z.object({ consumptionRecordId: z.coerce.bigint().positive() }),
});

export const listConsumptionRecordsDto = z.object({
  query: z.object({
    type: z.enum(['ALL', 'CONSUMED', 'SKIPPED']).default('ALL'),
  }),
});

const isValidIsoDatetime = (value) => {
  const match =
    /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]+)?(Z|([+-])([0-9]{2}):([0-9]{2}))$/.exec(
      value,
    );

  if (!match) return false;

  const [
    ,
    yearStr,
    monthStr,
    dayStr,
    hourStr,
    minuteStr,
    secondStr,
    timezone,
    ,
    offsetHourStr,
    offsetMinuteStr,
  ] = match;

  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return false;

  if (timezone !== 'Z') {
    const offsetHour = Number(offsetHourStr);
    const offsetMinute = Number(offsetMinuteStr);

    if (offsetHour > 14) return false;
    if (offsetMinute > 59) return false;
    if (offsetHour === 14 && offsetMinute !== 0) return false;
  }

  return true;
};

export const createConsumptionRecordDto = z.object({
  body: z.object({
    type: z.enum(['CONSUMED', 'SKIPPED']),
    productName: z.string().min(1).max(255),
    price: z.coerce.number().min(0),
    productUrl: z.string().url().optional(),
    reason: z.string().max(255).optional(),
    occurredAt: z
      .string()
      .optional()
      .refine(
        (v) =>
          v === undefined || (typeof v === 'string' && v.trim() !== '' && isValidIsoDatetime(v)),
        {
          message: 'occurredAt must be a non-empty ISO datetime string',
        },
      ),
    riskScore: z.number().int().min(0).max(5).optional(),
    workHoursNeeded: z.number().min(0).optional(),
    category_code: z
      .string()
      .max(50)
      .optional()
      .refine((v) => v === undefined || CATEGORY_CODE_SET.has(v), {
        message: 'Invalid category code',
      }),
    interventionAnswers: z
      .array(z.object({ questionId: z.coerce.bigint().positive(), answerValue: z.boolean() }))
      .optional()
      .superRefine((answers, ctx) => {
        if (!answers) return;
        const seen = new Set();
        answers.forEach((answer, index) => {
          const key = answer.questionId.toString();
          if (seen.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Duplicate questionId in interventionAnswers is not allowed.',
              path: [index, 'questionId'],
            });
          } else {
            seen.add(key);
          }
        });
      }),
  }),
});

export const validateConsumptionRecord = (dto) => (req, res, next) => {
  const result = dto.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  });
  if (result.success) {
    req.validated = result.data;
    return next();
  }

  // Determine specific consumption record error code
  const issues = result.error.issues;
  let code = ERROR_CODES.COMMON4001;
  let message = 'Invalid request';

  if (issues.some((i) => i.path && i.path[0] === 'body' && i.path[1] === 'occurredAt')) {
    code = ERROR_CODES.CONSUMPTION_RECORD4001;
    message = 'occurredAt은 유효한 ISO 8601 날짜/시간 문자열이어야 합니다.';
  } else if (issues.some((i) => i.path && i.path[0] === 'body' && i.path[1] === 'category_code')) {
    code = ERROR_CODES.CONSUMPTION_RECORD4002;
    message = '허용되지 않은 카테고리 코드입니다.';
  } else if (issues.some((i) => i.message && i.message.includes('Duplicate questionId'))) {
    code = ERROR_CODES.CONSUMPTION_RECORD4003;
    message = '동일한 질문에 대한 답변을 중복해서 등록할 수 없습니다.';
  } else if (
    issues.some((i) => i.path && i.path[0] === 'body' && i.path[1] === 'interventionAnswers')
  ) {
    code = ERROR_CODES.COMMON4001;
    message = 'interventionAnswers 형식이 올바르지 않습니다.';
  }

  return res.status(400).json({
    success: false,
    code,
    message,
    errors: result.error.flatten(),
  });
};

const updateConsumptionRecordBodyDto = createConsumptionRecordDto.shape.body
  .partial()
  .extend({
    productUrl: createConsumptionRecordDto.shape.body.shape.productUrl.optional().nullable(),
    reason: createConsumptionRecordDto.shape.body.shape.reason.optional().nullable(),
    riskScore: createConsumptionRecordDto.shape.body.shape.riskScore.optional().nullable(),
    workHoursNeeded: createConsumptionRecordDto.shape.body.shape.workHoursNeeded
      .optional()
      .nullable(),
    category_code: createConsumptionRecordDto.shape.body.shape.category_code.optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: '수정할 필드가 최소 1개 이상 필요합니다.',
  });

export const updateConsumptionRecordDto = consumptionRecordIdDto.extend({
  body: updateConsumptionRecordBodyDto,
});
