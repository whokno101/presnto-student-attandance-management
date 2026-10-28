const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpiresIn } = require('../config/env');

/**
 * Token payload is intentionally minimal: { userId, role }.
 * Role in the token is a *hint* only — requireAuth always reloads the user from
 * MongoDB so a role change or deactivation takes effect on the next request.
 */
const signToken = (user, options = {}) =>
  jwt.sign({ userId: String(user._id), role: user.role }, jwtSecret, {
    expiresIn: options.expiresIn || jwtExpiresIn,
  });

const verifyToken = (token) => jwt.verify(token, jwtSecret);

module.exports = { signToken, verifyToken };
