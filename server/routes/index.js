const express = require('express');

const { requireAuth } = require('../middleware/auth');
const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const studentRoutes = require('./students');
const facultyRoutes = require('./faculty');
const classRoutes = require('./classes');
const attendanceRoutes = require('./attendance');

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
      { method: 'DELETE', path: '/api/classes/:id', roles: ['admin'] },
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
