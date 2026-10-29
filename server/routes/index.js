const express = require('express');

const { requireAuth } = require('../middleware/auth');
const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const studentRoutes = require('./students');
const facultyRoutes = require('./faculty');
const classRoutes = require('./classes');
const attendanceRoutes = require('./attendance');
const auditRoutes = require('./audit');
const reportRoutes = require('./reports');

const router = express.Router();

/**
 * Mount table. Every sub-router applies `requireAuth` to its own routes and
 * `requireRole` per endpoint; `/api/auth/login` is the single public route.
 */
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/students', studentRoutes);
router.use('/faculty', facultyRoutes);
router.use('/classes', classRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/audit', auditRoutes);
router.use('/reports', reportRoutes);

/**
 * Institution policy the UI needs to label and format things consistently with
 * the server: time zone for timestamps, and every threshold (handbook §2).
 */
router.get('/policy', requireAuth, (req, res) => {
  const policy = require('../config/policy');
  res.json({
    data: {
      timeZone: policy.TIME_ZONE,
      sessionWarningRate: policy.SESSION_WARNING_RATE,
      studentRiskRate: policy.STUDENT_RISK_RATE,
      riskMinUnexcusedAbsences: policy.RISK_MIN_UNEXCUSED_ABSENCES,
      excludeExcusedFromDenominator: policy.EXCLUDE_EXCUSED_FROM_DENOMINATOR,
      retentionDays: policy.RETENTION_DAYS,
      overdueAfterHours: policy.OVERDUE_AFTER_HOURS,
      qrRotationSeconds: policy.QR_ROTATION_SECONDS,
      facultyImportEnabled: policy.FACULTY_IMPORT_ENABLED,
    },
  });
});

/** Machine-readable permission matrix, handy for audits and client hints. */
router.get('/permissions', requireAuth, (req, res) => {
  res.json({
    matrix: [
      { method: 'POST', path: '/api/students', roles: ['admin'] },
      { method: 'GET', path: '/api/students', roles: ['admin'] },
      { method: 'PUT', path: '/api/students/:id', roles: ['admin'] },
      { method: 'DELETE', path: '/api/students/:id', roles: ['admin'] },
      {
        method: 'GET',
        path: '/api/students/:id/attendance',
        roles: ['admin', 'faculty', 'student'],
        notes: 'faculty: own classes only; student: own record only',
      },
      { method: 'GET', path: '/api/faculty', roles: ['admin'] },
      { method: 'POST', path: '/api/faculty', roles: ['admin'] },
      { method: 'PUT', path: '/api/faculty/:id', roles: ['admin'] },
      { method: 'DELETE', path: '/api/faculty/:id', roles: ['admin'] },
      { method: 'GET', path: '/api/classes', roles: ['admin'] },
      { method: 'POST', path: '/api/classes', roles: ['admin'] },
      { method: 'PUT', path: '/api/classes/:id', roles: ['admin'] },
      { method: 'PUT', path: '/api/classes/:id/assign-faculty', roles: ['admin'] },
      { method: 'DELETE', path: '/api/classes/:id', roles: ['admin'], notes: 'archives; history retained' },
      { method: 'POST', path: '/api/classes/:id/restore', roles: ['admin'] },
      { method: 'GET', path: '/api/audit', roles: ['admin'] },
      { method: 'GET', path: '/api/reports/sessions|students|records', roles: ['admin', 'faculty'], notes: 'faculty: own classes only; ?format=csv exports' },
      { method: 'GET', path: '/api/audit/submissions', roles: ['admin'] },
      { method: 'GET', path: '/api/audit/:id', roles: ['admin'] },
      { method: 'GET', path: '/api/admin/stats', roles: ['admin'] },
      {
        method: 'POST',
        path: '/api/classes/:id/enroll',
        roles: ['admin', 'student'],
        notes: 'student: self only; admin: must name a studentId',
      },
      { method: 'POST', path: '/api/classes/:id/unenroll', roles: ['admin', 'student'] },
      { method: 'GET', path: '/api/classes/mine', roles: ['admin', 'faculty', 'student'] },
      { method: 'GET', path: '/api/classes/available', roles: ['admin', 'student'] },
      { method: 'GET', path: '/api/classes/:id/students', roles: ['admin', 'faculty'] },
      { method: 'POST', path: '/api/attendance/mark', roles: ['admin', 'faculty'] },
      { method: 'GET', path: '/api/attendance/my', roles: ['student'] },
      { method: 'GET', path: '/api/attendance/overview', roles: ['admin'] },
      { method: 'GET', path: '/api/attendance/class/:id', roles: ['admin', 'faculty'] },
    ],
  });
});

module.exports = router;
