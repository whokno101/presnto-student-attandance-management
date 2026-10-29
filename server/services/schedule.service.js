/**
 * Class schedules (PB-22) and the conflict engine (PB-23).
 *
 * Every path that books a room/instructor — the multi-date form, CSV import,
 * restoring an archived class, assigning a teacher — goes through
 * `findConflicts`, and writes happen inside `withScheduleLock`, so two admins
 * saving at the same moment cannot both pass the check (standalone MongoDB has
 * no multi-document transactions).
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const ClassSession = require('../models/ClassSession');
const Class = require('../models/Class');
const Faculty = require('../models/Faculty');
const auditService = require('./audit.service');
const { ApiError } = require('../utils/apiError');
const { todayInInstitution, addDays, weekdayOf, toMinutes, ymd, DAY_MS, WEEKDAYS } = require('../utils/dates');

const MAX_OCCURRENCES = 200;
const MAX_RANGE_DAYS = 366;

/* ------------------------------------------------------------------ *
 *   Lock
 * ------------------------------------------------------------------ */

const ScheduleLock =
  mongoose.models.ScheduleLock ||
  mongoose.model(
    'ScheduleLock',
    new mongoose.Schema({ _id: String, lockedUntil: Date, owner: String }, { versionKey: false })
  );

const LOCK_TTL_MS = 10000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withScheduleLock = async (fn) => {
  const owner = crypto.randomUUID();
  let acquired = false;

  for (let attempt = 0; attempt < 100 && !acquired; attempt += 1) {
    const now = new Date();
    try {
      // eslint-disable-next-line no-await-in-loop
      const lock = await ScheduleLock.findOneAndUpdate(
        { _id: 'schedule', lockedUntil: { $lt: now } },
        { $set: { lockedUntil: new Date(now.getTime() + LOCK_TTL_MS), owner } },
        { upsert: true, new: true }
      );
      acquired = lock?.owner === owner;
    } catch (err) {
      // The upsert races an existing, still-held lock: duplicate key. Retry.
      if (err.code !== 11000) throw err;
    }
    // eslint-disable-next-line no-await-in-loop
    if (!acquired) await sleep(50);
  }

  if (!acquired) throw ApiError.conflict('The schedule is being updated by someone else. Try again in a moment.');

  // Keep extending the lease while the work runs, so a long import cannot
  // outlive the lock and let another writer in.
  const heartbeat = setInterval(() => {
    ScheduleLock.updateOne(
      { _id: 'schedule', owner },
      { $set: { lockedUntil: new Date(Date.now() + LOCK_TTL_MS) } }
    ).catch(() => {});
  }, LOCK_TTL_MS / 3);

  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    await ScheduleLock.updateOne({ _id: 'schedule', owner }, { $set: { lockedUntil: new Date(0) } });
  }
};

/* ------------------------------------------------------------------ *
 *   Occurrences
 * ------------------------------------------------------------------ */

const dayFrom = (value, field) => {
  const day = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(day.getTime()) || ymd(day) !== value) {
    throw ApiError.validation(`${value} is not a valid date`, [{ field, message: 'Use the YYYY-MM-DD format' }]);
  }
  return day;
};

/**
 * Expands individual dates and/or a weekly recurrence into a sorted, unique
 * list of days.
 * @param {{ dates?: string[], recurrence?: { days: string[], from: string, to: string } }} input
 */
const expandDates = ({ dates = [], recurrence } = {}) => {
  const days = new Map();
  dates.forEach((value, index) => days.set(value, dayFrom(value, `dates[${index}]`)));

  if (recurrence && recurrence.days?.length) {
    const from = dayFrom(recurrence.from, 'recurrence.from');
    const to = dayFrom(recurrence.to, 'recurrence.to');
    if (to < from) {
      throw ApiError.validation('The recurrence must end after it starts', [{ field: 'recurrence.to', message: 'Choose a later end date' }]);
    }
    if ((to - from) / DAY_MS > MAX_RANGE_DAYS) {
      throw ApiError.validation('A recurrence can span at most one year', [{ field: 'recurrence.to', message: 'Range too long' }]);
    }
    const wanted = new Set(recurrence.days);
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (wanted.has(weekdayOf(day))) days.set(ymd(day), day);
    }
  }

  const list = [...days.values()].sort((a, b) => a - b);
  if (list.length === 0) {
    throw ApiError.validation('Select at least one date or a weekly pattern', [{ field: 'dates', message: 'No dates selected' }]);
  }
  if (list.length > MAX_OCCURRENCES) {
    throw ApiError.validation(`At most ${MAX_OCCURRENCES} occurrences can be scheduled at once`, [{ field: 'dates', message: 'Too many dates' }]);
  }
  return list;
};

