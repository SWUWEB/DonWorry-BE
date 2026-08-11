export class HttpError extends Error {
  constructor(
    statusCode,
    message,
    { errorCode, details, data, retryAfterSeconds, retryAt, rateLimitType } = {},
  ) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.data = data;
    this.retryAfterSeconds = retryAfterSeconds;
    this.retryAt = retryAt;
    this.rateLimitType = rateLimitType;
  }
}
