export class HttpError extends Error {
  constructor(statusCode, message, { errorCode, details } = {}) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}
