const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const dataService = require('../services/data.service');
const { ymd, todayInInstitution } = require('../utils/dates');

const router = express.Router();

/* ------------------------------------------------------------------ *
 *   CSV exchange (PB-17). Admin: every dataset. Faculty: attendance for
 *   their own classes only (import only when policy enables it).
 *
 *   GET  /api/data/datasets
 *   GET  /api/data/export/:dataset      (attendance accepts report filters)
 *   GET  /api/data/template/:dataset
 *   POST /api/data/import/:dataset/preview   { csv, filename }
 *   POST /api/data/import/:dataset/commit    { csv, filename }
 * ------------------------------------------------------------------ */

router.use(requireAuth, requireRole('admin', 'faculty'));

const sendCsv = (res, filename, body) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
};

router.get('/datasets', (req, res) => res.json({ data: dataService.describe(req.user) }));

router.get(
  '/export/:dataset',
  asyncHandler(async (req, res) => {
    const csv = await dataService.exportCsv(req.user, req.params.dataset, req.query);
    sendCsv(res, `${req.params.dataset}-${ymd(todayInInstitution())}.csv`, csv);
  })
);

router.get('/template/:dataset', (req, res, next) => {
  try {
    sendCsv(res, `${req.params.dataset}-template.csv`, dataService.templateCsv(req.user, req.params.dataset));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/import/:dataset/preview',
  asyncHandler(async (req, res) => {
    res.json({ data: await dataService.preview(req.user, req.params.dataset, req.body ?? {}) });
  })
);

router.post(
  '/import/:dataset/commit',
  asyncHandler(async (req, res) => {
    const result = await dataService.commit(req.user, req.params.dataset, req.body ?? {});
    res.json({
      data: result,
      message: result.applied
        ? `Import complete: ${result.summary.create} created, ${result.summary.update} updated`
        : 'Nothing was imported',
    });
  })
);

module.exports = router;
