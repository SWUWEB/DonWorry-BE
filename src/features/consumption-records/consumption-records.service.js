import { HttpError } from '../../utils/http-error.js';
import { ERROR_CODES } from '../../config/error-codes.js';
import { CATEGORY_CODE_SET, CATEGORY_MAP } from '../../config/categories.js';
import { prisma } from '../../prisma/client.js';

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

const resolveOccurredAt = (occurredAt) => {
  if (!occurredAt) return new Date();
  if (typeof occurredAt !== 'string' || !isValidIsoDatetime(occurredAt)) {
    throw new HttpError(400, 'occurredAt은 유효한 ISO 8601 날짜/시간 문자열이어야 합니다.', {
      errorCode: ERROR_CODES.CONSUMPTION_RECORD4001,
    });
  }

  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'occurredAt은 유효한 ISO 8601 날짜/시간 문자열이어야 합니다.', {
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
    interventionAnswers,
  } = data;

  const categoryLabel = category_code ? CATEGORY_MAP[category_code] : undefined;

  if (category_code && !CATEGORY_CODE_SET.has(category_code)) {
    throw new HttpError(400, '허용되지 않은 카테고리 코드입니다.', {
      errorCode: ERROR_CODES.CONSUMPTION_RECORD4002,
    });
  }

  const occurred = resolveOccurredAt(occurredAt);

  const answersData = Array.isArray(interventionAnswers)
    ? interventionAnswers.map((a) => ({
        questionId: BigInt(a.questionId),
        answerValue: a.answerValue,
      }))
    : [];

  if (answersData.length > 0) {
    const duplicates = answersData
      .map((answer) => answer.questionId.toString())
      .filter((value, index, array) => array.indexOf(value) !== index);

    if (duplicates.length > 0) {
      throw new HttpError(400, '동일한 질문에 대한 답변을 중복해서 등록할 수 없습니다.', {
        errorCode: ERROR_CODES.CONSUMPTION_RECORD4003,
      });
    }
  }

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
    categoryLabel: categoryLabel ?? null,
  };

  try {
    const record = await prisma.$transaction(async (tx) => {
      const questionIds = answersData.map((answer) => answer.questionId);

      if (questionIds.length > 0) {
        const uniqueQuestionIds = [...new Set(questionIds.map((id) => id.toString()))].map((id) =>
          BigInt(id),
        );

        const questions = await tx.interventionQuestion.findMany({
          where: { id: { in: uniqueQuestionIds }, isActive: true },
          select: { id: true },
        });

        if (questions.length !== uniqueQuestionIds.length) {
          throw new HttpError(404, '요청한 질문을 찾을 수 없습니다.', {
            errorCode: ERROR_CODES.CONSUMPTION_RECORD4042,
          });
        }
      }

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
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }

    throw new HttpError(500, 'Internal server error', {
      errorCode: ERROR_CODES.CONSUMPTION_RECORD5001,
    });
  }
};

const consumptionRecordInclude = {
  interventionAnswers: {
    include: {
      question: true,
    },
    orderBy: {
      id: 'asc',
    },
  },
};

const throwNotFound = () => {
  throw new HttpError(404, '요청한 소비 기록을 찾을 수 없습니다.', {
    errorCode: ERROR_CODES.CONSUMPTION_RECORD4041,
  });
};

const assertRecordOwner = (record, userId) => {
  if (!record || record.userId !== BigInt(userId)) throwNotFound();
};

const normalizeInterventionAnswers = (interventionAnswers) => {
  if (!Array.isArray(interventionAnswers)) return undefined;

  const answersData = interventionAnswers.map((answer) => ({
    questionId: BigInt(answer.questionId),
    answerValue: answer.answerValue,
  }));

  const seen = new Set();
  for (const answer of answersData) {
    const key = answer.questionId.toString();
    if (seen.has(key)) {
      throw new HttpError(400, '동일한 질문에 대한 답변을 중복해서 등록할 수 없습니다.', {
        errorCode: ERROR_CODES.CONSUMPTION_RECORD4003,
      });
    }
    seen.add(key);
  }

  return answersData;
};

const assertActiveQuestionsExist = async (tx, answersData) => {
  if (!answersData || answersData.length === 0) return;

  const uniqueQuestionIds = [
    ...new Set(answersData.map((answer) => answer.questionId.toString())),
  ].map((id) => BigInt(id));

  const questions = await tx.interventionQuestion.findMany({
    where: { id: { in: uniqueQuestionIds }, isActive: true },
    select: { id: true },
  });

  if (questions.length !== uniqueQuestionIds.length) {
    throw new HttpError(404, '요청한 질문을 찾을 수 없습니다.', {
      errorCode: ERROR_CODES.CONSUMPTION_RECORD4042,
    });
  }
};

