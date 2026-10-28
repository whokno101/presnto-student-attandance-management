/**
 * Error codes are part of the public API contract: the client keys its
 * behaviour off `code`, never off the human-readable message.
 *
 * Every error response has the shape:
 *   { error: { code, message, details? } }
 */
const CODES = {
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_KEY: 'DUPLICATE_KEY',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

class ApiError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} code
   * @param {string} message
   * @param {Array<{field: string, message: string}>} [details] field-level errors
   */
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static unauthorized(code, message) {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, CODES.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, CODES.NOT_FOUND, message);
  }

  static validation(message = 'Invalid request payload', details) {
    return new ApiError(400, CODES.VALIDATION_ERROR, message, details);
  }

  static duplicate(message, details) {
    return new ApiError(409, CODES.DUPLICATE_KEY, message, details);
  }

  /** The request was valid but clashes with current state (full class, already enrolled). */
  static conflict(message, details) {
    return new ApiError(409, CODES.CONFLICT, message, details);
  }
}

module.exports = { ApiError, CODES };