const validateSlot = ({ startTime, endTime, days }) => {
  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);
  if (!(endMinutes > startMinutes)) {
    throw ApiError.validation('End time must be after start time', [{ field: 'endTime', message: 'End time must be after start time' }]);
  }
  const today = todayInInstitution();
  const past = days.filter((day) => day < today);
  if (past.length) {
    throw ApiError.validation(`Sessions cannot be scheduled in the past (${past.map(ymd).join(', ')})`, [
      { field: 'dates', message: 'Remove past dates' },
    ]);
  }
  return { startMinutes, endMinutes };
};

/* ------------------------------------------------------------------ *
 *   Conflict engine
 * ------------------------------------------------------------------ */

const overlaps = (a, b) => a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;

/**
 * Conflicts for proposed occurrences against booked sessions (and against
 * each other when `proposals` holds several classes, e.g. a CSV import).
 *
 * @param {Array<{ key?: string, classId: string, facultyId: string|null, room: string, date: Date,
 *                 startMinutes: number, endMinutes: number }>} proposals
 * @param {{ ignoreSessionIds?: string[] }} options
 * @returns {Promise<Map<number, Array<object>>>} proposal index -> conflicts
 */
const findConflicts = async (proposals, { ignoreSessionIds = [] } = {}) => {
  const result = new Map();
  if (!proposals.length) return result;

  const dates = [...new Set(proposals.map((p) => p.date.getTime()))].map((t) => new Date(t));
  const rooms = [...new Set(proposals.map((p) => p.room))];
  const facultyIds = [...new Set(proposals.map((p) => p.facultyId).filter(Boolean))];

  const booked = await ClassSession.find({
    status: 'scheduled',
    date: { $in: dates },
    $or: [{ room: { $in: rooms } }, ...(facultyIds.length ? [{ faculty: { $in: facultyIds } }] : [])],
    ...(ignoreSessionIds.length ? { _id: { $nin: ignoreSessionIds } } : {}),
  })
    .populate('class', 'code name archivedAt')
    .populate({ path: 'faculty', select: 'user', populate: { path: 'user', select: 'name' } })
    .lean();

  const describe = (session, type) => ({
    type,
    sessionId: session._id ? String(session._id) : null,
    classId: String(session.class?._id ?? session.classId ?? ''),
    classCode: session.class?.code ?? session.classCode ?? '—',
    className: session.class?.name ?? session.className ?? '',
    date: ymd(session.date),
    startTime: session.startTime,
    endTime: session.endTime,
    room: session.room,
    instructor: session.faculty?.user?.name ?? session.instructorName ?? null,
  });

  proposals.forEach((proposal, index) => {
    const conflicts = [];
    const sameDay = (s) => s.date.getTime() === proposal.date.getTime() && overlaps(s, proposal);

    booked.filter(sameDay).forEach((session) => {
      if (session.class?.archivedAt) return;
      if (session.room === proposal.room) conflicts.push(describe(session, 'room'));
      if (proposal.facultyId && session.faculty && String(session.faculty._id) === String(proposal.facultyId)) {
        conflicts.push(describe(session, 'instructor'));
      }
    });

    // Within the same request (multi-class imports).
    proposals.forEach((other, otherIndex) => {
      if (otherIndex >= index || !sameDay(other)) return;
      const asSession = { ...other, startTime: other.startTime, endTime: other.endTime };
      if (other.room === proposal.room) conflicts.push({ ...describe(asSession, 'room'), withinRequest: true });
      if (proposal.facultyId && other.facultyId && String(other.facultyId) === String(proposal.facultyId)) {
        conflicts.push({ ...describe(asSession, 'instructor'), withinRequest: true });
      }
    });

    if (conflicts.length) result.set(index, conflicts);
  });

  return result;
};

/** Human-readable reason for one conflict. */
const explain = (conflict) =>
  conflict.type === 'room'
    ? `Room ${conflict.room} is already booked for ${conflict.classCode} ${conflict.startTime}–${conflict.endTime}`
    : `${conflict.instructor ?? 'The instructor'} already teaches ${conflict.classCode} ${conflict.startTime}–${conflict.endTime}`;

/* ------------------------------------------------------------------ *
 *   Preview + create (PB-22)
 * ------------------------------------------------------------------ */

const loadClassForScheduling = async (classId) => {
  const classDoc = await Class.findById(classId)
    .select('code name department faculty room archivedAt')
    .populate({ path: 'faculty', select: 'user', populate: { path: 'user', select: 'name' } });
  if (!classDoc) throw ApiError.notFound('Class not found');
  if (classDoc.archivedAt) throw ApiError.conflict(`${classDoc.code} is archived; restore it before scheduling`);
  return classDoc;
};

