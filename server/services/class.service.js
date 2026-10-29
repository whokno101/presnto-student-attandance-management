const Class = require('../models/Class');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const policy = require('../config/policy');
const auditService = require('./audit.service');
const { ApiError } = require('../utils/apiError');
const { parsePagination, buildPagination, escapeRegex } = require('../utils/query');
const { assertUnique } = require('./shared');
const { DAY_MS } = require('../utils/dates');

const FACULTY_POPULATE = {
  path: 'faculty',
  select: 'employeeId user',
  populate: { path: 'user', select: 'name email' },
};

const ARCHIVED_BY_POPULATE = { path: 'archivedBy', select: 'name' };

const restoreDeadlineOf = (doc) =>
  doc.archivedAt ? new Date(new Date(doc.archivedAt).getTime() + policy.RETENTION_DAYS * DAY_MS) : null;

const toDTO = (doc) => ({
  id: String(doc._id),
  name: doc.name,
  code: doc.code,
  department: doc.department,
  semester: doc.semester,
  schedule: {
    day: doc.schedule?.day ?? '',
    startTime: doc.schedule?.startTime ?? '',
    endTime: doc.schedule?.endTime ?? '',
  },
  room: doc.room ?? '',
  faculty: doc.faculty
    ? {
        id: String(doc.faculty._id),
        name: doc.faculty.user?.name ?? doc.faculty.employeeId,
        employeeId: doc.faculty.employeeId,
      }
    : null,
  enrolled: Array.isArray(doc.students) ? doc.students.length : 0,
  capacity: doc.capacity ?? 40,
  archived: Boolean(doc.archivedAt),
  archivedAt: doc.archivedAt ?? null,
  archivedBy: doc.archivedBy?.name ?? null,
  restoreDeadline: restoreDeadlineOf(doc),
});

const findByIdOrThrow = async (id) => {
  const classDoc = await Class.findById(id).populate(FACULTY_POPULATE).populate(ARCHIVED_BY_POPULATE);
  if (!classDoc) throw ApiError.notFound('Class not found');
  return classDoc;
};

const assertActive = (classDoc) => {
  if (classDoc.archivedAt) {
    throw ApiError.conflict(`${classDoc.code} is archived. Restore it before making changes.`);
  }
};

/** Maps the flat form payload (day/startTime/endTime) onto the embedded schedule. */
const toSchedule = (payload, current) => ({
  day: payload.day ?? current?.day,
  startTime: payload.startTime ?? current?.startTime,
  endTime: payload.endTime ?? current?.endTime,
});

/** `?status=active` (default) | `archived` | `all` */
const statusFilter = (status) => {
  if (status === 'archived') return { archivedAt: { $ne: null } };
  if (status === 'all') return {};
  return { archivedAt: null };
};

const list = async (query = {}) => {
  const { page, limit, search, skip } = parsePagination(query);

  const filter = statusFilter(query.status);
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { department: rx }];
  }
  if (query.department) filter.department = query.department;

  const sort = query.status === 'archived' ? { archivedAt: -1 } : { createdAt: -1 };

  const [total, rows] = await Promise.all([
    Class.countDocuments(filter),
    Class.find(filter).populate(FACULTY_POPULATE).populate(ARCHIVED_BY_POPULATE).sort(sort).skip(skip).limit(limit),
  ]);

  return { data: rows.map(toDTO), pagination: buildPagination({ page, limit, total }) };
};

/**
 * Resolves a faculty id to an assignable profile. A deactivated account keeps
 * its history but must not take on new classes.
 */
const resolveAssignableFaculty = async (facultyId) => {
  if (!facultyId) return null;

  const faculty = await Faculty.findById(facultyId).populate('user', 'isActive name');

  if (!faculty) {
    throw ApiError.validation('The selected faculty member does not exist', [
      { field: 'facultyId', message: 'Select a valid faculty member' },
    ]);
  }

  if (!faculty.user || faculty.user.isActive === false) {
    throw ApiError.validation('That faculty account is deactivated', [
      { field: 'facultyId', message: 'Only active faculty members can be assigned' },
    ]);
  }

  return faculty;
};

const create = async (payload, actor) => {
  const code = payload.code.toUpperCase();

  await assertUnique({
    model: Class,
    field: 'code',
    value: code,
    message: 'That class code is already in use',
  });
  const faculty = await resolveAssignableFaculty(payload.facultyId);

  const created = await Class.create({
    name: payload.name,
    code,
    department: payload.department,
    semester: payload.semester,
    schedule: toSchedule(payload),
    room: payload.room ?? '',
    faculty: faculty?._id ?? null,
    students: [],
  });

  await auditService.record({
    actor,
    action: 'class.created',
    entityType: 'Class',
    entityId: created._id,
    classDoc: created,
    summary: `Created class ${created.code} — ${created.name}`,
  });

  return toDTO(await findByIdOrThrow(created._id));
};

