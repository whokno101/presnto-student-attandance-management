const path = require('path');
const dotenv = require('dotenv');

// Load the root .env first, then fall back to server/.env if present.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, './.env'), override: false });

/**
 * IANA zone that defines the institution's calendar day ("today", future-date
 * checks). Defaults to the server machine's zone; an invalid value falls back
 * to it with a warning instead of crashing every date calculation.
 */
const resolveTimeZone = (value) => {
  const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  if (!value) return systemZone;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return value;
  } catch {
    console.warn(`Invalid INSTITUTION_TIME_ZONE "${value}", using ${systemZone}`);
    return systemZone;
  }
};

module.exports = {
  port: process.env.PORT || 5001,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/university-attendance',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  timeZone: resolveTimeZone(process.env.INSTITUTION_TIME_ZONE),
};
