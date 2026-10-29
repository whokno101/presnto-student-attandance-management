const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Class = require('../models/Class');
const attendanceService = require('../services/attendance.service');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

/**
 * GET /api/admin/stats — dashboard tiles.
 * `todayAttendance` is `{ marked, attended, rate }` for today, or null when
 * nothing has been marked yet (the card renders an em dash).
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [students, faculty, classes, todayAttendance] = await Promise.all([
      Student.countDocuments(),
      Faculty.countDocuments(),
      Class.countDocuments({ archivedAt: null }),
      attendanceService.todayRate(),
    ]);

    res.json({
      data: {
        students,
        faculty,
        classes,
        todayAttendance,
      },
    });
  })
);

module.exports = router;
