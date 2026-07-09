import { HttpError } from '../../utils/http-error.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { prisma } from '../../prisma/client.js';

const resolveOccurredAt = (occurredAt) => {
  if (!occurredAt) return new Date();
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'occurredAt must be a valid date string.', {
      errorCode: ERROR_CODES.CONSUMPTION_RECORD4001,
    });
  }
  return date;
};

export const createConsumptionRecord = async ({ userId, data }) => {
  const {
    type,
    productName,
    price,
    productUrl,
    reason,
    occurredAt,
    riskScore,
    workHoursNeeded,
    category_code,
    category_label,
    interventionAnswers,
  } = data;

  const occurred = resolveOccurredAt(occurredAt);

  const toCreate = {
    userId: typeof userId === 'bigint' ? userId : BigInt(userId),
    type,
    productName,
    price: typeof price === 'number' ? price : null,
    productUrl: productUrl ?? null,
    reason: reason ?? null,
    occurredAt: occurred,
    urlParseSuccess: false,
    riskScore: typeof riskScore === 'number' ? riskScore : null,
    workHoursNeeded: typeof workHoursNeeded === 'number' ? workHoursNeeded : null,
    categoryCode: category_code ? String(category_code) : null,
    categoryLabel: category_label ?? null,
  };

  const answersData = Array.isArray(interventionAnswers)
    ? interventionAnswers.map((a) => ({
        questionId: BigInt(a.questionId),
        answerValue: a.answerValue,
      }))
    : [];

  const record = await prisma.$transaction(async (tx) => {
    const createdRecord = await tx.consumptionRecord.create({
      data: toCreate,
    });

    if (answersData.length > 0) {
      await tx.interventionAnswer.createMany({
        data: answersData.map((a) => ({
          recordId: createdRecord.id,
          questionId: a.questionId,
          answerValue: a.answerValue,
        })),
      });
    }

    return createdRecord;
  });

  return record;
};

// follow project style: named exports (no default export)