const buildProposals = (classDoc, { room, startTime, endTime, days }) => {
  const { startMinutes, endMinutes } = validateSlot({ startTime, endTime, days });
  const resolvedRoom = String(room || classDoc.room || '').trim().toUpperCase();
  if (!resolvedRoom) {
    throw ApiError.validation('A room is required', [{ field: 'room', message: 'Enter a room' }]);
  }
  return days.map((date) => ({
    classId: String(classDoc._id),
    classCode: classDoc.code,
    className: classDoc.name,
    facultyId: classDoc.faculty ? String(classDoc.faculty._id) : null,
    instructorName: classDoc.faculty?.user?.name ?? null,
    room: resolvedRoom,
    date,
    startTime,
    endTime,
    startMinutes,
    endMinutes,
  }));
};

const toOccurrences = (proposals, conflictMap) =>
  proposals.map((p, index) => {
    const conflicts = conflictMap.get(index) ?? [];
    return {
      date: ymd(p.date),
      weekday: weekdayOf(p.date),
      startTime: p.startTime,
      endTime: p.endTime,
      room: p.room,
      ok: conflicts.length === 0,
      conflicts: conflicts.map((c) => ({ ...c, reason: explain(c) })),
    };
  });

/** POST /api/schedule/preview — expand dates and check every one; writes nothing. */
const preview = async (payload) => {
  const classDoc = await loadClassForScheduling(payload.classId);
  const days = expandDates(payload);
  const proposals = buildProposals(classDoc, { ...payload, days });
  const conflictMap = await findConflicts(proposals);
  const occurrences = toOccurrences(proposals, conflictMap);
  return {
    class: { id: String(classDoc._id), code: classDoc.code, name: classDoc.name, instructor: classDoc.faculty?.user?.name ?? null },
    occurrences,
    summary: { total: occurrences.length, ok: occurrences.filter((o) => o.ok).length, conflicting: occurrences.filter((o) => !o.ok).length },
  };
};

/**
 * POST /api/schedule — all-or-nothing: re-validated under the lock at save
 * time; any conflict rejects the whole request with the per-date reasons.
 */
const create = async (payload, actor) =>
  withScheduleLock(async () => {
    const classDoc = await loadClassForScheduling(payload.classId);
    const days = expandDates({ dates: payload.dates });
    const proposals = buildProposals(classDoc, { ...payload, days });
    const conflictMap = await findConflicts(proposals);

    if (conflictMap.size) {
      const occurrences = toOccurrences(proposals, conflictMap);
      await auditService.record({
        actor,
        action: 'schedule.rejected',
        outcome: 'failure',
        entityType: 'Class',
        entityId: classDoc._id,
        classDoc,
        summary: `Schedule for ${classDoc.code} rejected: ${conflictMap.size} of ${proposals.length} dates conflict`,
        meta: { rejected: occurrences.filter((o) => !o.ok).map((o) => o.date) },
      });
      throw ApiError.conflict(
        `${conflictMap.size} of ${proposals.length} dates conflict with existing bookings. Nothing was saved.`,
        occurrences
          .filter((o) => !o.ok)
          .map((o) => ({ field: o.date, message: o.conflicts.map((c) => c.reason).join('; ') }))
      );
    }

    const batchId = crypto.randomUUID();
    const created = await ClassSession.insertMany(
      proposals.map((p) => ({
        class: classDoc._id,
        faculty: p.facultyId,
        room: p.room,
        date: p.date,
        startTime: p.startTime,
        endTime: p.endTime,
        startMinutes: p.startMinutes,
        endMinutes: p.endMinutes,
        batchId,
        createdBy: actor?.id ?? null,
      }))
    );

    await auditService.record({
      actor,
      action: 'schedule.created',
      entityType: 'Class',
      entityId: classDoc._id,
      classDoc,
      summary: `Scheduled ${created.length} session${created.length === 1 ? '' : 's'} for ${classDoc.code} in ${proposals[0].room}, ${payload.startTime}–${payload.endTime}`,
      meta: { batchId, dates: proposals.map((p) => ymd(p.date)) },
    });

    return {
      saved: created.map((s) => ymd(s.date)),
      rejected: [],
      sessions: created.map(toSessionDTO),
    };
  });

/**
 * Books sessions for several classes at once (CSV import). Caller has already
 * validated rows; conflicts are checked across the whole batch and against the
 * calendar under the lock. Returns per-row conflicts without writing anything
 * when `dryRun` is set.
 */
const bookMany = async (rows, actor, { dryRun = false } = {}) => {
  const run = async () => {
    const conflictMap = await findConflicts(rows);
    if (dryRun || conflictMap.size) return { conflictMap, created: [] };
    const batchId = crypto.randomUUID();
    const created = await ClassSession.insertMany(
      rows.map((p) => ({
        class: p.classId,
        faculty: p.facultyId,
        room: p.room,
        date: p.date,
        startTime: p.startTime,
        endTime: p.endTime,
        startMinutes: p.startMinutes,
        endMinutes: p.endMinutes,
        batchId,
        createdBy: actor?.id ?? null,
      }))
    );
    return { conflictMap, created };
  };
  return dryRun ? run() : withScheduleLock(run);
};