const buildUpdateData = (data) => {
  const updateData = {};

  if (data.type !== undefined) updateData.type = data.type;
  if (data.productName !== undefined) updateData.productName = data.productName;
  if (data.price !== undefined) updateData.price = data.price;
  if (data.productUrl !== undefined) updateData.productUrl = data.productUrl;
  if (data.reason !== undefined) updateData.reason = data.reason;
  if (data.occurredAt !== undefined) updateData.occurredAt = resolveOccurredAt(data.occurredAt);
  if (data.riskScore !== undefined) updateData.riskScore = data.riskScore;
  if (data.workHoursNeeded !== undefined) updateData.workHoursNeeded = data.workHoursNeeded;

  if (data.category_code !== undefined) {
    if (data.category_code === null) {
      updateData.categoryCode = null;
      updateData.categoryLabel = null;
      return updateData;
    }
    if (!CATEGORY_CODE_SET.has(data.category_code)) {
      throw new HttpError(400, '허용되지 않은 카테고리 코드입니다.', {
        errorCode: ERROR_CODES.CONSUMPTION_RECORD4002,
      });
    }
    updateData.categoryCode = String(data.category_code);
    updateData.categoryLabel = CATEGORY_MAP[data.category_code];
  }

  return updateData;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const CONSUMPTION_HISTORY_DAYS = 28;

const getConsumptionHistoryRange = (now) => {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const startAt = new Date(
    Date.UTC(
      kstNow.getUTCFullYear(),
      kstNow.getUTCMonth(),
      kstNow.getUTCDate() - (CONSUMPTION_HISTORY_DAYS - 1),
    ) - KST_OFFSET_MS,
  );

  return { startAt, endAt: now };
};

export const listConsumptionRecords = async ({ userId, type = 'ALL', now = new Date() }) => {
  const { startAt, endAt } = getConsumptionHistoryRange(now);

  return prisma.consumptionRecord.findMany({
    where: {
      userId: BigInt(userId),
      occurredAt: {
        gte: startAt,
        lte: endAt,
      },
      ...(type === 'ALL' ? {} : { type }),
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  });
};

export const getConsumptionRecord = async ({ userId, consumptionRecordId, now = new Date() }) => {
  const record = await prisma.consumptionRecord.findUnique({
    where: { id: BigInt(consumptionRecordId) },
    include: consumptionRecordInclude,
  });

  assertRecordOwner(record, userId);

  if (!record.categoryCode) {
    return {
      ...record,
      recentCategoryConsumptionCount: 0,
      recentCategoryConsumptions: [],
    };
  }

  const { startAt, endAt } = getConsumptionHistoryRange(now);
  const recentCategoryConsumptions = await prisma.consumptionRecord.findMany({
    where: {
      userId: BigInt(userId),
      type: 'CONSUMED',
      categoryCode: record.categoryCode,
      occurredAt: {
        gte: startAt,
        lte: endAt,
      },
    },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  });

  return {
    ...record,
    recentCategoryConsumptionCount: recentCategoryConsumptions.length,
    recentCategoryConsumptions,
  };
};

export const updateConsumptionRecord = async ({ userId, consumptionRecordId, data }) => {
  const updateData = buildUpdateData(data);
  const answersData = normalizeInterventionAnswers(data.interventionAnswers);
  const where = { id: BigInt(consumptionRecordId), userId: BigInt(userId) };

  return prisma.$transaction(async (tx) => {
    await assertActiveQuestionsExist(tx, answersData);

    let updatedRecord;
    try {
      updatedRecord = await tx.consumptionRecord.update({
        where,
        data: updateData,
        include: consumptionRecordInclude,
      });
    } catch (error) {
      if (error?.code === 'P2025') {
        throwNotFound();
      }

      throw error;
    }

    if (answersData) {
      await tx.interventionAnswer.deleteMany({
        where: { recordId: BigInt(consumptionRecordId) },
      });

      if (answersData.length > 0) {
        await tx.interventionAnswer.createMany({
          data: answersData.map((answer) => ({
            recordId: BigInt(consumptionRecordId),
            questionId: answer.questionId,
            answerValue: answer.answerValue,
          })),
        });
      }
    }

    if (!updatedRecord?.id) return updatedRecord;

    return tx.consumptionRecord.findUnique({
      where: { id: BigInt(consumptionRecordId) },
      include: consumptionRecordInclude,
    });
  });
};

export const deleteConsumptionRecord = async ({ userId, consumptionRecordId }) => {
  const where = { id: BigInt(consumptionRecordId), userId: BigInt(userId) };

  try {
    await prisma.consumptionRecord.delete({ where });
  } catch (error) {
    if (error?.code === 'P2025') {
      throwNotFound();
    }

    throw error;
  }
};

// follow project style: named exports (no default export)
