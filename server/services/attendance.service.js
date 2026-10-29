/**
 * Attendance rules live here.
 *
 * One record per (class, student, date) — the unique index on the model is the
 * hard guarantee, and every write goes through an *upsert*, so re-marking the
 * same day edits the existing entry instead of duplicating it.
 *
 * A student is considered "attended" when marked `present` or `late`; the
 * percentage is attended / marked, rounded to one decimal.
 */
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const Student = require('../models/Student');
const { ApiError } = require('../utils/apiError');
const { requireStudentProfile } = require('./access.service');
const { parsePagination, buildPagination, escapeRegex } = require('../utils/query');
const { todayInInstitution, ymd } = require('../utils/dates');
const auditService = require('./audit.service');

const STATUSES = Attendance.STATUSES;

/**
 * Accepts `YYYY-MM-DD` (or a Date) and returns UTC midnight. No value means
 * today in the institution's time zone.
 */
const normalizeDay = (value) => {
  if (value === undefined || value === null || value === '') {
    return todayInInstitution();
  }

  const raw = value instanceof Date ? value : String(value);
  const isDayString = typeof raw === 'string' && raw.length === 10;
  const parsed = new Date(isDayString ? `${raw}T00:00:00.000Z` : raw);

  // `new Date('2026-02-31')` rolls over to March 3rd; reject it instead.
  const rolledOver = isDayString && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) !== raw;

  if (Number.isNaN(parsed.getTime()) || rolledOver) {
    throw ApiError.validation('Enter a valid date', [
      { field: 'date', message: 'Use the YYYY-MM-DD format' },
    ]);
  }

  return Attendance.normalizeDate(parsed);
};

const { summarise, TALLY_FIELDS, RATE_STAGE } = require('./metrics');

/* ------------------------------------------------------------------ *
 *   The single attendance write path
 *
 *   Manual marking, CSV import, approved excuses and QR check-in all go
 *   through applyRecords, so every change is validated the same way, audited
 *   per record (PB-13) and followed by the same recalculation hooks
 *   (absence counts, risk alerts — PB-15/PB-16).
 * ------------------------------------------------------------------ */

/** Async listeners run after attendance changes: ({ classDoc, day, studentIds, actor }) => Promise */
const changeHooks = [];
const onAttendanceChanged = (hook) => changeHooks.push(hook);

const runChangeHooks = async (event) => {
  for (const hook of changeHooks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await hook(event);
    } catch (err) {
      console.error('Attendance change hook failed:', err.message);
    }
  }
};

const STATUS_LABEL = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused' };

const SOURCE_LABEL = { manual: '', import: ' (CSV import)', qr: ' (QR check-in)', excuse: ' (approved excuse)' };

/**
 * Validates and upserts attendance for one class/day.
 * @param {{ classDoc: object, date: string|Date, records: Array<{studentId: string, status: string}>,
 *           actor: {id: string, name: string, role: string}, source?: 'manual'|'import'|'qr'|'excuse',
 *           onlyIfUnmarked?: boolean }} input
 *   `onlyIfUnmarked` never overwrites an existing outcome (QR check-in after a
 *   manual mark keeps the manual mark).
 */
