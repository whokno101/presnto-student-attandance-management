const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Student = require('../models/Student');
const { ApiError } = require('../utils/apiError');
const { parsePagination, buildPagination, escapeRegex } = require('../utils/query');
const { assertUnique } = require('./shared');
const auditService = require('./audit.service');

const SALT_ROUNDS = 12;
const USER_FIELDS = 'name email isActive';

/** Flattens User + Student into the shape the admin table consumes. */
const toDTO = (doc) => ({
  id: String(doc._id),
  userId: doc.user ? String(doc.user._id || doc.user) : null,
  name: doc.user?.name ?? '—',
  email: doc.user?.email ?? '—',
  studentId: doc.studentId,
  department: doc.department,
  isActive: doc.user?.isActive ?? false,
  enrolledClasses: Array.isArray(doc.enrolledClasses) ? doc.enrolledClasses.length : 0,
});

const findByIdOrThrow = async (id) => {
  const student = await Student.findById(id).populate('user', USER_FIELDS);
  if (!student) throw ApiError.notFound('Student not found');
  if (!student.user) throw ApiError.notFound('The user account for this student no longer exists');
  return student;
};

/**
 * Search spans two collections: name lives on User, the rest on Student.
 * Resolving matching user ids first keeps the query index-friendly and avoids
 * an aggregation pipeline for a simple case.
 */
const buildFilter = async (search) => {
  if (!search) return {};

  const rx = new RegExp(escapeRegex(search), 'i');
  const userIds = await User.find({ role: 'student', name: rx }).distinct('_id');

  return { $or: [{ studentId: rx }, { department: rx }, { user: { $in: userIds } }] };
};

const list = async (query = {}) => {
  const { page, limit, search, skip } = parsePagination(query);
  const filter = await buildFilter(search);

  const [total, rows] = await Promise.all([
    Student.countDocuments(filter),
    Student.find(filter)
      .populate('user', USER_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);

  return { data: rows.map(toDTO), pagination: buildPagination({ page, limit, total }) };
};

const create = async (payload, actor) => {
  const email = payload.email.toLowerCase();
  const studentId = payload.studentId.toUpperCase();

  await assertUnique({
    model: User,
    field: 'email',
    value: email,
    message: 'That email address is already registered',
  });
  await assertUnique({
    model: Student,
    field: 'studentId',
    value: studentId,
    message: 'That student ID is already in use',
  });

  const passwordHash = await bcrypt.hash(payload.password, SALT_ROUNDS);

  let user;
  try {
    user = await User.create({
      name: payload.name,
      email,
      passwordHash,
      role: 'student',
    });

    const student = await Student.create({
      user: user._id,
      department: payload.department,
      studentId,
    });

    const created = await Student.findById(student._id).populate('user', USER_FIELDS);
    await auditService.record({
      actor,
      action: 'student.created',
      entityType: 'Student',
      entityId: created._id,
      department: created.department,
      summary: `Created student ${user.name} (${created.studentId})`,
    });
    return toDTO(created);
  } catch (err) {
    // Never leave an orphaned User behind if the profile insert fails.
    if (user) await User.deleteOne({ _id: user._id }).catch(() => {});
    throw err;
  }
};

const update = async (id, payload, actor) => {
  const student = await findByIdOrThrow(id);

  if (payload.email) {
    await assertUnique({
      model: User,
      field: 'email',
      value: payload.email.toLowerCase(),
      message: 'That email address is already registered',
      excludeId: student.user._id,
    });
  }

  if (payload.studentId) {
    await assertUnique({
      model: Student,
      field: 'studentId',
      value: payload.studentId.toUpperCase(),
      message: 'That student ID is already in use',
      excludeId: student._id,
    });
  }

  const before = toDTO(student);
  const user = student.user;
  if (payload.name !== undefined) user.name = payload.name;
  if (payload.email !== undefined) user.email = payload.email.toLowerCase();
  if (payload.password) user.passwordHash = await bcrypt.hash(payload.password, SALT_ROUNDS);
  if (payload.isActive !== undefined) user.isActive = payload.isActive;
  if (user.isModified()) await user.save();

  if (payload.department !== undefined) student.department = payload.department;
  if (payload.studentId !== undefined) student.studentId = payload.studentId.toUpperCase();
  if (student.isModified()) await student.save();

  const after = toDTO(await findByIdOrThrow(id));
  const changes = ['name', 'email', 'studentId', 'department', 'isActive']
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ field, from: before[field], to: after[field] }));
  // Passwords are never logged — only the fact that one was set.
  if (payload.password) changes.push({ field: 'password', from: null, to: '(changed)' });

  if (changes.length) {
    await auditService.record({
      actor,
      action: 'student.updated',
      entityType: 'Student',
      entityId: after.id,
      department: after.department,
      summary: `Updated student ${after.name} (${after.studentId}): ${changes.map((c) => c.field).join(', ')}`,
      changes,
    });
  }

  return after;
};

/**
 * Soft delete: the record (and all of its attendance history) is preserved, the
 * account simply can no longer authenticate. Reversible via isActive: true.
 */
const setActive = async (id, active, actor) => {
  const student = await findByIdOrThrow(id);

  if (student.user.isActive !== active) {
    student.user.isActive = active;
    await student.user.save();
    await auditService.record({
      actor,
      action: active ? 'student.activated' : 'student.deactivated',
      entityType: 'Student',
      entityId: student._id,
      department: student.department,
      summary: `${active ? 'Reactivated' : 'Deactivated'} student ${student.user.name} (${student.studentId}); history retained`,
      changes: [{ field: 'isActive', from: !active, to: active }],
    });
  }

  return toDTO(await findByIdOrThrow(id));
};

const remove = (id, actor) => setActive(id, false, actor);

module.exports = { list, create, update, remove, setActive, toDTO };
