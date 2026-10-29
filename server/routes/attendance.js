const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { assertClassAccess } = require('../services/access.service');
const attendanceService = require('../services/attendance.service');
const { attendanceMarkSchema } = require('../validation/schemas');

const router = express.Router();

router.use(requireAuth);

/* ------------------------------------------------------------------ *
 *   POST /api/attendance/mark            admin | faculty (own classes)
 *   GET  /api/attendance/my              student only (own record)
 *   GET  /api/attendance/overview        admin only (all rates)
 *   GET  /api/attendance/class/:id       admin | faculty (own classes)
 *                                        ?date=YYYY-MM-DD (default: today)
 * ------------------------------------------------------------------ */

router.post(
  '/mark',
  requireRole('admin', 'faculty'),
  validate(attendanceMarkSchema),
  asyncHandler(async (req, res) => {
    // Ownership is enforced before anything is written: a faculty member may
    // only mark classes where class.faculty === their Faculty._id.
    const { classDoc } = await assertClassAccess(req.user, req.body.classId);

    const result = await attendanceService.mark({
      classDoc,
      date: req.body.date,
      records: req.body.records,
      actor: req.user,
    });

    res.json({
      data: result,
      message: `Attendance saved for ${result.code} (${result.marked} students)`,
    });
  })
);

router.get(
  '/my',
  requireRole('student'),
  asyncHandler(async (req, res) => {
    // The scope comes from req.user only — never from the request payload.
    res.json({ data: await attendanceService.getMyReport(req.user) });
  })
);

/**
 * Institution-wide attendance rates for the admin "Attendance Overview" page.
 * `byStudent` is server-paged: ?page &limit &search &sort &order.
 */
router.get(
  '/overview',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json(await attendanceService.overview(req.query));
  })
);

router.get(
  '/class/:id',
  requireRole('admin', 'faculty'),
  asyncHandler(async (req, res) => {
    const { classDoc } = await assertClassAccess(req.user, req.params.id);
    const sheet = await attendanceService.getClassDay(req.params.id, req.query.date);
    await attendanceService.auditOpened({ classDoc, day: sheet.date, actor: req.user });
    res.json({ data: sheet });
  })
);

module.exports = router;
