/**
 * Admin analytics (PB-12) and faculty insights (PB-16).
 *
 * Built on the same scope resolver and metric definitions as the reports, so
 * a number on a dashboard always matches the report with the same filters.
 * Admin analytics are aggregate-only: no student-level details.
 */
const Attendance = require('../models/Attendance');
const RiskState = require('../models/RiskState');
const Student = require('../models/Student');
const policy = require('../config/policy');
const { resolveScope } = require('./scope.service');
const reportService = require('./report.service');
const { TALLY_FIELDS, RATE_STAGE, rateOf, riskOf, describeRisk } = require('./metrics');
const { ApiError } = require('../utils/apiError');
const { todayInInstitution, addDays, ymd, DAY_MS } = require('../utils/dates');
const { NEXT_STEP } = require('./risk.service');

const TIMEFRAMES = { week: 7, month: 30, quarter: 84 };

/** Resolves ?timeframe=week|month|quarter|all|custom into from/to (custom uses ?from/?to). */
const withTimeframe = (query) => {
  const timeframe = query.timeframe || 'month';
  if (timeframe === 'custom' || timeframe === 'all') return { ...query, timeframe };
  const days = TIMEFRAMES[timeframe];
  if (!days) throw ApiError.validation('Unknown timeframe', [{ field: 'timeframe', message: 'Use week, month, quarter, all or custom' }]);
  const to = todayInInstitution();
  return { ...query, timeframe, from: ymd(addDays(to, -(days - 1))), to: ymd(to) };
};

/** Daily buckets up to ~6 weeks, weekly (Monday-start) beyond that. */
const bucketFor = (match) => {
  const from = match.date?.$gte;
  const to = match.date?.$lte ?? todayInInstitution();
  const spanDays = from ? (to - from) / DAY_MS : Infinity;
  if (spanDays <= 45) return { unit: 'day', expr: '$date' };
  return {
    unit: 'week',
    expr: { $dateTrunc: { date: '$date', unit: 'week', startOfWeek: 'monday', timezone: 'UTC' } },
  };
};

const trendOf = async (match) => {
  const bucket = bucketFor(match);
  const rows = await Attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: bucket.expr,
        ...TALLY_FIELDS,
        sessions: { $addToSet: { c: '$class', d: '$date' } },
      },
    },
    RATE_STAGE,
    { $set: { sessions: { $size: '$sessions' } } },
    { $sort: { _id: 1 } },
  ]);
  return {
    unit: bucket.unit,
    points: rows.map((r) => ({
      period: ymd(r._id),
      rate: r.eligible > 0 ? r.rate : null,
      attended: r.attended,
      eligible: r.eligible,
      absent: r.absent,
      excused: r.excused,
      sessions: r.sessions,
    })),
  };
};

const rangeOf = (scope, query) => ({ ...scope.range, timeframe: query.timeframe });

/* ------------------------------------------------------------------ *
 *   PB-12 admin analytics
 * ------------------------------------------------------------------ */

const admin = async (user, rawQuery = {}) => {
  const query = withTimeframe(rawQuery);
  const scope = await resolveScope(user, query);
  const { match } = scope;

  const [totals, perClass, absentStudents, sessions, trend] = await Promise.all([
    Attendance.aggregate([{ $match: match }, { $group: { _id: null, ...TALLY_FIELDS } }, RATE_STAGE]),
    Attendance.aggregate([{ $match: match }, { $group: { _id: '$class', ...TALLY_FIELDS } }, RATE_STAGE]),
    Attendance.distinct('student', { ...match, status: 'absent' }),
    Attendance.aggregate([{ $match: match }, { $group: { _id: { c: '$class', d: '$date' } } }, { $count: 'n' }]),
    trendOf(match),
  ]);

  const total = totals[0] ?? { marked: 0, attended: 0, eligible: 0, absent: 0, excused: 0, rate: 0 };
  const enrolled = new Set();
  scope.classes.forEach((c) => (c.students || []).forEach((s) => enrolled.add(String(s))));

  const tallyByClass = new Map(perClass.map((r) => [String(r._id), r]));
  const byClass = scope.classes
    .map((c) => {
      const t = tallyByClass.get(String(c._id)) ?? { marked: 0, attended: 0, eligible: 0, absent: 0, rate: 0 };
      return {
        classId: String(c._id),
        code: c.code,
        name: c.name,
        department: c.department,
        archived: Boolean(c.archivedAt),
        enrolled: (c.students || []).length,
        marked: t.marked,
        eligible: t.eligible,
        absent: t.absent,
        rate: t.eligible > 0 ? t.rate : null,
        belowThreshold: t.eligible > 0 && t.rate < policy.STUDENT_RISK_RATE,
      };
    })
    .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.code.localeCompare(b.code));

  const departments = new Map();
  byClass.forEach((c) => {
    const t = tallyByClass.get(c.classId);
    if (!t) return;
    const d = departments.get(c.department) ?? { department: c.department, attended: 0, eligible: 0, classes: 0 };
    d.attended += t.attended;
    d.eligible += t.eligible;
    d.classes += 1;
    departments.set(c.department, d);
  });

  return {
    data: {
      empty: total.marked === 0,
      metrics: {
        rate: total.eligible > 0 ? total.rate : null,
        attended: total.attended,
        eligible: total.eligible,
        totalStudents: enrolled.size,
        studentsAbsent: absentStudents.length,
        absences: total.absent,
        excused: total.excused,
        sessionsHeld: sessions[0]?.n ?? 0,
        classes: scope.classes.length,
        classesBelowThreshold: byClass.filter((c) => c.belowThreshold).length,
        atRiskStudents: await RiskState.countDocuments({ class: { $in: scope.classIds }, atRisk: true }),
      },
      trend,
      byClass,
      byDepartment: [...departments.values()]
        .map((d) => ({ ...d, rate: rateOf(d.attended, d.eligible) }))
        .sort((a, b) => a.department.localeCompare(b.department)),
      threshold: policy.STUDENT_RISK_RATE,
    },
    range: rangeOf(scope, query),
    generatedAt: new Date(),
  };
};

