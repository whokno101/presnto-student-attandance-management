/**
 * Activity log (PB-13) and destructive-action audit trail (PB-14).
 *
 * `record` / `recordMany` are called by the services that perform an action,
 * never by the browser. A failed audit write is logged but does not undo the
 * action that already happened; it is reported loudly instead.
 */
const AuditLog = require('../models/AuditLog');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const Faculty = require('../models/Faculty');
const policy = require('../config/policy');
const { ApiError } = require('../utils/apiError');
const { parsePagination, buildPagination, escapeRegex } = require('../utils/query');
const { todayInInstitution, addDays, weekdayOf, zonedTime, ymd, DAY_MS } = require('../utils/dates');

/** Filter groups shown in the Activity Log "Action" select. */
const ACTION_CATEGORIES = {
  attendance: 'Attendance',
  class: 'Classes',
  student: 'Students',
  faculty: 'Faculty',
  enrollment: 'Enrollment',
  schedule: 'Schedule',
  import: 'Imports',
  export: 'Exports',
  excuse: 'Excuses',
  destructive: 'Denied destructive attempts',
};

const actorOf = (user) =>
  user ? { id: user.id ?? user._id ?? null, name: user.name ?? 'Unknown', role: user.role ?? 'unknown' } : undefined;

const toEntry = ({ actor, action, outcome = 'success', entityType, entityId, classDoc, department, summary, changes, meta }) => ({
  actor: actorOf(actor),
  action,
  outcome,
  entityType: entityType ?? null,
  entityId: entityId ?? null,
  class: classDoc?._id ?? null,
  classCode: classDoc?.code ?? null,
  department: department ?? classDoc?.department ?? null,
  summary: String(summary).slice(0, 500),
  changes: changes ?? [],
  meta,
});

const record = async (input) => {
  try {
    return await AuditLog.create(toEntry(input));
  } catch (err) {
    console.error(`AUDIT WRITE FAILED (${input.action}):`, err.message);
    return null;
  }
};

const recordMany = async (inputs) => {
  if (!inputs.length) return [];
  try {
    return await AuditLog.insertMany(inputs.map(toEntry), { ordered: true });
  } catch (err) {
    console.error(`AUDIT WRITE FAILED (${inputs.length} entries):`, err.message);
    return [];
  }
};

/* ------------------------------------------------------------------ *
 *   Listing
 * ------------------------------------------------------------------ */

/** `YYYY-MM-DD` (institution calendar) -> the instant that day starts. */
const startOfDayInstant = (value, field) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw ApiError.validation('Use the YYYY-MM-DD format', [{ field, message: 'Use the YYYY-MM-DD format' }]);
  }
  return zonedTime(new Date(`${value}T00:00:00.000Z`), '00:00');
};

const buildFilter = async (query) => {
  const filter = {};

  if (query.facultyId) {
    const faculty = await Faculty.findById(query.facultyId).select('user');
    filter['actor.id'] = faculty ? faculty.user : null;
  } else if (query.actorId) {
    filter['actor.id'] = query.actorId;
  }

  if (query.department) filter.department = query.department;
  if (query.classId) filter.class = query.classId;
  if (query.outcome) filter.outcome = query.outcome;

  if (query.action) {
    filter.action = query.action;
  } else if (query.category === 'destructive') {
    filter.outcome = 'denied';
  } else if (query.category && ACTION_CATEGORIES[query.category]) {
    filter.action = new RegExp(`^${escapeRegex(query.category)}\\.`);
  }

  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = startOfDayInstant(query.from, 'from');
    if (query.to) filter.createdAt.$lt = new Date(startOfDayInstant(query.to, 'to').getTime() + DAY_MS);
  }

  if (query.search) {
    filter.summary = new RegExp(escapeRegex(String(query.search).slice(0, 100)), 'i');
  }

  return filter;
};

