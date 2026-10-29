const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { assertCanViewRoster, assertStudentSelf } = require('../services/access.service');
const classService = require('../services/class.service');
const enrollmentService = require('../services/enrollment.service');
const {
  classCreateSchema,
  classUpdateSchema,
  enrollmentSchema,
  assignFacultySchema,
} = require('../validation/schemas');
const { ApiError } = require('../utils/apiError');

const router = express.Router();

router.use(requireAuth);

/**
 * Who is being enrolled/unenrolled?
 * Students can only ever act on their own Student._id — an id in the body that
 * belongs to someone else is rejected, never trusted. Admins must name one.
 */
const resolveTargetStudent = async (req) => {
  if (req.user.role === 'student') {
    const profile = await assertStudentSelf(req.user, req.body?.studentId);
    return String(profile._id);
  }

  if (!req.body?.studentId) {
    throw ApiError.validation('A studentId is required', [
      { field: 'studentId', message: 'Select a student to enroll' },
    ]);
  }

  return req.body.studentId;
};

/* ------------------------------------------------------------------ *
 *   GET    /api/classes                    admin   (?search, ?page, ?limit)
 *   POST   /api/classes                    admin
 *   PUT    /api/classes/:id                admin
 *   PUT    /api/classes/:id/assign-faculty admin
 *   DELETE /api/classes/:id                admin   archive (soft delete, PB-14)
 *   POST   /api/classes/:id/restore        admin   restore within retention
 *   POST   /api/classes/:id/enroll         admin | student (self)
 *   POST   /api/classes/:id/unenroll       admin | student (self)
 *   GET    /api/classes/mine               admin | faculty | student
 *   GET    /api/classes/available          admin | student
 *   GET    /api/classes/:id/students       admin | faculty (own classes)
 * ------------------------------------------------------------------ */

// Static paths first so they can never be captured by a /:id route.
router.get(
  '/mine',
  requireRole('admin', 'faculty', 'student'),
  asyncHandler(async (req, res) => {
    res.json(await enrollmentService.listMine(req.user));
  })
);

router.get(
  '/available',
  requireRole('admin', 'student'),
  asyncHandler(async (req, res) => {
    res.json(await enrollmentService.listAvailable(req.user, req.query));
  })
);

router.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json(await classService.list(req.query));
  })
);

router.post(
  '/',
  requireRole('admin'),
  validate(classCreateSchema),
  asyncHandler(async (req, res) => {
    const classDoc = await classService.create(req.body, req.user);
    res.status(201).json({ data: classDoc, message: 'Class created' });
  })
);

router.put(
  '/:id/assign-faculty',
  requireRole('admin'),
  validate(assignFacultySchema),
  asyncHandler(async (req, res) => {
    const classDoc = await classService.assignFaculty(req.params.id, req.body.facultyId, req.user);
    res.json({
      data: classDoc,
      message: req.body.facultyId ? 'Faculty assigned' : 'Faculty unassigned',
    });
  })
);

router.put(
  '/:id',
  requireRole('admin'),
  validate(classUpdateSchema),
  asyncHandler(async (req, res) => {
    const classDoc = await classService.update(req.params.id, req.body, req.user);
    res.json({ data: classDoc, message: 'Class updated' });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    // Never a hard delete: the class is archived and its attendance history kept.
    const archived = await classService.archive(req.params.id, req.user);
    res.json({ data: archived, message: `${archived.code} archived. Its attendance history is retained.` });
  })
);

router.post(
  '/:id/restore',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const restored = await classService.restore(req.params.id, req.user);
    res.json({ data: restored, message: `${restored.code} restored` });
  })
);

router.post(
  '/:id/enroll',
  requireRole('admin', 'student'),
  validate(enrollmentSchema),
  asyncHandler(async (req, res) => {
    const studentId = await resolveTargetStudent(req);
    const classDoc = await enrollmentService.enroll({ classId: req.params.id, studentId, actor: req.user });
    res.status(201).json({ data: classDoc, message: `Enrolled in ${classDoc.code}` });
  })
);

router.post(
  '/:id/unenroll',
  requireRole('admin', 'student'),
  validate(enrollmentSchema),
  asyncHandler(async (req, res) => {
    const studentId = await resolveTargetStudent(req);
    const classDoc = await enrollmentService.unenroll({ classId: req.params.id, studentId, actor: req.user });
    res.json({ data: classDoc, message: `Unenrolled from ${classDoc.code}` });
  })
);

router.get(
  '/:id/students',
  requireRole('admin', 'faculty'),
  asyncHandler(async (req, res) => {
    // Faculty must own the class; admin passes through.
    await assertCanViewRoster(req.user, req.params.id);
    res.json({ data: await classService.listRoster(req.params.id) });
  })
);

module.exports = router;
