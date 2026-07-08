import { asyncHandler } from '../../utils/async-handler.js';
import { createConsumptionRecord } from './consumption-records.service.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return res.status(501).json({
    isSuccess: false,
    status: 501,
    code: null,
    message: `${featureName} is not implemented yet`,
    result: null,
  });
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

  return res.status(201).json({
    isSuccess: true,
    status: 201,
    code: null,
    message: '소비 기록 생성에 성공했습니다.',
    result,
  });
});