const applyRecords = async ({ classDoc, date, records, actor, source = 'manual', onlyIfUnmarked = false }) => {
  const day = normalizeDay(date);
  const today = todayInInstitution();

  if (day.getTime() > today.getTime()) {
    throw ApiError.validation('Attendance cannot be marked for a future date', [
      { field: 'date', message: 'Choose today or an earlier date' },
    ]);
  }

  if (classDoc.archivedAt) {
    throw ApiError.conflict(`${classDoc.code} is archived; restore it before recording attendance`);
  }

  const roster = new Set((classDoc.students || []).map((id) => String(id)));
  const seen = new Set();

  records.forEach((record, index) => {
    const studentId = String(record.studentId);

    if (!roster.has(studentId)) {
      throw ApiError.validation('That student is not enrolled in this class', [
        { field: `records[${index}].studentId`, message: 'Not enrolled in this class' },
      ]);
    }

    if (seen.has(studentId)) {
      throw ApiError.validation('Each student may only be marked once', [
        { field: `records[${index}].studentId`, message: 'Duplicate student in this request' },
      ]);
    }

    if (!STATUSES.includes(record.status)) {
      throw ApiError.validation(`Status must be one of: ${STATUSES.join(', ')}`, [
        { field: `records[${index}].status`, message: 'Unknown attendance status' },
      ]);
    }

    seen.add(studentId);
  });

  const before = await Attendance.find({ class: classDoc._id, date: day }).select('student status').lean();
  const previous = new Map(before.map((row) => [String(row.student), row.status]));

  const toWrite = onlyIfUnmarked ? records.filter((r) => !previous.has(String(r.studentId))) : records;

  // Upsert each row: the unique (class, student, date) index turns a repeated
  // save into an update, so "marking the same day again" is always safe and a
  // retried request can never create a second record.
  if (toWrite.length) {
    await Attendance.bulkWrite(
      toWrite.map((record) => ({
        updateOne: {
          filter: { class: classDoc._id, student: record.studentId, date: day },
          update: {
            $set: { status: record.status, markedBy: actor.id, source },
            $setOnInsert: { class: classDoc._id, student: record.studentId, date: day },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }

  // The summary covers the whole day, not just the rows in this request, so the
  // UI can show "9 of 12 marked" after a partial save.
  const saved = await Attendance.find({ class: classDoc._id, date: day }).select('student status').lean();
  const savedIdByStudent = new Map(saved.map((row) => [String(row.student), row._id]));

  const changed = toWrite.filter((record) => previous.get(String(record.studentId)) !== record.status);
  await auditChanges({ classDoc, day, actor, source, changed, previous, savedIdByStudent, wasSubmitted: before.length > 0, saved });

  if (changed.length) {
    await runChangeHooks({ classDoc, day, studentIds: changed.map((r) => String(r.studentId)), actor, source });
  }

  return {
    classId: String(classDoc._id),
    code: classDoc.code,
    date: day,
    marked: saved.length,
    changed: changed.length,
    skipped: records.length - toWrite.length,
    statuses: saved.map((row) => ({ studentId: String(row.student), status: row.status })),
    summary: summarise(saved),
  };
};

/** One audit entry per changed record, plus one for the submission itself. */
const auditChanges = async ({ classDoc, day, actor, source, changed, previous, savedIdByStudent, wasSubmitted, saved }) => {
  const names = new Map(
    (
      await Student.find({ _id: { $in: changed.map((r) => r.studentId) } })
        .select('studentId user')
        .populate('user', 'name')
        .lean()
    ).map((s) => [String(s._id), `${s.user?.name ?? 'Student'} (${s.studentId})`])
  );

  const dayLabel = ymd(day);
  const suffix = SOURCE_LABEL[source] ?? '';
  const entries = changed.map((record) => {
    const studentId = String(record.studentId);
    const from = previous.get(studentId) ?? null;
    const who = names.get(studentId) ?? 'Student';
    return {
      actor,
      action: from ? 'attendance.status_changed' : 'attendance.status_set',
      entityType: 'Attendance',
      entityId: savedIdByStudent.get(studentId),
      classDoc,
      summary: from
        ? `Changed ${who} from ${STATUS_LABEL[from]} to ${STATUS_LABEL[record.status]} in ${classDoc.code} on ${dayLabel}${suffix}`
        : `Marked ${who} ${STATUS_LABEL[record.status]} in ${classDoc.code} on ${dayLabel}${suffix}`,
      changes: [{ field: 'status', from, to: record.status }],
      meta: { studentId, date: dayLabel, source },
    };
  });

  if (source === 'manual' || source === 'import') {
    const counts = summarise(saved);
    const deadline = auditService.deadlineFor(day, classDoc.schedule?.endTime ?? '23:59');
    const timeliness = wasSubmitted ? null : new Date() <= deadline ? 'on_time' : 'late';
    entries.push({
      actor,
      action: wasSubmitted ? 'attendance.resubmitted' : 'attendance.submitted',
      entityType: 'Class',
      entityId: classDoc._id,
      classDoc,
      summary: `${wasSubmitted ? 'Updated' : 'Submitted'} attendance for ${classDoc.code} on ${dayLabel}${suffix}: ${counts.present} present, ${counts.late} late, ${counts.absent} absent${counts.excused ? `, ${counts.excused} excused` : ''} (${changed.length} changed)`,
      meta: { date: dayLabel, source, changed: changed.length, timeliness, deadline },
    });
  }

  await auditService.recordMany(entries);
};

/**
 * "Faculty opened the attendance sheet" (PB-13). Re-opening the same sheet
 * within 15 minutes is not logged again, so browsing dates stays readable.
 */
const auditOpened = async ({ classDoc, day, actor }) => {
  const AuditLog = require('../models/AuditLog');
  const recent = await AuditLog.exists({
    action: 'attendance.opened',
    'actor.id': actor.id,
    class: classDoc._id,
    'meta.date': ymd(day),
    createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
  });
  if (recent) return;
  await auditService.record({
    actor,
    action: 'attendance.opened',
    entityType: 'Class',
    entityId: classDoc._id,
    classDoc,
    summary: `Opened attendance for ${classDoc.code} on ${ymd(day)}`,
    meta: { date: ymd(day) },
  });
};

/** POST /api/attendance/mark */
const mark = (input) => applyRecords({ ...input, source: 'manual' });

/** Roster + whatever is already marked, for the marking sheet. */
const getClassDay = async (classId, date) => {
  const classDoc = await Class.findById(classId).select('name code students archivedAt');
  if (!classDoc) throw ApiError.notFound('Class not found');

  const day = normalizeDay(date);

  const [students, marks, totals] = await Promise.all([
    Student.find({ _id: { $in: classDoc.students || [] } })
      .populate('user', 'name email')
      .sort({ studentId: 1 }),
    Attendance.find({ class: classDoc._id, date: day }).select('student status remarks source').lean(),
    // Running totals for this class, derived from the stored records every time
    // (PB-15): an edited or re-saved status can never leave a stale count.
    Attendance.aggregate([
      { $match: { class: classDoc._id } },
      { $group: { _id: '$student', ...TALLY_FIELDS } },
      RATE_STAGE,
    ]),
  ]);

  const byStudent = new Map(marks.map((row) => [String(row.student), row]));
  const totalsByStudent = new Map(totals.map((row) => [String(row._id), row]));

  return {
    classId: String(classDoc._id),
    code: classDoc.code,
    name: classDoc.name,
    date: day,
    marked: marks.length,
    archived: Boolean(classDoc.archivedAt),
    students: students.map((student) => {
      const existing = byStudent.get(String(student._id));
      const total = totalsByStudent.get(String(student._id));
      return {
        id: String(student._id),
        name: student.user?.name ?? '—',
        email: student.user?.email ?? '—',
        studentId: student.studentId,
        department: student.department,
        status: existing?.status ?? null,
        source: existing?.source ?? null,
        remarks: existing?.remarks ?? '',
        absences: total?.absent ?? 0,
        excused: total?.excused ?? 0,
        rate: total && total.eligible > 0 ? total.rate : null,
      };
    }),
  };
};

/**
 * Full attendance report for one student, grouped by class.
 * `facultyId` narrows the report to the classes that teacher owns, so a faculty
 * member cannot read history from another teacher's class.
 */
const getStudentReport = async (studentId, { facultyId = null } = {}) => {
  const student = await Student.findById(studentId).populate('user', 'name email');
  if (!student) throw ApiError.notFound('Student not found');

  const rows = await Attendance.find({ student: student._id })
    .populate({
      path: 'class',
      select: 'name code department faculty archivedAt',
      populate: { path: 'faculty', select: 'employeeId user', populate: { path: 'user', select: 'name' } },
    })
    .sort({ date: -1 })
    .lean();

  const visible = rows.filter((row) => {
    if (!row.class) return false; // class was deleted; keep the report honest
    if (!facultyId) return true;
    const owner = row.class.faculty?._id ?? row.class.faculty;
    return String(owner) === String(facultyId);
  });

  const groups = new Map();
  visible.forEach((row) => {
    const key = String(row.class._id);
    if (!groups.has(key)) groups.set(key, { classDoc: row.class, records: [] });
    groups.get(key).records.push(row);
  });

  const classes = [...groups.values()]
    .map(({ classDoc, records }) => ({
      id: String(classDoc._id),
      code: classDoc.code,
      name: classDoc.name,
      department: classDoc.department,
      archived: Boolean(classDoc.archivedAt),
      faculty: classDoc.faculty
        ? {
            id: String(classDoc.faculty._id),
            name: classDoc.faculty.user?.name ?? classDoc.faculty.employeeId,
          }
        : null,
      summary: summarise(records),
      records: records.map((row) => ({
        id: String(row._id),
        date: row.date,
        status: row.status,
        remarks: row.remarks ?? '',
      })),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    student: {
      id: String(student._id),
      name: student.user?.name ?? '—',
      email: student.user?.email ?? '—',
      studentId: student.studentId,
      department: student.department,
    },
    summary: summarise(visible),
    classes,
  };
};

/** GET /api/attendance/my — the caller's own report. */
const getMyReport = async (user) => {
  const profile = await requireStudentProfile(user.id);
  return getStudentReport(profile._id);
};

/* ------------------------------------------------------------------ *
 *   Attendance overview (admin) — every number comes from a MongoDB
 *   aggregation pipeline; nothing is tallied with a JS loop.
 * ------------------------------------------------------------------ */

/** Rates come from ./metrics (attended / (marked − excused)), shared with every report. */

/** Columns the admin table may be sorted by, plus their default direction. */
const STUDENT_SORTS = {
  rate: { field: 'rate', dir: 1 },
  attended: { field: 'attended', dir: 1 },
  marked: { field: 'marked', dir: 1 },
  classes: { field: 'classes', dir: -1 },
  name: { field: 'name', dir: 1 },
  studentId: { field: 'studentId', dir: 1 },
  department: { field: 'department', dir: 1 },
};

const OVERALL_PIPELINE = [
  { $group: { _id: null, ...TALLY_FIELDS } },
  RATE_STAGE,
  { $project: { _id: 0, marked: 1, attended: 1, excused: 1, eligible: 1, rate: 1 } },
];

/**
 * Rows come from Class (so a class nobody has marked yet still appears) with
 * the attendance tallies folded in by a correlated `$lookup`.
 */
const BY_CLASS_PIPELINE = [
  {
    $lookup: {
      from: 'attendances',
      let: { cid: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$class', '$$cid'] } } },
        { $group: { _id: null, ...TALLY_FIELDS } },
      ],
      as: 'tally',
    },
  },
  { $lookup: { from: 'faculties', localField: 'faculty', foreignField: '_id', as: 'owner' } },
  { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
  { $lookup: { from: 'users', localField: 'owner.user', foreignField: '_id', as: 'ownerUser' } },
  { $unwind: { path: '$ownerUser', preserveNullAndEmptyArrays: true } },
  {
    $set: {
      faculty: { $ifNull: ['$ownerUser.name', 'Unassigned'] },
      archived: { $ne: [{ $ifNull: ['$archivedAt', null] }, null] },
      students: { $size: { $ifNull: ['$students', []] } },
      marked: { $ifNull: [{ $arrayElemAt: ['$tally.marked', 0] }, 0] },
      attended: { $ifNull: [{ $arrayElemAt: ['$tally.attended', 0] }, 0] },
      excused: { $ifNull: [{ $arrayElemAt: ['$tally.excused', 0] }, 0] },
    },
  },
  RATE_STAGE,
  {
    $project: {
      _id: 0,
      classId: { $toString: '$_id' },
      code: 1,
      name: 1,
      faculty: 1,
      archived: 1,
      students: 1,
      marked: 1,
      attended: 1,
      excused: 1,
      eligible: 1,
      rate: 1,
    },
  },
  { $sort: { archived: 1, code: 1 } },
];

/**
 * Rows come from Student (so a student with no marks yet still appears) and the
 * per-student tallies are folded in with a correlated `$lookup` sub-pipeline.
 * `$facet` sorts, pages and counts in one round trip.
 */
const byStudentPipeline = ({ search, sortField, sortDir, skip, limit }) => [
  { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'owner' } },
  { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
  // `name` lives on User, `studentId` on Student — the matrix searches both.
  ...(search
    ? [
        {
          $match: {
            $or: [{ 'owner.name': new RegExp(escapeRegex(search), 'i') }, { studentId: new RegExp(escapeRegex(search), 'i') }],
          },
        },
      ]
    : []),
  {
    $lookup: {
      from: 'attendances',
      let: { sid: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$student', '$$sid'] } } },
        { $group: { _id: null, ...TALLY_FIELDS } },
      ],
      as: 'tally',
    },
  },
  {
    $set: {
      name: { $ifNull: ['$owner.name', '—'] },
      classes: { $size: { $ifNull: ['$enrolledClasses', []] } },
      marked: { $ifNull: [{ $arrayElemAt: ['$tally.marked', 0] }, 0] },
      attended: { $ifNull: [{ $arrayElemAt: ['$tally.attended', 0] }, 0] },
      excused: { $ifNull: [{ $arrayElemAt: ['$tally.excused', 0] }, 0] },
    },
  },
  RATE_STAGE,
  {
    $facet: {
      // `rows` sorts -> skips -> limits -> shapes; `meta` counts everything.
      rows: [
        { $sort: { [sortField]: sortDir, studentId: 1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            id: { $toString: '$_id' },
            studentId: 1,
            name: 1,
            department: 1,
            classes: 1,
            marked: 1,
            attended: 1,
            eligible: 1,
            rate: 1,
          },
        },
      ],
      meta: [{ $count: 'total' }],
      // Colour-rule counts (>= 90 green / 75-89 amber / < 75 red) for the same
      // filtered set the table pages through. A student with nothing marked has
      // no rate at all: they are counted as `noData`, never as at risk.
      bands: [
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            noData: { $sum: { $cond: [{ $eq: ['$eligible', 0] }, 1, 0] } },
            green: { $sum: { $cond: [{ $gte: ['$rate', 90] }, 1, 0] } },
            amber: { $sum: { $cond: [{ $and: [{ $gte: ['$rate', 75] }, { $lt: ['$rate', 90] }] }, 1, 0] } },
            red: { $sum: { $cond: [{ $and: [{ $gt: ['$eligible', 0] }, { $lt: ['$rate', 75] }] }, 1, 0] } },
          },
        },
        { $project: { _id: 0, total: 1, noData: 1, green: 1, amber: 1, red: 1 } },
      ],
    },
  },
];

/**
 * GET /api/attendance/overview — attendance rates across the whole institution.
 *
 * @param {{search?: string, page?: number, limit?: number, sort?: string, order?: string}} query
 *   `sort` is one of STUDENT_SORTS (default `rate`, ascending) and applies to
 *   the pupil table; `order` flips it to `desc`.
 * @returns {Promise<{data: {overall: object, byClass: Array, byStudent: Array, bands: object}, pagination: object}>}
 */
const overview = async (query = {}) => {
  const { page, limit, search, skip } = parsePagination(query);
  const sort = STUDENT_SORTS[query.sort] || STUDENT_SORTS.rate;
  const order = String(query.order || '').toLowerCase();
  const sortDir = order === 'desc' ? -1 : order === 'asc' ? 1 : sort.dir;

  const [overallRows, byClass, studentFacet] = await Promise.all([
    Attendance.aggregate(OVERALL_PIPELINE),
    Class.aggregate(BY_CLASS_PIPELINE),
    Student.aggregate(byStudentPipeline({ search, sortField: sort.field, sortDir, skip, limit })),
  ]);

  const facet = studentFacet[0] ?? { rows: [], meta: [], bands: [] };
  const total = facet.meta[0]?.total ?? 0;

  return {
    data: {
      overall: overallRows[0] ?? { marked: 0, attended: 0, excused: 0, eligible: 0, rate: 0 },
      byClass,
      byStudent: facet.rows,
      bands: facet.bands[0] ?? { total, noData: 0, green: 0, amber: 0, red: 0 },
    },
    pagination: buildPagination({ page, limit, total }),
  };
};

/**
 * Today's attendance rate for the admin dashboard.
 * Returns null when nothing has been marked yet — an em dash beats a fake 0%.
 */
const todayRate = async () => {
  const today = todayInInstitution();
  const rows = await Attendance.find({ date: today }).select('status').lean();

  if (rows.length === 0) return null;

  const summary = summarise(rows);
  return { marked: summary.total, attended: summary.attended, rate: summary.percentage };
};

module.exports = {
  STATUSES,
  normalizeDay,
  summarise,
  applyRecords,
  onAttendanceChanged,
  auditOpened,
  mark,
  getClassDay,
  getStudentReport,
  getMyReport,
  overview,
  todayRate,
};
