/**
 * Which classes and attendance records a report/analytics request may see.
 *
 * Faculty are limited to the classes assigned to them on the server — naming
 * another teacher's class is a 403, not an empty result (PB-15 AC-6, PB-16).
 * Every report and dashboard resolves its filters here so they all apply the
 * same date range, class, department and student filters (handbook §2).
 */
const mongoose = require('mongoose');
const Class = require('../models/Class');
const Student = require('../models/Student');
const User = require('../models/User');
const { ApiError } = require('../utils/apiError');
const { escapeRegex } = require('../utils/query');
const { requireFacultyProfile } = require('./access.service');
const { todayInInstitution, ymd } = require('../utils/dates');

const isObjectId = (value) => mongoose.isValidObjectId(value);

const parseDay = (value, field) => {
  const day = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(day.getTime()) || ymd(day) !== value) {
    throw ApiError.validation('Use the YYYY-MM-DD format', [{ field, message: 'Use the YYYY-MM-DD format' }]);
  }
  return day;
};

/**
 * @param {{id: string, role: string}} user
 * @param {object} query  classId, department, facultyId, semester, from, to, student, includeArchived
 */
const resolveScope = async (user, query = {}) => {
  const classFilter = {};
  let facultyProfile = null;

  if (user.role === 'faculty') {
    facultyProfile = await requireFacultyProfile(user.id);
    classFilter.faculty = facultyProfile._id;
  } else if (user.role !== 'admin') {
    throw ApiError.forbidden('Reports are available to administrators and faculty');
  } else if (query.facultyId) {
    if (!isObjectId(query.facultyId)) throw ApiError.validation('Invalid faculty filter');
    classFilter.faculty = query.facultyId;
  }

  if (query.classId) {
    if (!isObjectId(query.classId)) throw ApiError.validation('Invalid class filter');
    if (facultyProfile) {
      const owns = await Class.exists({ _id: query.classId, faculty: facultyProfile._id });
      if (!owns) throw ApiError.forbidden('You can only view classes assigned to you');
    }
    classFilter._id = new mongoose.Types.ObjectId(String(query.classId));
  }
  if (query.department) classFilter.department = String(query.department);
  if (query.semester) classFilter.semester = String(query.semester);
  if (query.includeArchived === 'false') classFilter.archivedAt = null;

  const classes = await Class.find(classFilter)
    .select('name code department semester schedule faculty students archivedAt room')
    .populate({ path: 'faculty', select: 'user', populate: { path: 'user', select: 'name' } })
    .lean();
  const classIds = classes.map((c) => c._id);
  const classById = new Map(classes.map((c) => [String(c._id), c]));

  const match = { class: { $in: classIds } };

  let from = null;
  let to = null;
  if (query.from) from = parseDay(query.from, 'from');
  if (query.to) to = parseDay(query.to, 'to');
  if (from && to && from > to) {
    throw ApiError.validation('The start date must be before the end date', [{ field: 'from', message: 'Choose an earlier start date' }]);
  }
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = from;
    if (to) match.date.$lte = to;
  }

  let studentIds = null;
  if (query.studentId) {
    if (!isObjectId(query.studentId)) throw ApiError.validation('Invalid student filter');
    studentIds = [new mongoose.Types.ObjectId(String(query.studentId))];
  } else if (query.student) {
    const rx = new RegExp(escapeRegex(String(query.student).trim().slice(0, 60)), 'i');
    const userIds = await User.find({ role: 'student', name: rx }).distinct('_id');
    studentIds = await Student.find({ $or: [{ studentId: rx }, { user: { $in: userIds } }] }).distinct('_id');
  }
  if (studentIds) match.student = { $in: studentIds };

  return {
    classes,
    classIds,
    classById,
    match,
    studentIds,
    range: { from: from ? ymd(from) : null, to: to ? ymd(to) : null },
    today: todayInInstitution(),
    facultyProfile,
  };
};

module.exports = { resolveScope, parseDay };