/* ------------------------------------------------------------------ *
 *   Listing, cancelling, class lifecycle hooks
 * ------------------------------------------------------------------ */

const toSessionDTO = (s) => ({
  id: String(s._id),
  classId: String(s.class?._id ?? s.class),
  classCode: s.class?.code,
  className: s.class?.name,
  instructor: s.faculty?.user?.name ?? null,
  room: s.room,
  date: ymd(s.date),
  weekday: weekdayOf(s.date),
  startTime: s.startTime,
  endTime: s.endTime,
  status: s.status,
  cancelledReason: s.cancelledReason,
});

const list = async (query = {}) => {
  const filter = {};
  if (query.classId) filter.class = query.classId;
  if (query.room) filter.room = String(query.room).toUpperCase();
  if (query.facultyId) filter.faculty = query.facultyId;
  filter.status = query.status === 'all' ? { $in: ['scheduled', 'cancelled'] } : query.status === 'cancelled' ? 'cancelled' : 'scheduled';
  const from = query.from ? dayFrom(query.from, 'from') : todayInInstitution();
  const to = query.to ? dayFrom(query.to, 'to') : addDays(from, 90);
  filter.date = { $gte: from, $lte: to };

  const rows = await ClassSession.find(filter)
    .sort({ date: 1, startMinutes: 1 })
    .limit(500)
    .populate('class', 'code name')
    .populate({ path: 'faculty', select: 'user', populate: { path: 'user', select: 'name' } })
    .lean();
  return { data: rows.map(toSessionDTO), range: { from: ymd(from), to: ymd(to) } };
};

const cancel = async (id, actor) => {
  const session = await ClassSession.findById(id).populate('class', 'code name department');
  if (!session) throw ApiError.notFound('Session not found');
  if (session.status === 'cancelled') throw ApiError.conflict('This session is already cancelled');
  session.status = 'cancelled';
  session.cancelledReason = 'cancelled by administrator';
  await session.save();
  await auditService.record({
    actor,
    action: 'schedule.cancelled',
    entityType: 'ClassSession',
    entityId: session._id,
    classDoc: session.class,
    summary: `Cancelled ${session.class?.code} session on ${ymd(session.date)} ${session.startTime}–${session.endTime} (${session.room})`,
  });
  return toSessionDTO(session);
};

/** Archiving a class frees its future bookings (PB-14). Returns the count. */
const cancelFutureSessions = async (classId) => {
  const result = await ClassSession.updateMany(
    { class: classId, status: 'scheduled', date: { $gte: todayInInstitution() } },
    { $set: { status: 'cancelled', cancelledReason: 'class archived' } }
  );
  return result.modifiedCount ?? 0;
};

/**
 * Before assigning `facultyId` to a class, make sure none of the class's
 * future sessions overlap that teacher's other sessions (PB-23).
 */
const assertInstructorFree = async (classId, facultyId) => {
  const sessions = await ClassSession.find({ class: classId, status: 'scheduled', date: { $gte: todayInInstitution() } }).lean();
  if (!sessions.length) return;

  const proposals = sessions.map((s) => ({ ...s, classId: String(classId), facultyId: String(facultyId), room: `__${s._id}` }));
  const conflictMap = await findConflicts(proposals, { ignoreSessionIds: sessions.map((s) => s._id) });
  const instructorConflicts = [...conflictMap.values()].flat().filter((c) => c.type === 'instructor');
  if (instructorConflicts.length) {
    const faculty = await Faculty.findById(facultyId).populate('user', 'name');
    throw ApiError.conflict(
      `${faculty?.user?.name ?? 'That teacher'} has ${instructorConflicts.length} overlapping session(s) with this class`,
      instructorConflicts.map((c) => ({ field: c.date, message: explain(c) }))
    );
  }
};

/** Keep the instructor on every future session in step with the class (null = unassigned). */
const syncFaculty = (classId, facultyId) =>
  ClassSession.updateMany(
    { class: classId, status: 'scheduled', date: { $gte: todayInInstitution() } },
    { $set: { faculty: facultyId || null } }
  );

module.exports = {
  WEEKDAYS,
  MAX_OCCURRENCES,
  withScheduleLock,
  expandDates,
  validateSlot,
  findConflicts,
  explain,
  preview,
  create,
  bookMany,
  list,
  cancel,
  cancelFutureSessions,
  assertInstructorFree,
  syncFaculty,
  dayFrom,
};
