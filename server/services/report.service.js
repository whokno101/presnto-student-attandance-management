/**
 * Class-by-class attendance reports (PB-15).
 *
 *   sessions  one row per class session: status counts, rate, < 60% warning
 *   students  one row per student per class: derived absence counts + risk
 *   records   the individual attendance log
 *
 * All three take the same filters (resolved by scope.service), and the summary
 * block is computed from exactly the rows the filters select, so the table,
 * its counters and any export always agree (AC-5).
 */
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const policy = require('../config/policy');
const { resolveScope } = require('./scope.service');
const { TALLY_FIELDS, RATE_STAGE, rateOf, riskOf, describeRisk, isSessionBelowWarning, STATUSES } = require('./metrics');
const { parsePagination, buildPagination } = require('../utils/query');
const { ymd } = require('../utils/dates');

const EXPORT_LIMIT = 10000;

const statusFilter = (query) => (STATUSES.includes(query.status) ? query.status : null);

const classInfo = (classDoc) => ({
  classId: String(classDoc._id),
  code: classDoc.code,
  name: classDoc.name,
  department: classDoc.department,
  semester: classDoc.semester,
  faculty: classDoc.faculty?.user?.name ?? 'Unassigned',
  enrolled: (classDoc.students || []).length,
  archived: Boolean(classDoc.archivedAt),
});

const sortRows = (rows, sort, order, defaults) => {
  const [field, defaultDir] = defaults[sort] ? [sort, defaults[sort]] : Object.entries(defaults)[0];
  const dir = order === 'asc' ? 1 : order === 'desc' ? -1 : defaultDir;
  return [...rows].sort((a, b) => {
    const x = a[field];
    const y = b[field];
    const cmp = x instanceof Date || y instanceof Date ? new Date(x) - new Date(y) : typeof x === 'string' ? x.localeCompare(y) : (x ?? -1) - (y ?? -1);
    return cmp * dir || String(a.code ?? '').localeCompare(String(b.code ?? ''));
  });
};

const page = (rows, query, { exportAll = false } = {}) => {
  if (exportAll) return { data: rows.slice(0, EXPORT_LIMIT), pagination: null };
  const { page: p, limit, skip } = parsePagination(query);
  return { data: rows.slice(skip, skip + limit), pagination: buildPagination({ page: p, limit, total: rows.length }) };
};

const totalsOf = (rows) => {
  const totals = { marked: 0, present: 0, late: 0, absent: 0, excused: 0, attended: 0 };
  rows.forEach((row) => Object.keys(totals).forEach((k) => (totals[k] += row[k] ?? 0)));
  const eligible = policy.EXCLUDE_EXCUSED_FROM_DENOMINATOR ? totals.marked - totals.excused : totals.marked;
  return { ...totals, eligible, rate: rateOf(totals.attended, eligible) };
};

/* ------------------------------------------------------------------ *
 *   Sessions
 * ------------------------------------------------------------------ */

const SESSION_SORTS = { date: -1, rate: 1, code: 1, absent: -1 };

const sessions = async (user, query = {}, options = {}) => {
  const scope = await resolveScope(user, query);
  const status = statusFilter(query);

  const groups = await Attendance.aggregate([
    { $match: scope.match },
    {
      $group: {
        _id: { class: '$class', date: '$date' },
        ...TALLY_FIELDS,
        ...(scope.studentIds ? { students: { $addToSet: '$student' } } : {}),
      },
    },
    RATE_STAGE,
    ...(status ? [{ $match: { [status]: { $gt: 0 } } }] : []),
  ]);

  // With a student filter, the match above already narrowed records to that
  // student; recount the whole session so its percentages stay true.
  let rows = groups;
  if (scope.studentIds) {
    const keys = groups.map((g) => ({ class: g._id.class, date: g._id.date }));
    rows = keys.length
      ? await Attendance.aggregate([
          { $match: { $or: keys } },
          { $group: { _id: { class: '$class', date: '$date' }, ...TALLY_FIELDS } },
          RATE_STAGE,
        ])
      : [];
  }

  const shaped = rows
    .map((g) => {
      const classDoc = scope.classById.get(String(g._id.class));
      return {
        ...classInfo(classDoc),
        date: g._id.date,
        marked: g.marked,
        present: g.present,
        late: g.late,
        absent: g.absent,
        excused: g.excused,
        attended: g.attended,
        eligible: g.eligible,
        rate: g.rate,
        belowWarning: isSessionBelowWarning(g),
      };
    })
    .filter((row) => row.code);

  const sorted = sortRows(shaped, query.sort, query.order, SESSION_SORTS);
  const totals = totalsOf(sorted);

  return {
    ...page(sorted, query, options),
    summary: {
      sessions: sorted.length,
      classes: new Set(sorted.map((r) => r.classId)).size,
      belowWarning: sorted.filter((r) => r.belowWarning).length,
      warningRate: policy.SESSION_WARNING_RATE,
      ...totals,
    },
    range: scope.range,
  };
};

