/**
 * CSV import and export of whole datasets (PB-17).
 *
 *   export   GET    a dataset as CSV (only what the caller may see)
 *   template GET    headers + example rows
 *   preview  POST   validate every row; nothing is written
 *   commit   POST   re-validate from scratch and apply the valid rows
 *
 * Import never bypasses the rules of the normal write paths: attendance goes
 * through attendanceService.applyRecords (roster, archived and future-date
 * checks, audit, risk recalculation), sessions through the schedule conflict
 * engine under its lock. Unknown ids are rejected, never auto-created. If a
 * write fails part-way, rows already created by this import are removed.
 */
const bcrypt = require('bcryptjs');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const ClassSession = require('../models/ClassSession');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const User = require('../models/User');
const policy = require('../config/policy');
const attendanceService = require('./attendance.service');
const auditService = require('./audit.service');
const scheduleService = require('./schedule.service');
const { requireFacultyProfile } = require('./access.service');
const { resolveScope } = require('./scope.service');
const { ApiError } = require('../utils/apiError');
const { parseCsv, toCsv } = require('../utils/csv');
const { todayInInstitution, ymd, toMinutes } = require('../utils/dates');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const STATUSES = ['present', 'late', 'absent', 'excused'];
const ID_RE = /^[A-Za-z0-9-]{3,20}$/;
const CODE_RE = /^[A-Za-z0-9-]{3,15}$/;
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SALT_ROUNDS = 12;

/* ------------------------------------------------------------------ *
 *   Dataset definitions
 * ------------------------------------------------------------------ */

const DATASETS = {
  students: {
    label: 'Students',
    adminOnly: true,
    key: 'student_id',
    columns: ['student_id', 'name', 'email', 'department', 'password'],
    required: ['student_id', 'name', 'email', 'department'],
    example: [
      ['STU-3001', 'Jane Doe', 'jane.doe@university.edu', 'Computer Science', 'ChangeMe#2026'],
      ['STU-3002', 'Sam Lee', 'sam.lee@university.edu', 'Software Engineering', 'ChangeMe#2026'],
    ],
  },
  faculty: {
    label: 'Faculty',
    adminOnly: true,
    key: 'employee_id',
    columns: ['employee_id', 'name', 'email', 'department', 'password'],
    required: ['employee_id', 'name', 'email', 'department'],
    example: [['EMP-2001', 'Dr Ada Okafor', 'ada.okafor@university.edu', 'Computer Science', 'ChangeMe#2026']],
  },
  classes: {
    label: 'Classes',
    adminOnly: true,
    key: 'code',
    columns: ['code', 'name', 'department', 'semester', 'day', 'start_time', 'end_time', 'room', 'capacity', 'faculty_employee_id'],
    required: ['code', 'name', 'department', 'semester', 'day', 'start_time', 'end_time'],
    example: [['CS-499', 'Capstone Project', 'Computer Science', 'Fall 2026', 'Thursday', '14:00', '16:00', 'B-204', '35', 'EMP-1001']],
  },
  attendance: {
    label: 'Attendance',
    adminOnly: false,
    columns: ['date', 'class_code', 'student_id', 'status'],
    required: ['date', 'class_code', 'student_id', 'status'],
    example: [
      ['2026-10-05', 'CS-201', 'STU-2001', 'present'],
      ['2026-10-05', 'CS-201', 'STU-2004', 'absent'],
    ],
  },
  sessions: {
    label: 'Class sessions (schedule)',
    adminOnly: true,
    columns: ['class_code', 'date', 'start_time', 'end_time', 'room'],
    required: ['class_code', 'date', 'start_time', 'end_time'],
    example: [['CS-201', ymd(new Date(todayInInstitution().getTime() + 7 * 864e5)), '08:30', '10:00', 'A-101']],
  },
};

const assertDataset = (dataset) => {
  if (!DATASETS[dataset]) throw ApiError.notFound(`Unknown dataset "${dataset}"`);
  return DATASETS[dataset];
};

