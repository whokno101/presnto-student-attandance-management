const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { login, buildSessionUser } = require('../services/auth.service');

const router = express.Router();

/**
 * POST /api/auth/login — the ONLY public endpoint in the API.
 * Body: { email, password } -> 200 { token, user }
 */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    const { token, user } = await login(email, password);
    res.json({ token, user });
  })
);

// Everything below requires a valid, active session.
router.use(requireAuth);

/**
 * POST /api/auth/logout
 * JWTs are stateless, so logout is client-side token disposal. The endpoint
 * exists so the client has a single, auditable "end session" call.
 */
router.post('/logout', (req, res) => {
  res.json({ message: 'Signed out successfully' });
});

/** GET /api/auth/me — resolves the current user from the token. */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await buildSessionUser(req.userDoc);
    res.json({ user });
  })
);

module.exports = router;
