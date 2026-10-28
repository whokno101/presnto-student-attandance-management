/**
 * Single entry point for all models. Importing this file once guarantees every
 * schema is registered (important for `ref: 'Class'` style lazy resolution).
 */
const User = require('./User');
const Faculty = require('./Faculty');
const Student = require('./Student');
const Class = require('./Class');
const Attendance = require('./Attendance');

module.exports = {
  User,
  Faculty,
  Student,
  Class,
  Attendance,
  ROLES: require('./User').ROLES,
  DAYS: require('./Class').DAYS,
  ATTENDANCE_STATUSES: require('./Attendance').STATUSES,
};
