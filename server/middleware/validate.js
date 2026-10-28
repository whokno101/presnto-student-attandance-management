const { ApiError } = require('../utils/apiError');

/**
 * Zod-backed body validation.
 *
 * On success `req.body` is replaced with the parsed (trimmed/coerced) object so
 * handlers never deal with raw input. On failure it throws a 400 whose `details`
 * array maps 1:1 onto form fields.
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));

    return next(ApiError.validation(details[0]?.message || 'Invalid request payload', details));
  }

  req.body = result.data;
  return next();
};

module.exports = validate;
