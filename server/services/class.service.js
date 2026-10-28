const Class = require('../models/Class');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const { ApiError } = require('../utils/apiError');
const { parsePagination, buildPagination, escapeRegex } = require('../utils/query');
const { assertUnique } = require('./shared');

const FACULTY_POPULATE = {
  path: 'faculty',
  select: 'employeeId user',
  populate: { path: 'user', select: 'name email' },
};

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
  faculty: doc.faculty
    ? {
        id: String(doc.faculty._id),
        name: doc.faculty.user?.name ?? doc.faculty.employeeId,
        employeeId: doc.faculty.employeeId,
      }
    : null,
  enrolled: Array.isArray(doc.students) ? doc.students.length : 0,
  capacity: doc.capacity ?? 40,
});

const findByIdOrThrow = async (id) => {
  const classDoc = await Class.findById(id).populate(FACULTY_POPULATE);
  if (!classDoc) throw ApiError.notFound('Class not found');
  return classDoc;
};

/** Maps the flat form payload (day/startTime/endTime) onto the embedded schedule. */
const toSchedule = (payload, current) => ({
  day: payload.day ?? current?.day,
  startTime: payload.startTime ?? current?.startTime,
  endTime: payload.endTime ?? current?.endTime,
});

const list = async (query = {}) => {
  const { page, limit, search, skip } = parsePagination(query);

  let filter = {};
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter = { $or: [{ name: rx }, { code: rx }, { department: rx }] };
  }

  const [total, rows] = await Promise.all([
    Class.countDocuments(filter),
    Class.find(filter).populate(FACULTY_POPULATE).sort({ createdAt: -1 }).skip(skip).limit(limit),
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

const create = async (payload) => {
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
    faculty: faculty?._id ?? null,
    students: [],
  });

  return toDTO(await findByIdOrThrow(created._id));
};

const update = async (id, payload) => {
  const classDoc = await findByIdOrThrow(id);

  if (payload.code) {
    await assertUnique({
      model: Class,
      field: 'code',
      value: payload.code.toUpperCase(),
      message: 'That class code is already in use',
      excludeId: classDoc._id,
    });
  }

  if (payload.name !== undefined) classDoc.name = payload.name;
  if (payload.code !== undefined) classDoc.code = payload.code.toUpperCase();
  if (payload.department !== undefined) classDoc.department = payload.department;
  if (payload.semester !== undefined) classDoc.semester = payload.semester;

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

  if (payload.facultyId !== undefined) {
    await assignFaculty(id, payload.facultyId);
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
const assignFaculty = async (classId, facultyId) => {
  const classDoc = await Class.findById(classId).select('_id code faculty');
  if (!classDoc) throw ApiError.notFound('Class not found');

  const previousFacultyId = classDoc.faculty ? String(classDoc.faculty) : null;
  const nextFaculty = await resolveAssignableFaculty(facultyId);
  const nextFacultyId = nextFaculty ? String(nextFaculty._id) : null;

  // Idempotent: re-submitting the current assignment is a no-op, not an error.
  if (previousFacultyId === nextFacultyId) {
    return toDTO(await findByIdOrThrow(classId));
  }

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
 * Hard delete. The model's findOneAndDelete hook detaches the class from its
 * faculty/students and removes its attendance records.
 */
const remove = async (id) => {
  const deleted = await Class.findOneAndDelete({ _id: id });
  if (!deleted) throw ApiError.notFound('Class not found');
  return { id: String(deleted._id) };
};

module.exports = {
  FACULTY_POPULATE,
  list,
  create,
  update,
  remove,
  assignFaculty,
  listRoster,
  findByIdOrThrow,
  toDTO,
};