/** Admins: everything. Faculty: attendance for their own classes, if enabled. */
const assertCanUse = (user, dataset, mode) => {
  const def = assertDataset(dataset);
  if (user.role === 'admin') return def;
  if (user.role !== 'faculty' || def.adminOnly) {
    throw ApiError.forbidden(`Only administrators can ${mode} ${def.label.toLowerCase()}`);
  }
  if (mode === 'import' && !policy.FACULTY_IMPORT_ENABLED) {
    throw ApiError.forbidden('Attendance imports by faculty are disabled by policy');
  }
  return def;
};

/* ------------------------------------------------------------------ *
 *   Export + template
 * ------------------------------------------------------------------ */

const yesNo = (v) => (v ? 'yes' : 'no');

const exportRows = async (user, dataset, query = {}) => {
  if (dataset === 'students') {
    const rows = await Student.find().populate('user', 'name email isActive').sort({ studentId: 1 }).lean();
    return {
      columns: [...DATASETS.students.columns.slice(0, 4), 'active'],
      rows: rows.map((s) => [s.studentId, s.user?.name, s.user?.email, s.department, yesNo(s.user?.isActive)]),
    };
  }
  if (dataset === 'faculty') {
    const rows = await Faculty.find().populate('user', 'name email isActive').sort({ employeeId: 1 }).lean();
    return {
      columns: [...DATASETS.faculty.columns.slice(0, 4), 'active'],
      rows: rows.map((f) => [f.employeeId, f.user?.name, f.user?.email, f.department, yesNo(f.user?.isActive)]),
    };
  }
  if (dataset === 'classes') {
    const rows = await Class.find().populate('faculty', 'employeeId').sort({ code: 1 }).lean();
    return {
      columns: [...DATASETS.classes.columns, 'enrolled', 'archived'],
      rows: rows.map((c) => [
        c.code, c.name, c.department, c.semester, c.schedule?.day, c.schedule?.startTime, c.schedule?.endTime,
        c.room, c.capacity, c.faculty?.employeeId ?? '', (c.students || []).length, yesNo(c.archivedAt),
      ]),
    };
  }
  if (dataset === 'sessions') {
    const rows = await ClassSession.find({ status: 'scheduled' }).populate('class', 'code').sort({ date: 1, startMinutes: 1 }).lean();
    return {
      columns: DATASETS.sessions.columns,
      rows: rows.map((s) => [s.class?.code, ymd(s.date), s.startTime, s.endTime, s.room]),
    };
  }
  // attendance — the same scope rules as the reports (faculty: own classes)
  const scope = await resolveScope(user, query);
  const records = await Attendance.find(scope.match)
    .sort({ date: 1, class: 1 })
    .limit(50000)
    .populate('student', 'studentId')
    .lean();
  return {
    columns: DATASETS.attendance.columns,
    rows: records.map((r) => [ymd(r.date), scope.classById.get(String(r.class))?.code, r.student?.studentId, r.status]),
  };
};

const exportCsv = async (user, dataset, query) => {
  assertCanUse(user, dataset, 'export');
  const { columns, rows } = await exportRows(user, dataset, query);
  await auditService.record({
    actor: user,
    action: 'export.dataset',
    entityType: 'Dataset',
    summary: `Exported ${rows.length} ${DATASETS[dataset].label.toLowerCase()} rows as CSV`,
    meta: { dataset, rows: rows.length },
  });
  return toCsv(
    columns.map((c, i) => ({ key: String(i), label: c, value: (row) => row[i] })),
    rows
  );
};

const templateCsv = (user, dataset) => {
  const def = assertCanUse(user, dataset, 'import');
  return toCsv(
    def.columns.map((c, i) => ({ key: String(i), label: c, value: (row) => row[i] })),
    def.example
  );
};

/* ------------------------------------------------------------------ *
 *   Parsing + per-row validation
 * ------------------------------------------------------------------ */

