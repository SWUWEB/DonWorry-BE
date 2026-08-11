import { ok } from '../../utils/api-response.js';
import { parseProductUrl } from './product-url.service.js';

export const parseProductUrlController = async (req, res) => {
  const result = await parseProductUrl(req.validated.body);
  return ok(res, result, 'url 파싱에 성공했습니다.');
};
