import { notImplemented } from '../../utils/api-response.js';

export const createNotImplementedController = (featureName) => (_req, res) => {
  return notImplemented(res, featureName);
};
