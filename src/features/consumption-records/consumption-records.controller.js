import { ERROR_CODES } from '../../config/error-codes.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { HttpError } from '../../utils/http-error.js';
import { created, notImplemented, ok } from '../../utils/api-response.js';
import {
  createConsumptionRecord,
  deleteConsumptionRecord,
  getConsumptionRecord,
  listConsumptionRecords,
  updateConsumptionRecord,
} from './consumption-records.service.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

const getAuthenticatedUserId = (req) => {
  const userId = req.user?.userId ?? req.user?.id ?? req.user?.user_id;
  if (!userId) return null;
  return typeof userId === 'string' ? BigInt(userId) : userId;
};

const serializeConsumptionRecord = (record) => ({
  id: record.id?.toString ? record.id.toString() : record.id,
  type: record.type,
  productName: record.productName,
  price: record.price !== null && record.price !== undefined ? Number(record.price) : null,
  productUrl: record.productUrl,
  reason: record.reason,
  riskScore: record.riskScore,
  workHoursNeeded:
    record.workHoursNeeded !== null && record.workHoursNeeded !== undefined
      ? Number(record.workHoursNeeded)
      : null,
  categoryCode: record.categoryCode,
  categoryLabel: record.categoryLabel,
  occurredAt: record.occurredAt ? new Date(record.occurredAt).toISOString() : null,
  createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : undefined,
  updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : undefined,
  interventionAnswers: Array.isArray(record.interventionAnswers)
    ? record.interventionAnswers.map((answer) => ({
        id: answer.id?.toString ? answer.id.toString() : answer.id,
        questionId: answer.questionId?.toString ? answer.questionId.toString() : answer.questionId,
        answerValue: answer.answerValue,
        questionText: answer.question?.questionText,
      }))
    : undefined,
  recentCategoryConsumptionCount: record.recentCategoryConsumptionCount,
  recentCategoryConsumptions: Array.isArray(record.recentCategoryConsumptions)
    ? record.recentCategoryConsumptions.map(serializeConsumptionRecord)
    : undefined,
});

const consumptionHandler = (handler) =>
  asyncHandler(async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      if (error instanceof HttpError) throw error;

      throw new HttpError(500, 'Internal server error', {
        errorCode: ERROR_CODES.CONSUMPTION_RECORD5001,
      });
    }
  });

export const createConsumptionRecordController = consumptionHandler(async (req, res) => {
  const record = await createConsumptionRecord({
    userId: getAuthenticatedUserId(req),
    data: req.validated.body,
  });

  return created(res, serializeConsumptionRecord(record), '?뚮퉬 湲곕줉 ?앹꽦???깃났?덉뒿?덈떎.');
});

export const listConsumptionRecordsController = consumptionHandler(async (req, res) => {
  const records = await listConsumptionRecords({
    userId: getAuthenticatedUserId(req),
    type: req.validated.query.type,
  });

  return ok(res, records.map(serializeConsumptionRecord));
});

export const getConsumptionRecordController = consumptionHandler(async (req, res) => {
  const record = await getConsumptionRecord({
    userId: getAuthenticatedUserId(req),
    consumptionRecordId: req.validated.params.consumptionRecordId,
  });

  return ok(res, serializeConsumptionRecord(record));
});

export const updateConsumptionRecordController = consumptionHandler(async (req, res) => {
  const record = await updateConsumptionRecord({
    userId: getAuthenticatedUserId(req),
    consumptionRecordId: req.validated.params.consumptionRecordId,
    data: req.validated.body,
  });

  return ok(res, serializeConsumptionRecord(record));
});

export const deleteConsumptionRecordController = consumptionHandler(async (req, res) => {
  await deleteConsumptionRecord({
    userId: getAuthenticatedUserId(req),
    consumptionRecordId: req.validated.params.consumptionRecordId,
  });

  return ok(res, null);
});
