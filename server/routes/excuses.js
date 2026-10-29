const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const excuseService = require('../services/excuse.service');
const { CATEGORIES } = require('../models/Excuse');

const router = express.Router();

/* ------------------------------------------------------------------ *
 *   Absence excuses (PB-19)
 *   GET  /api/excuses/eligible       student — own unexcused absences
 *   GET  /api/excuses/mine           student
 *   POST /api/excuses                student — { classId, date, category, explanation, document? }
 *   GET  /api/excuses                faculty (own classes) | admin  ?status &classId
 *   GET  /api/excuses/:id            the student, the class teacher, admin
 *   GET  /api/excuses/:id/document   same access
 *   POST /api/excuses/:id/review     class teacher | admin  { decision, note }
 * ------------------------------------------------------------------ */

const submitSchema = z.object({
  classId: z.string({ error: 'Select the absence to excuse' }),
  date: z.string({ error: 'Select the absence to excuse' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format'),
  category: z.enum(CATEGORIES, { error: 'Choose a reason' }),
  explanation: z
    .string({ error: 'Explain the absence' })
    .trim()
    .min(10, 'Give at least a sentence (10 characters)')
    .max(1000, 'Keep the explanation under 1000 characters'),
  document: z
    .object({
      filename: z.string().max(200),
      mimetype: z.string(),
      data: z.string(),
    })
    .optional()
    .nullable(),
});

const reviewSchema = z.object({
  decision: z.enum(['approved', 'rejected'], { error: 'Choose approve or reject' }),
  note: z.string().trim().max(500, 'Keep the note under 500 characters').optional(),
});

router.use(requireAuth);

router.get('/eligible', requireRole('student'), asyncHandler(async (req, res) => res.json({ data: await excuseService.eligible(req.user) })));
router.get('/mine', requireRole('student'), asyncHandler(async (req, res) => res.json({ data: await excuseService.listMine(req.user) })));

router.post(
  '/',
  requireRole('student'),
  validate(submitSchema),
  asyncHandler(async (req, res) => {
    const excuse = await excuseService.submit(req.user, req.body);
    res.status(201).json({ data: excuse, message: 'Excuse submitted. Your teacher will review it.' });
  })
);

router.get('/', requireRole('admin', 'faculty'), asyncHandler(async (req, res) => res.json(await excuseService.listForReview(req.user, req.query))));

router.get('/:id', asyncHandler(async (req, res) => res.json({ data: await excuseService.getOne(req.user, req.params.id) })));

router.get(
  '/:id/document',
  asyncHandler(async (req, res) => {
    const doc = await excuseService.getDocument(req.user, req.params.id);
    res.setHeader('Content-Type', doc.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(doc.data);
  })
);

router.post(
  '/:id/review',
  requireRole('admin', 'faculty'),
  validate(reviewSchema),
  asyncHandler(async (req, res) => {
    const excuse = await excuseService.review(req.user, req.params.id, req.body);
    res.json({ data: excuse, message: `Excuse ${excuse.status}` });
  })
);

module.exports = router;
