import { ERROR_CODES } from '../config/error-codes.js';

export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  });

  if (!result.success) {
    return res.status(400).json({
      success: false,
      code: ERROR_CODES.COMMON4001,
      message: 'Invalid request',
      errors: result.error.flatten(),
    });
  }

  req.validated = result.data;
  return next();
};