const TRACKED_FIELDS = ['name', 'code', 'department', 'semester', 'room'];

const update = async (id, payload, actor) => {
  const classDoc = await findByIdOrThrow(id);
  assertActive(classDoc);

  if (payload.code) {
    await assertUnique({
      model: Class,
      field: 'code',
      value: payload.code.toUpperCase(),
      message: 'That class code is already in use',
      excludeId: classDoc._id,
    });
  }

  const before = {
    ...Object.fromEntries(TRACKED_FIELDS.map((f) => [f, classDoc[f] ?? ''])),
    schedule: `${classDoc.schedule?.day} ${classDoc.schedule?.startTime}-${classDoc.schedule?.endTime}`,
  };

  if (payload.name !== undefined) classDoc.name = payload.name;
  if (payload.code !== undefined) classDoc.code = payload.code.toUpperCase();
  if (payload.department !== undefined) classDoc.department = payload.department;
  if (payload.semester !== undefined) classDoc.semester = payload.semester;
  if (payload.room !== undefined) classDoc.room = payload.room;

  if (payload.day !== undefined || payload.startTime !== undefined || payload.endTime !== undefined) {
    // Validate the *merged* schedule: a partial update (startTime only) can
    // still produce an end-before-start pair, which the body schema cannot see.
    const nextSchedule = toSchedule(payload, classDoc.schedule);
    if (nextSchedule.endTime <= nextSchedule.startTime) {
      throw ApiError.validation('End time must be after start time', [
        { field: 'endTime', message: 'End time must be after start time' },
      ]);
    }
    classDoc.schedule = nextSchedule;
  }

  await classDoc.save();

  const after = {
    ...Object.fromEntries(TRACKED_FIELDS.map((f) => [f, classDoc[f] ?? ''])),
    schedule: `${classDoc.schedule?.day} ${classDoc.schedule?.startTime}-${classDoc.schedule?.endTime}`,
  };
  const changes = Object.keys(after)
    .filter((field) => String(before[field]) !== String(after[field]))
    .map((field) => ({ field, from: before[field], to: after[field] }));

  if (changes.length) {
    await auditService.record({
      actor,
      action: 'class.updated',
      entityType: 'Class',
      entityId: classDoc._id,
      classDoc,
      summary: `Updated ${classDoc.code}: ${changes.map((c) => c.field).join(', ')}`,
      changes,
    });
  }

  if (payload.facultyId !== undefined) {
    await assignFaculty(id, payload.facultyId, actor);
  }

  return toDTO(await findByIdOrThrow(id));
};

/**
 * Assigns (or unassigns with `facultyId = null`) the teacher of a class.
 *
 * `Class.faculty` and `Faculty.classesAssigned` are two documents in two
 * collections, so a standalone MongoDB deployment cannot wrap them in a
 * transaction. The class is the authoritative side: it is written first and
 * rolled back if mirroring into the old/new faculty profile fails.
 */
const assignFaculty = async (classId, facultyId, actor) => {
  const classDoc = await Class.findById(classId).select('_id code name department faculty archivedAt');
  if (!classDoc) throw ApiError.notFound('Class not found');
  assertActive(classDoc);

  const previousFacultyId = classDoc.faculty ? String(classDoc.faculty) : null;
  const nextFaculty = await resolveAssignableFaculty(facultyId);
  const nextFacultyId = nextFaculty ? String(nextFaculty._id) : null;

  // Idempotent: re-submitting the current assignment is a no-op, not an error.
  if (previousFacultyId === nextFacultyId) {
    return toDTO(await findByIdOrThrow(classId));
  }

  // An instructor cannot take on a class whose scheduled sessions overlap
  // their existing teaching (PB-23). Checked and written under the schedule
  // lock so a concurrent booking for the same teacher cannot slip in between.
  const scheduleService = require('./schedule.service');
  await scheduleService.withScheduleLock(async () => {
    if (nextFacultyId) await scheduleService.assertInstructorFree(classDoc._id, nextFacultyId);

    await Class.updateOne({ _id: classDoc._id }, { $set: { faculty: nextFacultyId } });

    try {
      if (nextFacultyId) {
        await Faculty.updateOne(
          { _id: nextFacultyId },
          { $addToSet: { classesAssigned: classDoc._id } }
        );
      }
      if (previousFacultyId) {
        await Faculty.updateOne(
          { _id: previousFacultyId },
          { $pull: { classesAssigned: classDoc._id } }
        );
      }
    } catch (err) {
      // Put the class back where it was so the two sides cannot drift.
      await Class.updateOne({ _id: classDoc._id }, { $set: { faculty: previousFacultyId } }).catch(
        () => {}
      );
      await Faculty.updateOne(
        { _id: nextFacultyId },
        { $pull: { classesAssigned: classDoc._id } }
      ).catch(() => {});
      throw err;
    }

    await scheduleService.syncFaculty(classDoc._id, nextFacultyId);
  });

  const previousName = previousFacultyId
    ? (await Faculty.findById(previousFacultyId).populate('user', 'name'))?.user?.name ?? 'previous teacher'
    : null;
  const nextName = nextFaculty?.user?.name ?? null;

  await auditService.record({
    actor,
    action: nextFacultyId ? 'class.faculty_assigned' : 'class.faculty_unassigned',
    entityType: 'Class',
    entityId: classDoc._id,
    classDoc,
    summary: nextFacultyId
      ? `Assigned ${nextName} to ${classDoc.code}${previousName ? ` (was ${previousName})` : ''}`
      : `Unassigned ${previousName} from ${classDoc.code}`,
    changes: [{ field: 'faculty', from: previousName, to: nextName }],
  });

  return toDTO(await findByIdOrThrow(classId));
};

