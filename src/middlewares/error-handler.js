import { ZodError } from 'zod';
import { ERROR_CODES } from '../config/error-codes.js';

export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      code: ERROR_CODES.COMMON4001,
      message: 'Invalid request',
      errors: err.flatten(),
    });
  }

  const statusCode = err.statusCode ?? 500;
  return res.status(statusCode).json({
    success: false,
    code: err.errorCode,
    message: statusCode === 500 ? 'Internal server error' : err.message,
    details: process.env.NODE_ENV === 'development' ? err.details : undefined,
  });
};