/** Our own exports prefix formula-like text with an apostrophe; undo that. */
const unescapeCell = (value) => (/^'[=+\-@]/.test(value) ? value.slice(1) : value);

const parseUpload = ({ csv, filename }, def) => {
  if (typeof csv !== 'string' || !csv.length) {
    throw ApiError.validation('Choose a CSV file to import', [{ field: 'file', message: 'The file is empty' }]);
  }
  if (filename && !/\.csv$/i.test(filename)) {
    throw ApiError.validation('Only .csv files can be imported', [{ field: 'file', message: 'Save the spreadsheet as CSV (UTF-8)' }]);
  }
  if (Buffer.byteLength(csv, 'utf8') > policy.IMPORT_MAX_BYTES) {
    throw ApiError.validation(`The file is larger than ${policy.IMPORT_MAX_BYTES / 1024 / 1024} MB`, [{ field: 'file', message: 'Split it into smaller files' }]);
  }
  // A non-UTF-8 file decoded in the browser turns unknown bytes into U+FFFD.
  if (csv.includes('�')) {
    throw ApiError.validation('The file is not UTF-8 encoded', [{ field: 'file', message: 'In your spreadsheet app choose "CSV UTF-8" when saving' }]);
  }

  let parsed;
  try {
    parsed = parseCsv(csv);
  } catch (err) {
    throw ApiError.validation(`The CSV could not be read: ${err.message}`, [{ field: 'file', message: err.message }]);
  }

  const headers = parsed.headers.map((h) => h.toLowerCase());
  const missing = def.required.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw ApiError.validation(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`, [
      { field: 'headers', message: `Expected columns: ${def.columns.join(', ')}` },
    ]);
  }
  if (!parsed.rows.length) {
    throw ApiError.validation('The file has a header row but no data rows', [{ field: 'file', message: 'Add at least one row' }]);
  }
  if (parsed.rows.length > 5000) {
    throw ApiError.validation('At most 5000 rows can be imported at once', [{ field: 'file', message: 'Split the file' }]);
  }

  const extraColumns = parsed.headers.filter((h) => !def.columns.includes(h.toLowerCase()) && h.toLowerCase() !== 'active' && h.toLowerCase() !== 'archived' && h.toLowerCase() !== 'enrolled');
  const rows = parsed.rows.map((r) => {
    const values = {};
    parsed.headers.forEach((h) => {
      values[h.toLowerCase()] = unescapeCell(r.values[h] ?? '');
    });
    return { line: r.line, values, extraCells: r.extra };
  });

  return { rows, extraColumns };
};

const newRow = (row) => ({ line: row.line, values: row.values, action: null, errors: [], warnings: [], target: null });

const lengthCheck = (out, field, max) => {
  if ((out.values[field] ?? '').length > max) out.errors.push(`${field} is longer than ${max} characters`);
};

const markDuplicates = (results, keyOf, label) => {
  const seen = new Map();
  results.forEach((r) => {
    if (r.errors.length) return;
    const key = keyOf(r);
    if (seen.has(key)) {
      r.errors.push(`Duplicate ${label} — same as line ${seen.get(key)}`);
    } else {
      seen.set(key, r.line);
    }
  });
};

/* -- people (students / faculty) -- */

const validatePeople = async (rows, kind) => {
  const isStudent = kind === 'students';
  const idField = isStudent ? 'student_id' : 'employee_id';
  const Model = isStudent ? Student : Faculty;
  const modelIdField = isStudent ? 'studentId' : 'employeeId';

  const ids = rows.map((r) => (r.values[idField] || '').toUpperCase()).filter(Boolean);
  const emails = rows.map((r) => (r.values.email || '').toLowerCase()).filter(Boolean);
  const [existing, usersByEmail] = await Promise.all([
    Model.find({ [modelIdField]: { $in: ids } }).populate('user', 'name email').lean(),
    User.find({ email: { $in: emails } }).select('email').lean(),
  ]);
  const byId = new Map(existing.map((p) => [p[modelIdField], p]));
  const emailOwner = new Map(usersByEmail.map((u) => [u.email, String(u._id)]));

  const results = rows.map((row) => {
    const out = newRow(row);
    const v = row.values;
    const id = (v[idField] || '').toUpperCase();

    if (!id) out.errors.push(`${idField} is required`);
    else if (!ID_RE.test(id)) out.errors.push(`${idField} must be 3-20 letters, numbers or dashes`);
    if (!v.name || v.name.length < 2) out.errors.push('name must be at least 2 characters');
    lengthCheck(out, 'name', 80);
    if (!v.email || !EMAIL_RE.test(v.email)) out.errors.push('email is not a valid address');
    lengthCheck(out, 'email', 120);
    if (!v.department) out.errors.push('department is required');
    lengthCheck(out, 'department', 80);
    if (v.password && (v.password.length < 8 || v.password.length > 72)) out.errors.push('password must be 8-72 characters');

    const current = byId.get(id);
    const email = (v.email || '').toLowerCase();
    const owner = emailOwner.get(email);
    if (owner && (!current || String(current.user?._id) !== owner)) out.errors.push(`email ${email} already belongs to another account`);

    if (!out.errors.length) {
      if (current) {
        const changed =
          current.user?.name !== v.name || current.user?.email !== email || current.department !== v.department || Boolean(v.password);
        out.action = changed ? 'update' : 'skip';
        if (!changed) out.warnings.push('No changes');
        out.target = { id: String(current._id), userId: String(current.user?._id) };
      } else if (!v.password) {
        out.errors.push('password is required for a new account');
      } else {
        out.action = 'create';
      }
    }
    return out;
  });

  markDuplicates(results, (r) => (r.values[idField] || '').toUpperCase(), idField);
  markDuplicates(results, (r) => (r.values.email || '').toLowerCase(), 'email');
  return results;
};

const applyPeople = async (results, kind) => {
  const isStudent = kind === 'students';
  const Model = isStudent ? Student : Faculty;
  const modelIdField = isStudent ? 'studentId' : 'employeeId';
  const idField = isStudent ? 'student_id' : 'employee_id';
  const createdUsers = [];
  const createdProfiles = [];

  try {
    for (const r of results.filter((x) => x.action === 'create' || x.action === 'update')) {
      const v = r.values;
      if (r.action === 'create') {
        // eslint-disable-next-line no-await-in-loop
        const user = await User.create({
          name: v.name,
          email: v.email.toLowerCase(),
          passwordHash: await bcrypt.hash(v.password, SALT_ROUNDS),
          role: isStudent ? 'student' : 'faculty',
        });
        createdUsers.push(user._id);
        // eslint-disable-next-line no-await-in-loop
        const profile = await Model.create({ user: user._id, department: v.department, [modelIdField]: v[idField].toUpperCase() });
        createdProfiles.push(profile._id);
      } else {
        const set = { name: v.name, email: v.email.toLowerCase() };
        if (v.password) set.passwordHash = await bcrypt.hash(v.password, SALT_ROUNDS);
        // eslint-disable-next-line no-await-in-loop
        await User.updateOne({ _id: r.target.userId }, { $set: set });
        // eslint-disable-next-line no-await-in-loop
        await Model.updateOne({ _id: r.target.id }, { $set: { department: v.department } });
      }
    }
  } catch (err) {
    // Staged rollback: never leave half an import behind.
    await Model.deleteMany({ _id: { $in: createdProfiles } }).catch(() => {});
    await User.deleteMany({ _id: { $in: createdUsers } }).catch(() => {});
    throw err;
  }
};

/* -- classes -- */

const validateClasses = async (rows) => {
  const codes = rows.map((r) => (r.values.code || '').toUpperCase());
  const empIds = rows.map((r) => (r.values.faculty_employee_id || '').toUpperCase()).filter(Boolean);
  const [existing, faculty] = await Promise.all([
    Class.find({ code: { $in: codes } }).lean(),
    Faculty.find({ employeeId: { $in: empIds } }).populate('user', 'isActive').lean(),
  ]);
  const byCode = new Map(existing.map((c) => [c.code, c]));
  const facultyByEmp = new Map(faculty.map((f) => [f.employeeId, f]));

  const results = rows.map((row) => {
    const out = newRow(row);
    const v = row.values;
    const code = (v.code || '').toUpperCase();
    if (!CODE_RE.test(code)) out.errors.push('code must be 3-15 letters, numbers or dashes');
    if (!v.name || v.name.length < 3) out.errors.push('name must be at least 3 characters');
    lengthCheck(out, 'name', 120);
    if (!v.department) out.errors.push('department is required');
    if (!v.semester) out.errors.push('semester is required');
    lengthCheck(out, 'semester', 20);
    const day = DAYS.find((d) => d.toLowerCase() === (v.day || '').toLowerCase());
    if (!day) out.errors.push(`day must be one of ${DAYS.join(', ')}`);
    if (!TIME_RE.test(v.start_time || '')) out.errors.push('start_time must be HH:mm (24-hour)');
    if (!TIME_RE.test(v.end_time || '')) out.errors.push('end_time must be HH:mm (24-hour)');
    if (TIME_RE.test(v.start_time || '') && TIME_RE.test(v.end_time || '') && v.end_time <= v.start_time) out.errors.push('end_time must be after start_time');
    lengthCheck(out, 'room', 30);
    if (v.capacity && !(Number.isInteger(Number(v.capacity)) && Number(v.capacity) >= 1 && Number(v.capacity) <= 500)) out.errors.push('capacity must be a whole number from 1 to 500');

    let facultyId = null;
    if (v.faculty_employee_id) {
      const f = facultyByEmp.get(v.faculty_employee_id.toUpperCase());
      if (!f) out.errors.push(`unknown faculty_employee_id ${v.faculty_employee_id}`);
      else if (!f.user?.isActive) out.errors.push(`faculty ${v.faculty_employee_id} is deactivated`);
      else facultyId = String(f._id);
    }

    const current = byCode.get(code);
    if (current?.archivedAt) out.errors.push(`${code} is archived — restore it before importing changes`);

    if (!out.errors.length) {
      out.action = current ? 'update' : 'create';
      out.target = { id: current ? String(current._id) : null, facultyId, day, currentFaculty: current?.faculty ? String(current.faculty) : null };
      if (current && facultyId && current.faculty && String(current.faculty) !== facultyId) out.warnings.push('Changes the assigned teacher');
    }
    return out;
  });
  markDuplicates(results, (r) => (r.values.code || '').toUpperCase(), 'class code');
  return results;
};

const applyClasses = async (results, actor) => {
  const classService = require('./class.service');
  const created = [];
  try {
    for (const r of results.filter((x) => x.action === 'create' || x.action === 'update')) {
      const v = r.values;
      const payload = {
        name: v.name,
        code: v.code.toUpperCase(),
        department: v.department,
        semester: v.semester,
        day: r.target.day,
        startTime: v.start_time,
        endTime: v.end_time,
        room: (v.room || '').toUpperCase(),
      };
      if (r.action === 'create') {
        // eslint-disable-next-line no-await-in-loop
        const dto = await classService.create({ ...payload, facultyId: r.target.facultyId }, actor);
        created.push(dto.id);
        if (v.capacity) await Class.updateOne({ _id: dto.id }, { $set: { capacity: Number(v.capacity) } });
      } else {
        // eslint-disable-next-line no-await-in-loop
        await classService.update(r.target.id, payload, actor);
        if (v.capacity) await Class.updateOne({ _id: r.target.id }, { $set: { capacity: Number(v.capacity) } });
        if (r.target.facultyId && r.target.facultyId !== r.target.currentFaculty) {
          // eslint-disable-next-line no-await-in-loop
          await classService.assignFaculty(r.target.id, r.target.facultyId, actor);
        }
      }
    }
  } catch (err) {
    await Class.deleteMany({ _id: { $in: created }, students: { $size: 0 } }).catch(() => {});
    await Faculty.updateMany({}, { $pull: { classesAssigned: { $in: created } } }).catch(() => {});
    throw err;
  }
};

/* -- attendance -- */

const validateAttendance = async (rows, user) => {
  const codes = [...new Set(rows.map((r) => (r.values.class_code || '').toUpperCase()))];
  const studentIds = [...new Set(rows.map((r) => (r.values.student_id || '').toUpperCase()))];
  const [classes, students, facultyProfile] = await Promise.all([
    Class.find({ code: { $in: codes } }).select('code faculty students archivedAt').lean(),
    Student.find({ studentId: { $in: studentIds } }).select('studentId').lean(),
    user.role === 'faculty' ? requireFacultyProfile(user.id) : null,
  ]);
  const classByCode = new Map(classes.map((c) => [c.code, c]));
  const studentByNumber = new Map(students.map((s) => [s.studentId, s]));
  const today = todayInInstitution();

  const results = rows.map((row) => {
    const out = newRow(row);
    const v = row.values;
    const code = (v.class_code || '').toUpperCase();
    const number = (v.student_id || '').toUpperCase();
    const status = (v.status || '').toLowerCase();

    let day = null;
    if (!DATE_RE.test(v.date || '')) out.errors.push('date must be YYYY-MM-DD');
    else {
      day = new Date(`${v.date}T00:00:00.000Z`);
      if (Number.isNaN(day.getTime()) || ymd(day) !== v.date) out.errors.push(`${v.date} is not a real date`);
      else if (day > today) out.errors.push('date is in the future');
    }
    if (!STATUSES.includes(status)) out.errors.push(`status must be one of ${STATUSES.join(', ')}`);

    const classDoc = classByCode.get(code);
    if (!classDoc) out.errors.push(`unknown class_code ${v.class_code || '(blank)'}`);
    else if (classDoc.archivedAt) out.errors.push(`${code} is archived`);
    else if (facultyProfile && String(classDoc.faculty) !== String(facultyProfile._id)) out.errors.push(`${code} is not one of your classes`);

    const student = studentByNumber.get(number);
    if (!student) out.errors.push(`unknown student_id ${v.student_id || '(blank)'}`);
    else if (classDoc && !(classDoc.students || []).some((id) => String(id) === String(student._id))) out.errors.push(`${number} is not enrolled in ${code}`);

    if (!out.errors.length) out.target = { classId: String(classDoc._id), studentId: String(student._id), day, status };
    return out;
  });

  markDuplicates(results, (r) => `${r.values.date}|${(r.values.class_code || '').toUpperCase()}|${(r.values.student_id || '').toUpperCase()}`, 'student/session');

  // Compare with what is stored to say create / update / unchanged.
  const valid = results.filter((r) => !r.errors.length);
  if (valid.length) {
    const existing = await Attendance.find({
      $or: valid.map((r) => ({ class: r.target.classId, student: r.target.studentId, date: r.target.day })),
    })
      .select('class student date status')
      .lean();
    const byKey = new Map(existing.map((e) => [`${e.class}|${e.student}|${e.date.toISOString()}`, e.status]));
    valid.forEach((r) => {
      const current = byKey.get(`${r.target.classId}|${r.target.studentId}|${r.target.day.toISOString()}`);
      if (current === undefined) r.action = 'create';
      else if (current === r.target.status) {
        r.action = 'skip';
        r.warnings.push('Already recorded with this status');
      } else {
        r.action = 'update';
        r.warnings.push(`Changes ${current} to ${r.target.status}`);
      }
    });
  }
  return results;
};

const applyAttendance = async (results, actor) => {
  const groups = new Map();
  results
    .filter((r) => r.action === 'create' || r.action === 'update')
    .forEach((r) => {
      const key = `${r.target.classId}|${ymd(r.target.day)}`;
      if (!groups.has(key)) groups.set(key, { classId: r.target.classId, date: ymd(r.target.day), records: [] });
      groups.get(key).records.push({ studentId: r.target.studentId, status: r.target.status });
    });

  for (const group of groups.values()) {
    // eslint-disable-next-line no-await-in-loop
    const classDoc = await Class.findById(group.classId).select('_id name code department faculty students schedule archivedAt');
    // eslint-disable-next-line no-await-in-loop
    await attendanceService.applyRecords({ classDoc, date: group.date, records: group.records, actor, source: 'import' });
  }
};

/* -- sessions (schedule) -- */

const validateSessions = async (rows) => {
  const codes = [...new Set(rows.map((r) => (r.values.class_code || '').toUpperCase()))];
  const classes = await Class.find({ code: { $in: codes } }).select('code name faculty room archivedAt').lean();
  const classByCode = new Map(classes.map((c) => [c.code, c]));
  const today = todayInInstitution();

  const results = rows.map((row) => {
    const out = newRow(row);
    const v = row.values;
    const code = (v.class_code || '').toUpperCase();
    const classDoc = classByCode.get(code);
    if (!classDoc) out.errors.push(`unknown class_code ${v.class_code || '(blank)'}`);
    else if (classDoc.archivedAt) out.errors.push(`${code} is archived`);

    let day = null;
    if (!DATE_RE.test(v.date || '')) out.errors.push('date must be YYYY-MM-DD');
    else {
      day = new Date(`${v.date}T00:00:00.000Z`);
      if (Number.isNaN(day.getTime()) || ymd(day) !== v.date) out.errors.push(`${v.date} is not a real date`);
      else if (day < today) out.errors.push('date is in the past');
    }
    const timesOk = TIME_RE.test(v.start_time || '') && TIME_RE.test(v.end_time || '');
    if (!timesOk) out.errors.push('start_time and end_time must be HH:mm (24-hour)');
    else if (v.end_time <= v.start_time) out.errors.push('end_time must be after start_time');
    const room = (v.room || classDoc?.room || '').toUpperCase();
    if (!room) out.errors.push('room is required (the class has no default room)');
    lengthCheck(out, 'room', 30);

    if (!out.errors.length) {
      out.target = {
        classId: String(classDoc._id),
        classCode: classDoc.code,
        className: classDoc.name,
        facultyId: classDoc.faculty ? String(classDoc.faculty) : null,
        room,
        date: day,
        startTime: v.start_time,
        endTime: v.end_time,
        startMinutes: toMinutes(v.start_time),
        endMinutes: toMinutes(v.end_time),
      };
      out.action = 'create';
    }
    return out;
  });

  markDuplicates(results, (r) => `${(r.values.class_code || '').toUpperCase()}|${r.values.date}|${r.values.start_time}`, 'session');

  // PB-23: the same conflict rules as manual scheduling, across the file too.
  const valid = results.filter((r) => !r.errors.length);
  const conflicts = await scheduleService.findConflicts(valid.map((r) => r.target));
  valid.forEach((r, i) => {
    (conflicts.get(i) ?? []).forEach((c) => r.errors.push(c.withinRequest ? `${scheduleService.explain(c)} (another row in this file)` : scheduleService.explain(c)));
    if (r.errors.length) r.action = null;
  });
  return results;
};

const applySessions = async (results, actor) =>
  scheduleService.withScheduleLock(async () => {
    const rows = results.filter((r) => r.action === 'create');
    // Re-check under the lock: someone may have booked since the preview.
    const conflicts = await scheduleService.findConflicts(rows.map((r) => r.target));
    rows.forEach((r, i) => {
      if (conflicts.has(i)) {
        r.action = 'reject';
        r.errors.push(...conflicts.get(i).map(scheduleService.explain));
      }
    });
    const toInsert = rows.filter((r) => r.action === 'create');
    if (toInsert.length) {
      await ClassSession.insertMany(
        toInsert.map((r) => ({
          class: r.target.classId,
          faculty: r.target.facultyId,
          room: r.target.room,
          date: r.target.date,
          startTime: r.target.startTime,
          endTime: r.target.endTime,
          startMinutes: r.target.startMinutes,
          endMinutes: r.target.endMinutes,
          batchId: 'import',
          createdBy: actor?.id ?? null,
        }))
      );
    }
  });

/* ------------------------------------------------------------------ *
 *   Preview + commit
 * ------------------------------------------------------------------ */

const validate = async (user, dataset, upload) => {
  const def = assertCanUse(user, dataset, 'import');
  const { rows, extraColumns } = parseUpload(upload, def);

  let results;
  if (dataset === 'students' || dataset === 'faculty') results = await validatePeople(rows, dataset);
  else if (dataset === 'classes') results = await validateClasses(rows);
  else if (dataset === 'attendance') results = await validateAttendance(rows, user);
  else results = await validateSessions(rows);

  results.forEach((r) => {
    if (r.errors.length) r.action = 'reject';
  });

  const warnings = extraColumns.length ? [`Ignored unexpected column${extraColumns.length > 1 ? 's' : ''}: ${extraColumns.join(', ')}`] : [];
  if (rows.some((r) => r.extraCells)) warnings.push('Some rows have more cells than there are headers; the extra cells were ignored');
  return { def, results, warnings };
};

const summarize = (results) => {
  const count = (action) => results.filter((r) => r.action === action).length;
  return { total: results.length, create: count('create'), update: count('update'), skip: count('skip'), reject: count('reject') };
};

/** Row output for the client — never echoes passwords back. */
const publicRows = (results) =>
  results.map((r) => ({
    line: r.line,
    action: r.action,
    errors: r.errors,
    warnings: r.warnings,
    values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, k === 'password' ? (v ? '••••••' : '') : v])),
  }));

const preview = async (user, dataset, upload) => {
  const { results, warnings } = await validate(user, dataset, upload);
  return { dataset, summary: summarize(results), warnings, rows: publicRows(results) };
};

const commit = async (user, dataset, upload) => {
  const { def, results, warnings } = await validate(user, dataset, upload);
  const before = summarize(results);

  if (before.create + before.update === 0) {
    await auditService.record({
      actor: user,
      action: 'import.rejected',
      outcome: 'failure',
      entityType: 'Dataset',
      summary: `Import of ${def.label.toLowerCase()} from ${upload.filename ?? 'CSV'} applied nothing: ${before.reject} rejected, ${before.skip} unchanged`,
      meta: { dataset, filename: upload.filename ?? null, bytes: Buffer.byteLength(upload.csv ?? '', 'utf8'), ...before },
    });
    return { dataset, summary: before, warnings, rows: publicRows(results), applied: false };
  }

  if (dataset === 'students' || dataset === 'faculty') await applyPeople(results, dataset);
  else if (dataset === 'classes') await applyClasses(results, user);
  else if (dataset === 'attendance') await applyAttendance(results, user);
  else await applySessions(results, user);

  const summary = summarize(results);
  await auditService.record({
    actor: user,
    action: 'import.committed',
    entityType: 'Dataset',
    summary: `Imported ${def.label.toLowerCase()} from ${upload.filename ?? 'CSV'}: ${summary.create} created, ${summary.update} updated, ${summary.skip} unchanged, ${summary.reject} rejected`,
    // File metadata and counts only — never the file contents.
    meta: { dataset, filename: upload.filename ?? null, bytes: Buffer.byteLength(upload.csv, 'utf8'), ...summary },
  });

  return { dataset, summary, warnings, rows: publicRows(results), applied: true };
};

const describe = (user) =>
  Object.entries(DATASETS)
    .filter(([, def]) => user.role === 'admin' || !def.adminOnly)
    .map(([value, def]) => ({
      value,
      label: def.label,
      columns: def.columns,
      required: def.required,
      canImport: user.role === 'admin' || policy.FACULTY_IMPORT_ENABLED,
    }));

module.exports = { DATASETS, describe, exportCsv, templateCsv, preview, commit };