/* ------------------------------------------------------------------ *
 *   Students (absence counts)
 * ------------------------------------------------------------------ */

const STUDENT_SORTS = { rate: 1, absent: -1, studentName: 1, code: 1, excused: -1 };

const students = async (user, query = {}, options = {}) => {
  const scope = await resolveScope(user, query);
  const status = statusFilter(query);

  const groups = await Attendance.aggregate([
    { $match: scope.match },
    { $group: { _id: { student: '$student', class: '$class' }, ...TALLY_FIELDS, lastDate: { $max: '$date' } } },
    RATE_STAGE,
    ...(status ? [{ $match: { [status]: { $gt: 0 } } }] : []),
  ]);

  const byKey = new Map(groups.map((g) => [`${g._id.student}|${g._id.class}`, g]));

  // Enrolled students with no records in range still appear ("no history").
  if (!status) {
    scope.classes.forEach((classDoc) => {
      (classDoc.students || []).forEach((studentId) => {
        if (scope.studentIds && !scope.studentIds.some((id) => String(id) === String(studentId))) return;
        const key = `${studentId}|${classDoc._id}`;
        if (!byKey.has(key)) {
          byKey.set(key, { _id: { student: studentId, class: classDoc._id }, marked: 0, present: 0, late: 0, absent: 0, excused: 0, attended: 0, eligible: 0, rate: 0, lastDate: null });
        }
      });
    });
  }

  const entries = [...byKey.values()];
  const profiles = await Student.find({ _id: { $in: entries.map((e) => e._id.student) } })
    .select('studentId department user')
    .populate('user', 'name')
    .lean();
  const profileById = new Map(profiles.map((p) => [String(p._id), p]));

  const shaped = entries
    .map((g) => {
      const classDoc = scope.classById.get(String(g._id.class));
      const profile = profileById.get(String(g._id.student));
      if (!classDoc || !profile) return null;
      const risk = riskOf(g);
      return {
        ...classInfo(classDoc),
        studentId: String(profile._id),
        studentNumber: profile.studentId,
        studentName: profile.user?.name ?? '—',
        studentDepartment: profile.department,
        marked: g.marked,
        present: g.present,
        late: g.late,
        absent: g.absent,
        excused: g.excused,
        attended: g.attended,
        eligible: g.eligible,
        rate: g.rate,
        lastDate: g.lastDate,
        atRisk: risk.atRisk,
        riskReasons: risk.reasons,
        riskText: risk.atRisk ? describeRisk({ ...risk, absent: g.absent, rate: g.rate }) : null,
      };
    })
    .filter(Boolean)
    .filter((row) => (query.risk === 'at_risk' ? row.atRisk : true));

  const sorted = sortRows(shaped, query.sort, query.order, STUDENT_SORTS);
  const totals = totalsOf(sorted);

  return {
    ...page(sorted, query, options),
    summary: {
      students: new Set(sorted.map((r) => r.studentId)).size,
      enrollments: sorted.length,
      atRisk: sorted.filter((r) => r.atRisk).length,
      noHistory: sorted.filter((r) => r.marked === 0).length,
      riskRate: policy.STUDENT_RISK_RATE,
      riskAbsences: policy.RISK_MIN_UNEXCUSED_ABSENCES,
      ...totals,
    },
    range: scope.range,
  };
};

/* ------------------------------------------------------------------ *
 *   Records (attendance log)
 * ------------------------------------------------------------------ */

