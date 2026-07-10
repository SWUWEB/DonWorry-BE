import { asyncHandler } from '../../utils/async-handler.js';
import { createConsumptionRecord } from './consumption-records.service.js';
import { notImplemented, created } from '../../utils/api-response.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

export const createConsumptionRecordController = asyncHandler(async (req, res) => {
  const userId = req.user?.userId ?? req.user?.id ?? req.user?.user_id;
  if (!userId) {
    return res.status(401).json({
      isSuccess: false,
      status: 401,
      code: null,
      message: 'Authentication required',
      result: null,
    });
  }

  const record = await createConsumptionRecord({
    userId: typeof userId === 'string' ? BigInt(userId) : userId,
    data: req.validated.body,
  });

  const result = {
    id: record.id?.toString ? record.id.toString() : record.id,
    type: record.type,
    productName: record.productName,
    price: record.price !== null && record.price !== undefined ? Number(record.price) : null,
    occurredAt: record.occurredAt ? new Date(record.occurredAt).toISOString() : null,
  };

  return created(res, result, '소비 기록 생성에 성공했습니다.');
});
