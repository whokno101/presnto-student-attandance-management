const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Faculty = require('../models/Faculty');
const { ApiError } = require('../utils/apiError');
const { parsePagination, buildPagination, escapeRegex } = require('../utils/query');
const { assertUnique } = require('./shared');
const auditService = require('./audit.service');

const SALT_ROUNDS = 12;
const USER_FIELDS = 'name email isActive';

const toDTO = (doc) => ({
  id: String(doc._id),
  userId: doc.user ? String(doc.user._id || doc.user) : null,
  name: doc.user?.name ?? '—',
  email: doc.user?.email ?? '—',
  employeeId: doc.employeeId,
  department: doc.department,
  isActive: doc.user?.isActive ?? false,
  classesAssigned: Array.isArray(doc.classesAssigned) ? doc.classesAssigned.length : 0,
});

const findByIdOrThrow = async (id) => {
  const faculty = await Faculty.findById(id).populate('user', USER_FIELDS);
  if (!faculty) throw ApiError.notFound('Faculty member not found');
  if (!faculty.user) throw ApiError.notFound('The user account for this faculty member no longer exists');
  return faculty;
};

const buildFilter = async (search) => {
  if (!search) return {};

  const rx = new RegExp(escapeRegex(search), 'i');
  const userIds = await User.find({ role: 'faculty', name: rx }).distinct('_id');

  return { $or: [{ employeeId: rx }, { department: rx }, { user: { $in: userIds } }] };
};

const list = async (query = {}) => {
  const { page, limit, search, skip } = parsePagination(query);
  const filter = await buildFilter(search);

  // `isActive` lives on User, so resolve it to a set of user ids first. The
  // Assign Faculty dialog uses ?isActive=true to offer assignable accounts only.
  if (query.isActive === 'true' || query.isActive === 'false') {
    const userIds = await User.find({
      role: 'faculty',
      isActive: query.isActive === 'true',
    }).distinct('_id');
    filter.user = { $in: userIds };
  }

  const [total, rows] = await Promise.all([
    Faculty.countDocuments(filter),
    Faculty.find(filter)
      .populate('user', USER_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);

  return { data: rows.map(toDTO), pagination: buildPagination({ page, limit, total }) };
};

const create = async (payload, actor) => {
  const email = payload.email.toLowerCase();
  const employeeId = payload.employeeId.toUpperCase();

  await assertUnique({
    model: User,
    field: 'email',
    value: email,
    message: 'That email address is already registered',
  });
  await assertUnique({
    model: Faculty,
    field: 'employeeId',
    value: employeeId,
    message: 'That employee ID is already in use',
  });

  const passwordHash = await bcrypt.hash(payload.password, SALT_ROUNDS);

  let user;
  try {
    user = await User.create({
      name: payload.name,
      email,
      passwordHash,
      role: 'faculty',
    });

    const faculty = await Faculty.create({
      user: user._id,
      department: payload.department,
      employeeId,
      classesAssigned: [],
    });

    const created = await Faculty.findById(faculty._id).populate('user', USER_FIELDS);
    await auditService.record({
      actor,
      action: 'faculty.created',
      entityType: 'Faculty',
      entityId: created._id,
      department: created.department,
      summary: `Created faculty member ${user.name} (${created.employeeId})`,
    });
    return toDTO(created);
  } catch (err) {
    if (user) await User.deleteOne({ _id: user._id }).catch(() => {});
    throw err;
  }
};

const update = async (id, payload, actor) => {
  const faculty = await findByIdOrThrow(id);

  if (payload.email) {
    await assertUnique({
      model: User,
      field: 'email',
      value: payload.email.toLowerCase(),
      message: 'That email address is already registered',
      excludeId: faculty.user._id,
    });
  }

  if (payload.employeeId) {
    await assertUnique({
      model: Faculty,
      field: 'employeeId',
      value: payload.employeeId.toUpperCase(),
      message: 'That employee ID is already in use',
      excludeId: faculty._id,
    });
  }

  const before = toDTO(faculty);
  const user = faculty.user;
  if (payload.name !== undefined) user.name = payload.name;
  if (payload.email !== undefined) user.email = payload.email.toLowerCase();
  if (payload.password) user.passwordHash = await bcrypt.hash(payload.password, SALT_ROUNDS);
  if (payload.isActive !== undefined) user.isActive = payload.isActive;
  if (user.isModified()) await user.save();

  if (payload.department !== undefined) faculty.department = payload.department;
  if (payload.employeeId !== undefined) faculty.employeeId = payload.employeeId.toUpperCase();
  if (faculty.isModified()) await faculty.save();

  const after = toDTO(await findByIdOrThrow(id));
  const changes = ['name', 'email', 'employeeId', 'department', 'isActive']
    .filter((field) => before[field] !== after[field])
    .map((field) => ({ field, from: before[field], to: after[field] }));
  // Passwords are never logged — only the fact that one was set.
  if (payload.password) changes.push({ field: 'password', from: null, to: '(changed)' });

  if (changes.length) {
    await auditService.record({
      actor,
      action: 'faculty.updated',
      entityType: 'Faculty',
      entityId: after.id,
      department: after.department,
      summary: `Updated faculty member ${after.name} (${after.employeeId}): ${changes.map((c) => c.field).join(', ')}`,
      changes,
    });
  }

  return after;
};

const setActive = async (id, active, actor) => {
  const faculty = await findByIdOrThrow(id);

  if (faculty.user.isActive !== active) {
    faculty.user.isActive = active;
    await faculty.user.save();
    await auditService.record({
      actor,
      action: active ? 'faculty.activated' : 'faculty.deactivated',
      entityType: 'Faculty',
      entityId: faculty._id,
      department: faculty.department,
      summary: `${active ? 'Reactivated' : 'Deactivated'} faculty member ${faculty.user.name} (${faculty.employeeId}); history retained`,
      changes: [{ field: 'isActive', from: !active, to: active }],
    });
  }

  return toDTO(await findByIdOrThrow(id));
};

const remove = (id, actor) => setActive(id, false, actor);

module.exports = { list, create, update, remove, setActive, toDTO };
