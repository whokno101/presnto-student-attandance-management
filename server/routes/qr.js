const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const qrService = require('../services/qr.service');

const router = express.Router();

/* ------------------------------------------------------------------ *
 *   QR check-in (PB-20)
 *   POST /api/qr/sessions             faculty (own class) | admin  { classId }
 *   GET  /api/qr/sessions/:id/token   same — the current rotating code
 *   GET  /api/qr/sessions/:id         same — live check-in results
 *   POST /api/qr/sessions/:id/close   same
 *   POST /api/qr/checkin              student  { token }
 * ------------------------------------------------------------------ */

router.use(requireAuth);

router.post(
  '/sessions',
  requireRole('admin', 'faculty'),
  validate(z.object({ classId: z.string({ error: 'Select a class' }).regex(/^[0-9a-fA-F]{24}$/, 'Select a class') })),
  asyncHandler(async (req, res) => res.status(201).json({ data: await qrService.start(req.user, req.body.classId) }))
);

router.get('/sessions/:id/token', requireRole('admin', 'faculty'), asyncHandler(async (req, res) => res.json({ data: await qrService.currentToken(req.user, req.params.id) })));
router.get('/sessions/:id', requireRole('admin', 'faculty'), asyncHandler(async (req, res) => res.json({ data: await qrService.status(req.user, req.params.id) })));
router.post('/sessions/:id/close', requireRole('admin', 'faculty'), asyncHandler(async (req, res) => res.json({ data: await qrService.close(req.user, req.params.id) })));

router.post(
  '/checkin',
  requireRole('student'),
  validate(z.object({ token: z.string({ error: 'Scan a check-in code' }).max(200) })),
  asyncHandler(async (req, res) => {
    const result = await qrService.checkIn(req.user, req.body.token);
    res.json({ data: result, message: result.message });
  })
);

module.exports = router;
