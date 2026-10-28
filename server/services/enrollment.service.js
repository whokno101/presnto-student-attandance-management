/**
 * Enrollment keeps two lists in sync:
 *   Class.students[]          -> who attends
 *   Student.enrolledClasses[] -> what a student is taking
 *
 * Standalone MongoDB has no multi-document transactions, so the class side is
 * written with a single conditional update (which is atomic *per document* and
 * doubles as the concurrency guard for seat limits), then the student side is
 * written and compensated if it fails.
 */
const Class = require('../models/Class');
const Student = require('../models/Student');
const { ApiError } = require('../utils/apiError');
const { escapeRegex } = require('../utils/query');
const { requireFacultyProfile, requireStudentProfile } = require('./access.service');
const { FACULTY_POPULATE, toDTO, findByIdOrThrow } = require('./class.service');

const asId = (value) => (value ? String(value) : null);

/** Annotates a class DTO with per-student enrollment state. */
const withStudentState = (classDoc, enrolledIds) => {
  const dto = toDTO(classDoc);
  const isEnrolled = enrolledIds.has(dto.id);

  return {
    ...dto,
    isEnrolled,
    isFull: dto.enrolled >= dto.capacity,
    seatsLeft: Math.max(0, dto.capacity - dto.enrolled),
  };
};

const enrolledClassIdSet = async (studentId) => {
  if (!studentId) return new Set();
  const rows = await Class.find({ students: studentId }).select('_id').lean();
  return new Set(rows.map((row) => String(row._id)));
};

/**
 * Enrolls one student in one class.
 * @param {{ classId: string, studentId: string }} input
 */
const enroll = async ({ classId, studentId }) => {
  const classDoc = await Class.findById(classId).select('_id code name capacity students');
  if (!classDoc) throw ApiError.notFound('Class not found');

  const student = await Student.findById(studentId).select('_id studentId');
  if (!student) throw ApiError.notFound('Student not found');

  const alreadyEnrolled = (classDoc.students || []).some((id) => asId(id) === asId(studentId));
  if (alreadyEnrolled) {
    throw ApiError.conflict('This student is already enrolled in this class');
  }

  // Conditional update: only writes when the roster is below capacity and the
  // student is not already listed. `matchedCount === 0` means one of the two
  // guards tripped (including a concurrent request winning the race).
  const result = await Class.updateOne(
    {
      _id: classDoc._id,
      students: { $ne: student._id },
      $expr: {
        $lt: [{ $size: { $ifNull: ['$students', []] } }, { $ifNull: ['$capacity', 40] }],
      },
    },
    { $addToSet: { students: student._id } }
  );

  if (result.matchedCount === 0) {
    const current = await Class.findById(classDoc._id).select('students capacity');
    if (!current) throw ApiError.notFound('Class not found');
    if ((current.students || []).some((id) => asId(id) === asId(studentId))) {
      throw ApiError.conflict('This student is already enrolled in this class');
    }
    throw ApiError.conflict(`This class is full (${current.capacity} seats)`);
  }

  try {
    const mirrored = await Student.updateOne(
      { _id: student._id },
      { $addToSet: { enrolledClasses: classDoc._id } }
    );
    if (mirrored.matchedCount === 0) throw ApiError.notFound('Student not found');
  } catch (err) {
    // Roll the seat back so the roster never references a student that does
    // not list the class.
    await Class.updateOne({ _id: classDoc._id }, { $pull: { students: student._id } }).catch(
      () => {}
    );
    throw err;
  }

  return toDTO(await findByIdOrThrow(classDoc._id));
};

/** Removes one student from one class. */
const unenroll = async ({ classId, studentId }) => {
  const classDoc = await Class.findById(classId).select('_id students');
  if (!classDoc) throw ApiError.notFound('Class not found');

  const student = await Student.findById(studentId).select('_id');
  if (!student) throw ApiError.notFound('Student not found');

  const result = await Class.updateOne(
    { _id: classDoc._id, students: student._id },
    { $pull: { students: student._id } }
  );

  if (result.matchedCount === 0) {
    throw ApiError.conflict('This student is not enrolled in this class');
  }

  try {
    await Student.updateOne(
      { _id: student._id },
      { $pull: { enrolledClasses: classDoc._id } }
    );
  } catch (err) {
    await Class.updateOne(
      { _id: classDoc._id },
      { $addToSet: { students: student._id } }
    ).catch(() => {});
    throw err;
  }

  // Attendance history is deliberately kept: it is an audit trail of the time
  // the student actually spent in the class.
  return toDTO(await findByIdOrThrow(classDoc._id));
};

/**
 * GET /api/classes/mine — the caller's own teaching/study load.
 * Admin gets every class so the shared page still renders something sensible.
 */
const listMine = async (user) => {
  if (user.role === 'faculty') {
    const profile = await requireFacultyProfile(user.id);
    const rows = await Class.find({ faculty: profile._id })
      .populate(FACULTY_POPULATE)
      .sort({ code: 1 });
    return { role: 'faculty', data: rows.map(toDTO) };
  }

  if (user.role === 'student') {
    const profile = await requireStudentProfile(user.id);
    const rows = await Class.find({ students: profile._id })
      .populate(FACULTY_POPULATE)
      .sort({ code: 1 });
    const enrolledIds = new Set(rows.map((row) => String(row._id)));
    return { role: 'student', data: rows.map((row) => withStudentState(row, enrolledIds)) };
  }

  const rows = await Class.find({}).populate(FACULTY_POPULATE).sort({ code: 1 });
  return { role: 'admin', data: rows.map(toDTO) };
};

/**
 * GET /api/classes/available — the catalog annotated with the student's
 * enrollment state, so the page can render both Enroll and Unenroll buttons.
 */
const listAvailable = async (user, query = {}) => {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  let filter = {};

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter = { $or: [{ name: rx }, { code: rx }, { department: rx }] };
  }

  const profile =
    user.role === 'student' ? await requireStudentProfile(user.id) : null;

  const [rows, enrolledIds] = await Promise.all([
    Class.find(filter).populate(FACULTY_POPULATE).sort({ code: 1 }),
    enrolledClassIdSet(profile?._id),
  ]);

  return { data: rows.map((row) => withStudentState(row, enrolledIds)) };
};

module.exports = { enroll, unenroll, listMine, listAvailable };
