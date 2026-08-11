import { notImplemented, ok } from '../../utils/api-response.js';
import { getConsumptionReportDetail } from './reports.service.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};

export const getConsumptionReportDetailController = async (req, res, next) => {
  try {
    const { month } = req.query;
    const data = await getConsumptionReportDetail({ userId: BigInt(req.user.userId), month });
    return ok(res, data, '상세 소비 분석 리포트 조회에 성공했습니다.');
  } catch (err) {
    next(err);
  }
};
