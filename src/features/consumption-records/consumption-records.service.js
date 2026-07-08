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

  // create consumption record
  const record = await prisma.consumptionRecord.create({
    data: toCreate,
  });

  // create intervention answers if provided
  if (Array.isArray(interventionAnswers) && interventionAnswers.length > 0) {
    const answersData = interventionAnswers.map((a) => ({
      recordId: record.id,
      questionId: BigInt(a.questionId),
      answerValue: a.answerValue,
    }));

    // use a transaction to insert answers
    await prisma.$transaction(
      answersData.map((a) => prisma.interventionAnswer.create({ data: a })),
    );
  }

  return record;
};

// follow project style: named exports (no default export)