const records = async (user, query = {}, options = {}) => {
  const scope = await resolveScope(user, query);
  const status = statusFilter(query);
  const match = { ...scope.match, ...(status ? { status } : {}) };

  const { page: p, limit, skip } = parsePagination(query);
  const take = options.exportAll ? EXPORT_LIMIT : limit;
  const offset = options.exportAll ? 0 : skip;

  const [total, rows, tally] = await Promise.all([
    Attendance.countDocuments(match),
    Attendance.find(match)
      .sort({ date: -1, class: 1, _id: 1 })
      .skip(offset)
      .limit(take)
      .populate({ path: 'student', select: 'studentId user', populate: { path: 'user', select: 'name' } })
      .populate('markedBy', 'name')
      .lean(),
    Attendance.aggregate([{ $match: match }, { $group: { _id: null, ...TALLY_FIELDS } }, RATE_STAGE]),
  ]);

  return {
    data: rows.map((row) => {
      const classDoc = scope.classById.get(String(row.class));
      return {
        id: String(row._id),
        ...classInfo(classDoc),
        date: row.date,
        studentId: row.student ? String(row.student._id) : null,
        studentNumber: row.student?.studentId ?? '—',
        studentName: row.student?.user?.name ?? '—',
        status: row.status,
        source: row.source ?? 'manual',
        markedBy: row.markedBy?.name ?? '—',
        updatedAt: row.updatedAt,
      };
    }),
    pagination: options.exportAll ? null : buildPagination({ page: p, limit, total }),
    summary: { records: total, ...(tally[0] ?? { marked: 0, present: 0, late: 0, absent: 0, excused: 0, attended: 0, eligible: 0, rate: 0 }) },
    range: scope.range,
  };
};

/* ------------------------------------------------------------------ *
 *   CSV columns (same rows as the on-screen report)
 * ------------------------------------------------------------------ */

const CSV_COLUMNS = {
  sessions: [
    { key: 'date', label: 'Date', value: (r) => ymd(r.date) },
    { key: 'code', label: 'Class code' },
    { key: 'name', label: 'Class name' },
    { key: 'semester', label: 'Semester' },
    { key: 'department', label: 'Department' },
    { key: 'faculty', label: 'Faculty' },
    { key: 'enrolled', label: 'Enrolled' },
    { key: 'present', label: 'Present' },
    { key: 'late', label: 'Late' },
    { key: 'absent', label: 'Absent' },
    { key: 'excused', label: 'Excused' },
    { key: 'rate', label: 'Attendance %', value: (r) => (r.eligible ? r.rate : '') },
    { key: 'belowWarning', label: `Below ${policy.SESSION_WARNING_RATE}%`, value: (r) => (r.belowWarning ? 'yes' : 'no') },
    { key: 'archived', label: 'Archived class', value: (r) => (r.archived ? 'yes' : 'no') },
  ],
  students: [
    { key: 'studentNumber', label: 'Student ID' },
    { key: 'studentName', label: 'Student name' },
    { key: 'code', label: 'Class code' },
    { key: 'name', label: 'Class name' },
    { key: 'present', label: 'Present' },
    { key: 'late', label: 'Late' },
    { key: 'absent', label: 'Unexcused absences' },
    { key: 'excused', label: 'Excused' },
    { key: 'rate', label: 'Attendance %', value: (r) => (r.eligible ? r.rate : '') },
    { key: 'atRisk', label: 'At risk', value: (r) => (r.atRisk ? 'yes' : 'no') },
    { key: 'riskText', label: 'Risk reason' },
    { key: 'archived', label: 'Archived class', value: (r) => (r.archived ? 'yes' : 'no') },
  ],
  records: [
    { key: 'date', label: 'Date', value: (r) => ymd(r.date) },
    { key: 'code', label: 'Class code' },
    { key: 'studentNumber', label: 'Student ID' },
    { key: 'studentName', label: 'Student name' },
    { key: 'status', label: 'Status' },
    { key: 'source', label: 'Recorded via' },
    { key: 'markedBy', label: 'Recorded by' },
  ],
};

module.exports = { sessions, students, records, CSV_COLUMNS, EXPORT_LIMIT };
