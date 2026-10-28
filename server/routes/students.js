const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { resolveAttendanceScope, requireFacultyProfile } = require('../services/access.service');
const studentService = require('../services/student.service');
const attendanceService = require('../services/attendance.service');
const { studentCreateSchema, studentUpdateSchema } = require('../validation/schemas');

const router = express.Router();

// Identity is established once for the whole router.
router.use(requireAuth);

/* ------------------------------------------------------------------ *
 *   POST   /api/students               admin
 *   GET    /api/students               admin   (?search, ?page, ?limit)
 *   PUT    /api/students/:id           admin
 *   DELETE /api/students/:id           admin   soft delete (isActive=false)
 *   GET    /api/students/:id/attendance admin | faculty* | student**
 *
 *   *  only students enrolled in one of the faculty member's classes
 *   ** own record only — an id belonging to someone else is rejected
 * ------------------------------------------------------------------ */

router.get(
  '/:id/attendance',
  requireRole('admin', 'faculty', 'student'),
  asyncHandler(async (req, res) => {
    // Throws 403 for a student asking about somebody else, or a faculty member
    // asking about a student who is not in any of their classes.
    const scope = await resolveAttendanceScope(req.user, req.params.id);

    // Faculty only see the classes they teach, even within a shared student.
    let facultyId = null;
    if (req.user.role === 'faculty') {
      facultyId = String((await requireFacultyProfile(req.user.id))._id);
    }

    const report = await attendanceService.getStudentReport(scope.studentId, { facultyId });
    res.json({ data: report });
  })
);

router.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json(await studentService.list(req.query));
  })
);

router.post(
  '/',
  requireRole('admin'),
  validate(studentCreateSchema),
  asyncHandler(async (req, res) => {
    const student = await studentService.create(req.body);
    res.status(201).json({ data: student, message: 'Student created' });
  })
);

router.put(
  '/:id',
  requireRole('admin'),
  validate(studentUpdateSchema),
  asyncHandler(async (req, res) => {
    const student = await studentService.update(req.params.id, req.body);
    res.json({ data: student, message: 'Student updated' });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const student = await studentService.remove(req.params.id);
    res.json({ data: student, message: 'Student deactivated' });
  })
);

module.exports = router;
