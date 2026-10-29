const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const reportService = require('../services/report.service');
const auditService = require('../services/audit.service');
const { sendCsv } = require('../utils/csv');
const { ymd, todayInInstitution } = require('../utils/dates');

const router = express.Router();

/* ------------------------------------------------------------------ *
 *   Class-by-class reports (PB-15) — admin (all classes) and faculty
 *   (their own classes only, enforced in scope.service).
 *
 *   GET /api/reports/sessions   ?from &to &classId &department &facultyId
 *   GET /api/reports/students       &semester &status &student &risk
 *   GET /api/reports/records        &sort &order &page &limit
 *   Add ?format=csv to download exactly the filtered rows (PB-17).
 * ------------------------------------------------------------------ */

router.use(requireAuth, requireRole('admin', 'faculty'));

['sessions', 'students', 'records'].forEach((view) => {
  router.get(
    `/${view}`,
    asyncHandler(async (req, res) => {
      const asCsv = req.query.format === 'csv';
      const result = await reportService[view](req.user, req.query, { exportAll: asCsv });

      if (!asCsv) return res.json(result);

      await auditService.record({
        actor: req.user,
        action: 'export.report',
        entityType: 'Report',
        summary: `Exported ${result.data.length} ${view} report rows as CSV`,
        meta: { view, filters: { ...req.query, format: undefined }, rows: result.data.length },
      });
      return sendCsv(res, `attendance-${view}-${ymd(todayInInstitution())}.csv`, reportService.CSV_COLUMNS[view], result.data);
    })
  );
});

module.exports = router;
