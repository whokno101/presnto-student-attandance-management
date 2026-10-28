const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/** Escapes user input before it is used inside a RegExp. */
const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Normalizes ?page, ?limit and ?search into safe, bounded values.
 * @returns {{ page: number, limit: number, search: string, skip: number }}
 */
const parsePagination = (query = {}) => {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';

  return { page, limit, search, skip: (page - 1) * limit };
};

/** Standard pagination envelope returned by every list endpoint. */
const buildPagination = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

module.exports = { parsePagination, buildPagination, escapeRegex, DEFAULT_LIMIT, MAX_LIMIT };