/* ------------------------------------------------------------------ *
 *   PB-16 faculty insights
 * ------------------------------------------------------------------ */

// One absence in the last few sessions is noise; two out of four is a decline.
const RECENT_SESSIONS = 4;
const DECLINE_POINTS = 30;

/**
 * Students whose last few sessions are well below their earlier rate.
 * @returns Array<{ studentId, recentRate, earlierRate, drop }>
 */
const decliningStudents = async (match) => {
  const rows = await Attendance.find(match).select('student class date status').sort({ date: 1 }).lean();
  const byKey = new Map();
  rows.forEach((r) => {
    const key = `${r.student}|${r.class}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  });

  const out = [];
  byKey.forEach((records, key) => {
    const counted = records.filter((r) => r.status !== 'excused');
    if (counted.length < RECENT_SESSIONS * 2) return;
    const recent = counted.slice(-RECENT_SESSIONS);
    const earlier = counted.slice(0, -RECENT_SESSIONS);
    const att = (list) => list.filter((r) => policy.ATTENDED_STATUSES.includes(r.status)).length;
    const recentRate = rateOf(att(recent), recent.length);
    const earlierRate = rateOf(att(earlier), earlier.length);
    const drop = Math.round((earlierRate - recentRate) * 10) / 10;
    if (drop >= DECLINE_POINTS) {
      const [studentId, classId] = key.split('|');
      out.push({ studentId, classId, recentRate, earlierRate, drop, recentSessions: RECENT_SESSIONS });
    }
  });
  return out.sort((a, b) => b.drop - a.drop);
};

const faculty = async (user, rawQuery = {}) => {
  const query = withTimeframe(rawQuery);
  const scope = await resolveScope(user, query);
  const { match } = scope;

  // Risk is a whole-class condition, so it ignores the date range.
  const riskQuery = { ...query, from: undefined, to: undefined, risk: 'at_risk', sort: 'rate', order: 'asc', limit: 100 };
  const [totals, trend, risky, studentRows, declining] = await Promise.all([
    Attendance.aggregate([{ $match: match }, { $group: { _id: null, ...TALLY_FIELDS } }, RATE_STAGE]),
    trendOf(match),
    reportService.students(user, riskQuery, { exportAll: true }),
    reportService.students(user, { ...query, sort: 'absent', order: 'desc' }, { exportAll: true }),
    decliningStudents(match),
  ]);

  const total = totals[0] ?? { marked: 0, attended: 0, eligible: 0, absent: 0, excused: 0, rate: 0 };
  const profiles = await Student.find({ _id: { $in: declining.map((d) => d.studentId) } })
    .select('studentId user')
    .populate('user', 'name')
    .lean();
  const profileById = new Map(profiles.map((p) => [String(p._id), p]));

  return {
    data: {
      empty: total.marked === 0,
      classes: scope.classes.map((c) => ({ id: String(c._id), code: c.code, name: c.name, archived: Boolean(c.archivedAt), enrolled: (c.students || []).length })),
      metrics: {
        rate: total.eligible > 0 ? total.rate : null,
        attended: total.attended,
        eligible: total.eligible,
        absences: total.absent,
        excused: total.excused,
        atRisk: risky.data.length,
        declining: declining.length,
      },
      trend,
      atRisk: risky.data.map((row) => ({
        studentId: row.studentId,
        studentNumber: row.studentNumber,
        studentName: row.studentName,
        classId: row.classId,
        code: row.code,
        rate: row.eligible > 0 ? row.rate : null,
        absent: row.absent,
        excused: row.excused,
        reasons: row.riskReasons,
        reason: describeRisk({ reasons: row.riskReasons, absent: row.absent, rate: row.rate }),
        nextStep: NEXT_STEP,
      })),
      frequentAbsences: studentRows.data.filter((r) => r.absent > 0).slice(0, 10).map((r) => ({
        studentId: r.studentId,
        studentNumber: r.studentNumber,
        studentName: r.studentName,
        code: r.code,
        classId: r.classId,
        absent: r.absent,
        rate: r.eligible > 0 ? r.rate : null,
        atRisk: riskOf(r).atRisk,
      })),
      declining: declining.slice(0, 10).map((d) => {
        const p = profileById.get(d.studentId);
        return {
          ...d,
          studentNumber: p?.studentId ?? '—',
          studentName: p?.user?.name ?? '—',
          code: scope.classById.get(d.classId)?.code ?? '—',
        };
      }),
      thresholds: { rate: policy.STUDENT_RISK_RATE, absences: policy.RISK_MIN_UNEXCUSED_ABSENCES, declinePoints: DECLINE_POINTS, recentSessions: RECENT_SESSIONS },
    },
    range: rangeOf(scope, query),
    generatedAt: new Date(),
  };
};

module.exports = { admin, faculty, TIMEFRAMES };
