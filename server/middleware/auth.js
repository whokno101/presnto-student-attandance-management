const User = require('../models/User');
const { ApiError, CODES } = require('../utils/apiError');
const { verifyToken } = require('../utils/jwt');

/** Extracts the raw token from `Authorization: Bearer <token>`. */
const extractBearerToken = (req) => {
  const header = req.headers.authorization || '';
  if (!header) return null;

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (!/^Bearer$/i.test(scheme) || rest.length !== 1) return null;
  return rest[0];
};

/**
 * requireAuth
 *  1. verifies the Bearer token signature + expiry
 *  2. reloads the user from MongoDB (never trusts the token's role claim)
 *  3. rejects deactivated accounts on the *next* request
 *  4. attaches req.user = { id, role, name }
 */
const requireAuth = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw ApiError.unauthorized(CODES.TOKEN_INVALID, 'Authorization header with a Bearer token is required');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw ApiError.unauthorized(CODES.TOKEN_EXPIRED, 'Your session has expired, please sign in again');
      }
      throw ApiError.unauthorized(CODES.TOKEN_INVALID, 'Invalid authentication token');
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      throw ApiError.unauthorized(CODES.TOKEN_INVALID, 'The account for this token no longer exists');
    }

    if (!user.isActive) {
      throw ApiError.unauthorized(CODES.ACCOUNT_INACTIVE, 'This account has been deactivated');
    }

    req.user = {
      id: String(user._id),
      role: user.role,
      name: user.name,
    };
    req.userDoc = user;

    return next();
  } catch (err) {
    return next(err);
  }
};

const isDestructive = (req) => req.method === 'DELETE' || /\/(archive|restore)(\/|$)/.test(req.path);

/**
 * requireRole('admin') / requireRole('admin', 'faculty') / requireRole(['admin'])
 * Must be mounted after requireAuth. Wrong role -> 403 FORBIDDEN.
 */
const requireRole = (...roles) => {
  const allowed = roles.flat();

  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized(CODES.TOKEN_INVALID, 'Authentication is required'));
    }

    if (!allowed.includes(req.user.role)) {
      // Rejected destructive attempts are part of the audit trail (PB-14).
      if (isDestructive(req)) {
        require('../services/audit.service').record({
          actor: req.user,
          action: 'destructive.denied',
          outcome: 'denied',
          summary: `Denied ${req.method} ${req.originalUrl.split('?')[0]} for a ${req.user.role} account`,
          meta: { method: req.method, path: req.originalUrl.split('?')[0] },
        });
      }
      return next(
        ApiError.forbidden(`This action requires one of the following roles: ${allowed.join(', ')}`)
      );
    }

    return next();
  };
};

module.exports = { requireAuth, requireRole, extractBearerToken };
