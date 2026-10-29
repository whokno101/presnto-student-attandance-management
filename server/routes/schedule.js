const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const scheduleService = require('../services/schedule.service');

const router = express.Router();

/* ------------------------------------------------------------------ *
 *   Class schedules (PB-22) with conflict checks (PB-23) — admin only.
 *   GET    /api/schedule            ?classId &room &facultyId &from &to &status
 *   POST   /api/schedule/preview    expand dates/recurrence + check conflicts
 *   POST   /api/schedule            save the confirmed dates (all-or-nothing)
 *   DELETE /api/schedule/:id        cancel one session (kept as history)
 * ------------------------------------------------------------------ */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format');
const time = z.string({ error: 'Time is required' }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm format');
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const slot = {
  classId: z.string({ error: 'Select a class' }).regex(/^[0-9a-fA-F]{24}$/, 'Select a class'),
  room: z.string().trim().max(30, 'Room cannot exceed 30 characters').optional(),
  startTime: time,
  endTime: time,
};

const previewSchema = z
  .object({
    ...slot,
    dates: z.array(day).max(200).optional(),
    recurrence: z
      .object({
        days: z.array(z.enum(WEEKDAYS, { error: 'Choose valid weekdays' })).min(1, 'Choose at least one weekday'),
        from: day,
        to: day,
      })
      .optional()
      .nullable(),
  })
  .refine((v) => v.endTime > v.startTime, { message: 'End time must be after start time', path: ['endTime'] });

const createSchema = z
  .object({ ...slot, dates: z.array(day).min(1, 'Keep at least one date').max(200) })
  .refine((v) => v.endTime > v.startTime, { message: 'End time must be after start time', path: ['endTime'] });

router.use(requireAuth, requireRole('admin'));

router.get('/', asyncHandler(async (req, res) => res.json(await scheduleService.list(req.query))));

router.post(
  '/preview',
  validate(previewSchema),
  asyncHandler(async (req, res) => res.json({ data: await scheduleService.preview(req.body) }))
);

router.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const result = await scheduleService.create(req.body, req.user);
    res.status(201).json({ data: result, message: `Saved ${result.saved.length} session${result.saved.length === 1 ? '' : 's'}` });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => res.json({ data: await scheduleService.cancel(req.params.id, req.user), message: 'Session cancelled' }))
);

module.exports = router;
