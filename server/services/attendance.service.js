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
const { todayInInstitution } = require('../utils/dates');

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

const summarise = (records) => {
  const total = records.length;
  const present = records.filter((r) => r.status === 'present').length;
  const late = records.filter((r) => r.status === 'late').length;
  const absent = records.filter((r) => r.status === 'absent').length;
  const attended = present + late;

  return {
    total,
    present,
    late,
    absent,
    attended,
    percentage: total ? Math.round((attended / total) * 1000) / 10 : 0,
  };
};

/**
 * Marks (or re-marks) one day for one class.
 * @param {{ classDoc: object, date: string|Date, records: Array<{studentId: string, status: string}>, actor: {id: string} }} input
 */
const mark = async ({ classDoc, date, records, actor }) => {
  const day = normalizeDay(date);
  const today = todayInInstitution();

  if (day.getTime() > today.getTime()) {
    throw ApiError.validation('Attendance cannot be marked for a future date', [
      { field: 'date', message: 'Choose today or an earlier date' },
    ]);
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

    seen.add(studentId);
  });

  // Upsert each row: the unique (class, student, date) index turns a repeated
  // save into an update, so "marking the same day again" is always safe.
  await Attendance.bulkWrite(
    records.map((record) => ({
      updateOne: {
        filter: { class: classDoc._id, student: record.studentId, date: day },
        update: {
          $set: { status: record.status, markedBy: actor.id },
          $setOnInsert: { class: classDoc._id, student: record.studentId, date: day },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  // The summary covers the whole day, not just the rows in this request, so the
  // UI can show "9 of 12 marked" after a partial save.
  const saved = await Attendance.find({ class: classDoc._id, date: day })
    .select('student status')
    .lean();

  return {
    classId: String(classDoc._id),
    code: classDoc.code,
    date: day,
    marked: saved.length,
    statuses: saved.map((row) => ({ studentId: String(row.student), status: row.status })),
    summary: summarise(saved),
  };
};

/** Roster + whatever is already marked, for the marking sheet. */
const getClassDay = async (classId, date) => {
  const classDoc = await Class.findById(classId).select('name code students');
  if (!classDoc) throw ApiError.notFound('Class not found');

  const day = normalizeDay(date);

  const [students, marks] = await Promise.all([
    Student.find({ _id: { $in: classDoc.students || [] } })
      .populate('user', 'name email')
      .sort({ studentId: 1 }),
    Attendance.find({ class: classDoc._id, date: day }).select('student status remarks').lean(),
  ]);

  const byStudent = new Map(marks.map((row) => [String(row.student), row]));

  return {
    classId: String(classDoc._id),
    code: classDoc.code,
    name: classDoc.name,
    date: day,
    marked: marks.length,
    students: students.map((student) => {
      const existing = byStudent.get(String(student._id));
      return {
        id: String(student._id),
        name: student.user?.name ?? '—',
        email: student.user?.email ?? '—',
        studentId: student.studentId,
        department: student.department,
        status: existing?.status ?? null,
        remarks: existing?.remarks ?? '',
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
      select: 'name code department faculty',
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

/** `present` and `late` both count as attended (see the module docblock). */
const ATTENDED_EXPR = { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } };

/** attended / marked x 100, rounded to one decimal (0 when nothing is marked). */
const RATE_EXPR = {
  $cond: [
    { $gt: ['$marked', 0] },
    { $round: [{ $multiply: [{ $divide: ['$attended', '$marked'] }, 100] }, 1] },
    0,
  ],
};

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
  { $group: { _id: null, marked: { $sum: 1 }, attended: ATTENDED_EXPR } },
  { $set: { rate: RATE_EXPR } },
  { $project: { _id: 0, marked: 1, attended: 1, rate: 1 } },
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
        { $group: { _id: null, marked: { $sum: 1 }, attended: ATTENDED_EXPR } },
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
      students: { $size: { $ifNull: ['$students', []] } },
      marked: { $ifNull: [{ $arrayElemAt: ['$tally.marked', 0] }, 0] },
      attended: { $ifNull: [{ $arrayElemAt: ['$tally.attended', 0] }, 0] },
    },
  },
  { $set: { rate: RATE_EXPR } },
  {
    $project: {
      _id: 0,
      classId: { $toString: '$_id' },
      code: 1,
      name: 1,
      faculty: 1,
      students: 1,
      marked: 1,
      attended: 1,
      rate: 1,
    },
  },
  { $sort: { code: 1 } },
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
        { $group: { _id: null, marked: { $sum: 1 }, attended: ATTENDED_EXPR } },
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
    },
  },
  { $set: { rate: RATE_EXPR } },
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
            noData: { $sum: { $cond: [{ $eq: ['$marked', 0] }, 1, 0] } },
            green: { $sum: { $cond: [{ $gte: ['$rate', 90] }, 1, 0] } },
            amber: { $sum: { $cond: [{ $and: [{ $gte: ['$rate', 75] }, { $lt: ['$rate', 90] }] }, 1, 0] } },
            red: { $sum: { $cond: [{ $and: [{ $gt: ['$marked', 0] }, { $lt: ['$rate', 75] }] }, 1, 0] } },
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
      overall: overallRows[0] ?? { marked: 0, attended: 0, rate: 0 },
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
  mark,
  getClassDay,
  getStudentReport,
  getMyReport,
  overview,
  todayRate,
};
