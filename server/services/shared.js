const { ApiError } = require('../utils/apiError');

/**
 * Throws 409 DUPLICATE_KEY when `field: value` already exists.
 * A pre-check gives a precise, user-facing message instead of Mongo's raw
 * E11000 text; the unique index remains the final guarantee.
 *
 * @param {{ model: import('mongoose').Model, field: string, value: unknown, message: string, excludeId?: string, fieldLabel?: string }} options
 */
const assertUnique = async ({ model, field, value, message, excludeId, fieldLabel }) => {
  if (value === undefined || value === null || value === '') return;

  const query = { [field]: value };
  if (excludeId) query._id = { $ne: excludeId };

  const exists = await model.exists(query);
  if (exists) {
    throw ApiError.duplicate(message, [{ field: fieldLabel || field, message }]);
  }
};

module.exports = { assertUnique };
