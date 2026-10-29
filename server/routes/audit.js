const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const auditService = require('../services/audit.service');

const router = express.Router();

/* ------------------------------------------------------------------ *
 *   Activity log (PB-13) — administrators only. Read-only by design:
 *   there is no route that updates or deletes an entry.
 *
 *   GET /api/audit               ?facultyId &department &category &action
 *                                &classId &outcome &from &to &search &page &limit
 *   GET /api/audit/actions       filter categories for the UI
 *   GET /api/audit/submissions   attendance timeliness per expected session
 *                                ?from &to &facultyId &department &classId &status
 *   GET /api/audit/:id           one entry with its full change list
 * ------------------------------------------------------------------ */

router.use(requireAuth, requireRole('admin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await auditService.list(req.query));
  })
);

router.get('/actions', (req, res) => {
  res.json({
    data: Object.entries(auditService.ACTION_CATEGORIES).map(([value, label]) => ({ value, label })),
  });
});

router.get(
  '/submissions',
  asyncHandler(async (req, res) => {
    res.json(await auditService.submissions(req.query));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ data: await auditService.getById(req.params.id) });
  })
);

module.exports = router;
