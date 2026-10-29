/**
 * Ownership / tenancy rules live here so route handlers stay thin and every
 * endpoint enforces the same definition of "own classes" and "own record".
 *
 *   faculty  -> may only touch classes where class.faculty === their Faculty._id
 *   student  -> may only read/write attendance for their own Student._id
 *   admin    -> unrestricted
 */
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const Class = require('../models/Class');
const { ApiError } = require('../utils/apiError');

const getFacultyProfile = (userId) => Faculty.findOne({ user: userId });

const getStudentProfile = (userId) => Student.findOne({ user: userId });

const requireFacultyProfile = async (userId) => {
  const profile = await getFacultyProfile(userId);
  if (!profile) {
    throw ApiError.forbidden('No faculty profile is linked to this account');
  }
  return profile;
};

const requireStudentProfile = async (userId) => {
  const profile = await getStudentProfile(userId);
  if (!profile) {
    throw ApiError.forbidden('No student profile is linked to this account');
  }
  return profile;
};

/**
 * Loads a class and proves the caller may act on it.
 * @param {{id:string, role:string}} user  req.user
 * @param {string} classId
 * @param {{ requireOwner?: boolean }} options
 *        requireOwner=true is used by write paths (mark attendance) where even
 *        an admin claiming "faculty" semantics must match class.faculty.
 */
const assertClassAccess = async (user, classId, options = {}) => {
  if (!classId) {
    throw ApiError.validation('A classId is required');
  }

  const classDoc = await Class.findById(classId).select('_id name code department faculty students schedule archivedAt');
  if (!classDoc) {
    throw ApiError.notFound('Class not found');
  }

  if (user.role === 'admin') {
    return { classDoc, facultyProfile: null };
  }

  if (user.role === 'faculty') {
    const facultyProfile = await requireFacultyProfile(user.id);
    if (String(classDoc.faculty) !== String(facultyProfile._id)) {
      throw ApiError.forbidden('You can only access classes assigned to you');
    }
    return { classDoc, facultyProfile };
  }

  throw ApiError.forbidden('Only faculty can manage attendance for a class');
};

/**
 * Decides *which* student's attendance may be read.
 * Students can never widen the scope: an id in the URL/body that is not their
 * own is rejected, and no id at all falls back to their own record.
 *
 * @returns {{ studentId: string|null, all: boolean }}
 */
const resolveAttendanceScope = async (user, requestedStudentId) => {
  if (user.role === 'admin') {
    return { studentId: requestedStudentId || null, all: !requestedStudentId };
  }

  if (user.role === 'student') {
    const profile = await requireStudentProfile(user.id);

    if (requestedStudentId && String(requestedStudentId) !== String(profile._id)) {
      throw ApiError.forbidden('Students may only view their own attendance');
    }

    return { studentId: String(profile._id), all: false };
  }

  if (user.role === 'faculty') {
    if (!requestedStudentId) {
      throw ApiError.validation('A studentId is required');
    }

    const facultyProfile = await requireFacultyProfile(user.id);
    const teachesStudent = await Class.exists({
      faculty: facultyProfile._id,
      students: requestedStudentId,
    });

    if (!teachesStudent) {
      throw ApiError.forbidden('This student is not enrolled in any of your classes');
    }

    return { studentId: String(requestedStudentId), all: false };
  }

  throw ApiError.forbidden();
};

/**
 * Guards self-service writes (e.g. a student enrolling themselves): when a
 * studentId is supplied by a student it must be their own.
 */
const assertStudentSelf = async (user, studentId) => {
  const profile = await requireStudentProfile(user.id);

  if (studentId && String(studentId) !== String(profile._id)) {
    throw ApiError.forbidden('Students can only act on their own enrollment');
  }

  return profile;
};

/** GET /api/classes/:id/students is limited to the assigned faculty member. */
const assertCanViewRoster = async (user, classId) => {
  const { classDoc, facultyProfile } = await assertClassAccess(user, classId);
  return { classDoc, facultyProfile };
};

module.exports = {
  getFacultyProfile,
  getStudentProfile,
  requireFacultyProfile,
  requireStudentProfile,
  assertClassAccess,
  resolveAttendanceScope,
  assertStudentSelf,
  assertCanViewRoster,
};