const toDTO = (doc) => ({
  id: String(doc._id),
  createdAt: doc.createdAt,
  actor: { id: doc.actor?.id ? String(doc.actor.id) : null, name: doc.actor?.name, role: doc.actor?.role },
  action: doc.action,
  outcome: doc.outcome,
  entityType: doc.entityType,
  entityId: doc.entityId ? String(doc.entityId) : null,
  classId: doc.class ? String(doc.class) : null,
  classCode: doc.classCode,
  department: doc.department,
  summary: doc.summary,
  changes: doc.changes ?? [],
  meta: doc.meta ?? null,
});

const list = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = await buildFilter(query);

  const [total, rows] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
  ]);

  return { data: rows.map(toDTO), pagination: buildPagination({ page, limit, total }) };
};

const getById = async (id) => {
  const doc = await AuditLog.findById(id).lean();
  if (!doc) throw ApiError.notFound('Activity entry not found');
  return toDTO(doc);
};

/* ------------------------------------------------------------------ *
 *   Submission timeliness (PB-13)
 * ------------------------------------------------------------------ */

const SUBMISSION_STATUSES = ['on_time', 'late', 'pending', 'missing'];
const MAX_RANGE_DAYS = 366;

const parseDay = (value, field) => {
  startOfDayInstant(value, field); // validates
  return new Date(`${value}T00:00:00.000Z`);
};

/**
 * When attendance for one session is due, measured on the server against the
 * session's scheduled end in the institution's zone — never a client clock.
 */
const deadlineFor = (day, endTime) =>
  new Date(zonedTime(day, endTime).getTime() + policy.SUBMISSION_DEADLINE_HOURS * 60 * 60 * 1000);

const statusFor = ({ deadline, submittedAt, now }) => {
  if (submittedAt) return submittedAt.getTime() <= deadline.getTime() ? 'on_time' : 'late';
  const overdueAt = deadline.getTime() + policy.OVERDUE_AFTER_HOURS * 60 * 60 * 1000;
  return now.getTime() > overdueAt ? 'missing' : 'pending';
};

/**
 * Expected sessions for a class within [from, to]. Scheduled occurrences
 * (PB-22) take precedence; classes without any fall back to the weekly slot.
 * A weekly slot only counts from the day the class was created, unless
 * attendance already exists for an earlier day (imported history).
 */
const expectedSessions = (classDoc, from, to, scheduled = []) => {
  if (scheduled.length) {
    return scheduled.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime, room: s.room ?? null }));
  }

  const firstDay = new Date(`${ymd(classDoc.createdAt)}T00:00:00.000Z`);
  const sessions = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const meeting = Class.meetingOn(classDoc.schedule, weekdayOf(day));
    if (meeting && day >= firstDay) {
      sessions.push({ date: day, startTime: meeting.startTime, endTime: meeting.endTime, room: null });
    }
  }
  return sessions;
};

