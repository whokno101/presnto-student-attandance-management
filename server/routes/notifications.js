const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const notificationService = require('../services/notification.service');

const router = express.Router();

/* ------------------------------------------------------------------ *
 *   Every signed-in user, own notifications only.
 *   GET   /api/notifications               ?status=unread &type &page &limit
 *   GET   /api/notifications/unread-count
 *   PATCH /api/notifications/:id/read
 *   POST  /api/notifications/read-all
 * ------------------------------------------------------------------ */

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => res.json(await notificationService.list(req.user, req.query))));

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => res.json({ data: { unread: await notificationService.unreadCount(req.user) } }))
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => res.json({ data: await notificationService.markRead(req.user, req.params.id) }))
);

router.post('/read-all', asyncHandler(async (req, res) => res.json({ data: await notificationService.markAllRead(req.user) })));

module.exports = router;
