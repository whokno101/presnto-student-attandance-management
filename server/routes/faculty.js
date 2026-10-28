const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const facultyService = require('../services/faculty.service');
const { facultyCreateSchema, facultyUpdateSchema } = require('../validation/schemas');

const router = express.Router();

router.use(requireAuth);

/* ------------------------------------------------------------------ *
 *   GET    /api/faculty        admin   (?search, ?page, ?limit)
 *   POST   /api/faculty        admin
 *   PUT    /api/faculty/:id    admin
 *   DELETE /api/faculty/:id    admin   soft delete (isActive=false)
 * ------------------------------------------------------------------ */

router.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json(await facultyService.list(req.query));
  })
);

router.post(
  '/',
  requireRole('admin'),
  validate(facultyCreateSchema),
  asyncHandler(async (req, res) => {
    const faculty = await facultyService.create(req.body);
    res.status(201).json({ data: faculty, message: 'Faculty created' });
  })
);

router.put(
  '/:id',
  requireRole('admin'),
  validate(facultyUpdateSchema),
  asyncHandler(async (req, res) => {
    const faculty = await facultyService.update(req.params.id, req.body);
    res.json({ data: faculty, message: 'Faculty updated' });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const faculty = await facultyService.remove(req.params.id);
    res.json({ data: faculty, message: 'Faculty deactivated' });
  })
);

module.exports = router;
