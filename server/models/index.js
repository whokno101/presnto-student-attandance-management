/**
 * Single entry point for all models. Importing this file once guarantees every
 * schema is registered (important for `ref: 'Class'` style lazy resolution).
 */
const User = require('./User');
const Faculty = require('./Faculty');
const Student = require('./Student');
const Class = require('./Class');
const Attendance = require('./Attendance');
const AuditLog = require('./AuditLog');
const ClassSession = require('./ClassSession');
const RiskState = require('./RiskState');
const Notification = require('./Notification');
const Excuse = require('./Excuse');
const QrCheckin = require('./QrCheckin');

module.exports = {
  User,
  Faculty,
  Student,
  Class,
  Attendance,
  AuditLog,
  ClassSession,
  RiskState,
  Notification,
  Excuse,
  QrCheckin,
  ROLES: require('./User').ROLES,
  DAYS: require('./Class').DAYS,
  ATTENDANCE_STATUSES: require('./Attendance').STATUSES,
};
