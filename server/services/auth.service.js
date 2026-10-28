const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const { ApiError, CODES } = require('../utils/apiError');
const { signToken } = require('../utils/jwt');

/**
 * Shapes the user object returned to the client. Never contains the hash.
 * `profileId` is the Faculty/Student document id, which the UI needs to build
 * "my classes" / "my attendance" links without an extra round trip.
 */
const buildSessionUser = async (user) => {
  const base = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };

  if (user.role === 'faculty') {
    const profile = await Faculty.findOne({ user: user._id }).select('_id department employeeId');
    return {
      ...base,
      profileId: profile ? String(profile._id) : null,
      department: profile?.department ?? null,
      employeeId: profile?.employeeId ?? null,
    };
  }

  if (user.role === 'student') {
    const profile = await Student.findOne({ user: user._id }).select('_id department studentId');
    return {
      ...base,
      profileId: profile ? String(profile._id) : null,
      department: profile?.department ?? null,
      studentId: profile?.studentId ?? null,
    };
  }

  return { ...base, profileId: null };
};

/**
 * Verifies credentials with bcrypt and issues a JWT.
 * Deliberately returns the same INVALID_CREDENTIALS error for "unknown email"
 * and "wrong password" so accounts cannot be enumerated.
 */
const login = async (email, password) => {
  if (!email || !password) {
    throw ApiError.validation('Email and password are required');
  }

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+passwordHash');

  if (!user) {
    throw ApiError.unauthorized(CODES.INVALID_CREDENTIALS, 'Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw ApiError.unauthorized(CODES.INVALID_CREDENTIALS, 'Invalid email or password');
  }

  if (!user.isActive) {
    throw ApiError.unauthorized(CODES.ACCOUNT_INACTIVE, 'This account has been deactivated');
  }

  const token = signToken(user);
  const sessionUser = await buildSessionUser(user);

  return { token, user: sessionUser };
};

module.exports = { login, buildSessionUser };
