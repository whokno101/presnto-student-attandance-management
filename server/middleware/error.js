const mongoose = require('mongoose');
const { ApiError, CODES } = require('../utils/apiError');

/** 404 for anything that fell through the router stack. */
const notFound = (req, res, next) => {
  next(new ApiError(404, CODES.NOT_FOUND, `Route ${req.method} ${req.originalUrl} not found`));
};

const DUPLICATE_FIELD_MESSAGES = {
  email: 'That email address is already registered',
  employeeId: 'That employee ID is already in use',
  studentId: 'That student ID is already in use',
  code: 'That class code is already in use',
};

/**
 * Single place that converts thrown errors into the public contract:
 *   { error: { code, message, details? } }
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.statusCode || 500;
  let code = err.code || CODES.INTERNAL_ERROR;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    code = CODES.VALIDATION_ERROR;
    details = Object.entries(err.errors).map(([field, e]) => ({ field, message: e.message }));
    message = details.map((d) => d.message).join('; ');
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = CODES.VALIDATION_ERROR;
    message = `Invalid value for "${err.path}"`;
    details = [{ field: err.path, message }];
  } else if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || err.keyPattern || {});
    status = 409;
    code = CODES.DUPLICATE_KEY;
    message = DUPLICATE_FIELD_MESSAGES[fields[0]] || `Duplicate value for: ${fields.join(', ')}`;
    details = fields.map((field) => ({ field, message }));
  } else if (err instanceof SyntaxError && 'body' in err) {
    status = 400;
    code = CODES.VALIDATION_ERROR;
    message = 'Malformed JSON body';
  }

  // Only unexpected failures deserve a stack trace; 4xx and 501 placeholders are
  // part of normal operation.
  const unexpected = status >= 500 && code === CODES.INTERNAL_ERROR;
  if (unexpected) {
    console.error(err);
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(details?.length ? { details } : {}),
      ...(unexpected && process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
  });
};

module.exports = { notFound, errorHandler };