const submissions = async (query = {}, { now = new Date() } = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const today = todayInInstitution(now);

  let to = query.to ? parseDay(query.to, 'to') : today;
  if (to > today) to = today;
  const from = query.from ? parseDay(query.from, 'from') : addDays(to, -27);

  if (from > to) throw ApiError.validation('The start date must be before the end date', [{ field: 'from', message: 'Choose an earlier start date' }]);
  if ((to - from) / DAY_MS > MAX_RANGE_DAYS) {
    throw ApiError.validation('Choose a range of one year or less', [{ field: 'from', message: 'Range too long' }]);
  }

  const classFilter = { faculty: { $ne: null } };
  if (query.classId) classFilter._id = query.classId;
  if (query.department) classFilter.department = query.department;
  if (query.facultyId) classFilter.faculty = query.facultyId;

  const classes = await Class.find(classFilter)
    .select('name code department schedule faculty students createdAt archivedAt')
    .populate({ path: 'faculty', select: 'user', populate: { path: 'user', select: 'name' } })
    .lean();

  const classIds = classes.map((c) => c._id);
  const [marks, scheduled] = await Promise.all([
    Attendance.aggregate([
      { $match: { class: { $in: classIds }, date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { class: '$class', date: '$date' },
          submittedAt: { $min: '$createdAt' },
          lastChangedAt: { $max: '$updatedAt' },
          marked: { $sum: 1 },
        },
      },
    ]),
    loadScheduledSessions(classIds, from, to),
  ]);

  const markByKey = new Map(marks.map((m) => [`${m._id.class}|${ymd(m._id.date)}`, m]));

  const rows = [];
  classes.forEach((classDoc) => {
    const sessions = expectedSessions(classDoc, from, to, scheduled.get(String(classDoc._id)) ?? []);
    const seenDays = new Set(sessions.map((s) => ymd(s.date)));

    // Days that have attendance but no expected slot (ad-hoc sessions, imports).
    marks
      .filter((m) => String(m._id.class) === String(classDoc._id) && !seenDays.has(ymd(m._id.date)))
      .forEach((m) => {
        const meeting = Class.meetingOn(classDoc.schedule, weekdayOf(m._id.date)) ?? Class.meetingsOf(classDoc.schedule)[0];
        sessions.push({ date: m._id.date, startTime: meeting?.startTime ?? '00:00', endTime: meeting?.endTime ?? '23:59', room: null });
      });

    sessions.forEach((session) => {
      const mark = markByKey.get(`${classDoc._id}|${ymd(session.date)}`);
      const deadline = deadlineFor(session.date, session.endTime);
      const submittedAt = mark?.submittedAt ?? null;
      const status = statusFor({ deadline, submittedAt, now });

      rows.push({
        classId: String(classDoc._id),
        code: classDoc.code,
        name: classDoc.name,
        department: classDoc.department,
        archived: Boolean(classDoc.archivedAt),
        faculty: classDoc.faculty
          ? { id: String(classDoc.faculty._id), name: classDoc.faculty.user?.name ?? '—' }
          : null,
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        room: session.room,
        deadline,
        submittedAt,
        lastChangedAt: mark?.lastChangedAt ?? null,
        marked: mark?.marked ?? 0,
        enrolled: (classDoc.students || []).length,
        status,
        hoursLate:
          status === 'late'
            ? Math.round(((submittedAt - deadline) / 36e5) * 10) / 10
            : status === 'missing' || status === 'pending'
              ? Math.max(0, Math.round(((now - deadline) / 36e5) * 10) / 10)
              : 0,
      });
    });
  });

  const counts = Object.fromEntries(SUBMISSION_STATUSES.map((s) => [s, 0]));
  rows.forEach((row) => {
    counts[row.status] += 1;
  });

  const filtered = query.status && SUBMISSION_STATUSES.includes(query.status) ? rows.filter((r) => r.status === query.status) : rows;
  filtered.sort((a, b) => b.date - a.date || a.code.localeCompare(b.code));

  return {
    data: filtered.slice(skip, skip + limit),
    summary: { ...counts, total: rows.length },
    range: { from: ymd(from), to: ymd(to) },
    pagination: buildPagination({ page, limit, total: filtered.length }),
  };
};

/**
 * Scheduled occurrences per class (PB-22). Resolved lazily so this module does
 * not depend on the schedule model being registered.
 */
const loadScheduledSessions = async (classIds, from, to) => {
  const byClass = new Map();
  let ClassSession;
  try {
    ClassSession = require('../models/ClassSession');
  } catch {
    return byClass;
  }

  const rows = await ClassSession.find({ class: { $in: classIds }, date: { $gte: from, $lte: to }, status: 'scheduled' })
    .select('class date startTime endTime room')
    .lean();
  rows.forEach((row) => {
    const key = String(row.class);
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(row);
  });
  return byClass;
};

module.exports = {
  ACTION_CATEGORIES,
  SUBMISSION_STATUSES,
  record,
  recordMany,
  list,
  getById,
  submissions,
  deadlineFor,
  statusFor,
};