/** Enrolled students for a class, ordered by student id. */
const listRoster = async (classId) => {
  const classDoc = await Class.findById(classId).select('students');
  if (!classDoc) throw ApiError.notFound('Class not found');

  const students = await Student.find({ _id: { $in: classDoc.students || [] } })
    .populate('user', 'name email isActive')
    .sort({ studentId: 1 });

  return students.map((student) => ({
    id: String(student._id),
    name: student.user?.name ?? '—',
    email: student.user?.email ?? '—',
    studentId: student.studentId,
    department: student.department,
    isActive: student.user?.isActive ?? false,
  }));
};

/**
 * Archive (PB-14). The class leaves every active list, but its roster and its
 * attendance history stay exactly as they were and remain readable in
 * reports. Future scheduled sessions are cancelled so the room and teacher are
 * free again. Restorable for RETENTION_DAYS.
 */
const archive = async (id, actor) => {
  const classDoc = await findByIdOrThrow(id);

  if (classDoc.archivedAt) {
    await auditService.record({
      actor,
      action: 'class.archive_rejected',
      outcome: 'failure',
      entityType: 'Class',
      entityId: classDoc._id,
      classDoc,
      summary: `Archive of ${classDoc.code} rejected: already archived`,
    });
    throw ApiError.conflict(`${classDoc.code} is already archived`);
  }

  const [attendanceRecords, cancelledSessions] = await Promise.all([
    Attendance.countDocuments({ class: classDoc._id }),
    require('./schedule.service').cancelFutureSessions(classDoc._id, actor),
  ]);

  classDoc.archivedAt = new Date();
  classDoc.archivedBy = actor?.id ?? null;
  await classDoc.save();

  await auditService.record({
    actor,
    action: 'class.archived',
    entityType: 'Class',
    entityId: classDoc._id,
    classDoc,
    summary: `Archived ${classDoc.code} — ${classDoc.name}. ${attendanceRecords} attendance records retained${
      cancelledSessions ? `, ${cancelledSessions} future sessions cancelled` : ''
    }.`,
    meta: { attendanceRecords, enrolled: classDoc.students.length, cancelledSessions },
  });

  return toDTO(await findByIdOrThrow(id));
};

/** Restore an archived class within the retention window (PB-14). */
const restore = async (id, actor) => {
  const classDoc = await findByIdOrThrow(id);

  const reject = async (reason, message) => {
    await auditService.record({
      actor,
      action: 'class.restore_rejected',
      outcome: 'failure',
      entityType: 'Class',
      entityId: classDoc._id,
      classDoc,
      summary: `Restore of ${classDoc.code} rejected: ${reason}`,
    });
    throw ApiError.conflict(message);
  };

  if (!classDoc.archivedAt) {
    await reject('not archived', `${classDoc.code} is not archived`);
  }

  const deadline = restoreDeadlineOf(classDoc);
  if (Date.now() > deadline.getTime()) {
    await reject(
      'retention window passed',
      `${classDoc.code} was archived more than ${policy.RETENTION_DAYS} days ago and can no longer be restored`
    );
  }

  classDoc.archivedAt = null;
  classDoc.archivedBy = null;
  await classDoc.save();

  await auditService.record({
    actor,
    action: 'class.restored',
    entityType: 'Class',
    entityId: classDoc._id,
    classDoc,
    summary: `Restored ${classDoc.code} — ${classDoc.name}`,
  });

  return toDTO(await findByIdOrThrow(id));
};

module.exports = {
  FACULTY_POPULATE,
  list,
  create,
  update,
  archive,
  restore,
  assignFaculty,
  listRoster,
  findByIdOrThrow,
  toDTO,
  assertActive,
};
