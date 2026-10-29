const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const analyticsService = require('../services/analytics.service');

const router = express.Router();

/* ------------------------------------------------------------------ *
 *   GET /api/analytics/admin    admin    PB-12 (aggregate only)
 *   GET /api/analytics/faculty  faculty (own classes) | admin (any)  PB-16
 *   Filters: ?timeframe=week|month|quarter|all|custom &from &to
 *            &classId &department &semester &facultyId (admin)
 * ------------------------------------------------------------------ */

router.use(requireAuth);

router.get(
  '/admin',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json(await analyticsService.admin(req.user, req.query));
  })
);

router.get(
  '/faculty',
  requireRole('admin', 'faculty'),
  asyncHandler(async (req, res) => {
    res.json(await analyticsService.faculty(req.user, req.query));
  })
);

module.exports = router;
