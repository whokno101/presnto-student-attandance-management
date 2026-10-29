/**
 * Absence excuse submission and review (PB-19).
 *
 *   student submits  -> Pending (attendance untouched, teacher notified)
 *   teacher approves -> attendance becomes Excused via applyRecords, so the
 *                       audit trail, absence counts and risk all update
 *   teacher rejects  -> attendance untouched; the student may resubmit
 *
 * Reviewers are whoever teaches the class now (or an admin); a teacher who has
 * been reassigned loses access. Documents are type- and size-checked (including
 * the file's magic bytes) and only served to the student, the class teacher
 * and administrators.
 */
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const Excuse = require('../models/Excuse');
const Faculty = require('../models/Faculty');
const policy = require('../config/policy');
const attendanceService = require('./attendance.service');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');
const { requireStudentProfile, getFacultyProfile } = require('./access.service');
const { ApiError } = require('../utils/apiError');
const { parsePagination, buildPagination } = require('../utils/query');
const { ymd } = require('../utils/dates');

const CATEGORY_LABEL = {
  illness: 'Illness or medical',
  family: 'Family emergency',
  university_activity: 'University activity',
  transport: 'Transport disruption',
  other: 'Other',
};

const MAGIC = {
  'application/pdf': (b) => b.subarray(0, 4).toString('latin1') === '%PDF',
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

const safeFilename = (name) => String(name || 'document').replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'document';

/** Decodes and checks an uploaded document. Returns null when none was sent. */
const readDocument = (document) => {
  if (!document) {
    if (policy.EXCUSE_DOCUMENT_REQUIRED) {
      throw ApiError.validation('A supporting document is required', [{ field: 'document', message: 'Attach a PDF, PNG or JPEG' }]);
    }
    return null;
  }

  const { filename, mimetype, data } = document;
  if (!policy.EXCUSE_FILE_TYPES.includes(mimetype)) {
    throw ApiError.validation('Unsupported file type', [{ field: 'document', message: 'Attach a PDF, PNG or JPEG file' }]);
  }
  if (typeof data !== 'string' || !/^[A-Za-z0-9+/=\s]+$/.test(data)) {
    throw ApiError.validation('The document could not be read', [{ field: 'document', message: 'Upload the file again' }]);
  }
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) throw ApiError.validation('The document is empty', [{ field: 'document', message: 'Choose a different file' }]);
  if (buffer.length > policy.EXCUSE_MAX_BYTES) {
    throw ApiError.validation(`The document is larger than ${policy.EXCUSE_MAX_BYTES / 1024 / 1024} MB`, [
      { field: 'document', message: `Choose a file under ${policy.EXCUSE_MAX_BYTES / 1024 / 1024} MB` },
    ]);
  }
  if (!MAGIC[mimetype](buffer)) {
    throw ApiError.validation('The file content does not match its type', [{ field: 'document', message: 'Attach a genuine PDF, PNG or JPEG' }]);
  }
  return { filename: safeFilename(filename), mimetype, size: buffer.length, data: buffer };
};

const classTeacherUserId = async (classDoc) => {
  if (!classDoc.faculty) return null;
  const faculty = await Faculty.findById(classDoc.faculty).select('user').lean();
  return faculty?.user ?? null;
};

/** Student may read their own; faculty only for classes they teach now; admin all. */
const assertCanView = async (user, excuse, classDoc) => {
  if (user.role === 'admin') return;
  if (user.role === 'student') {
    const profile = await requireStudentProfile(user.id);
    if (String(excuse.student?._id ?? excuse.student) === String(profile._id)) return;
  }
  if (user.role === 'faculty') {
    const profile = await getFacultyProfile(user.id);
    if (profile && String(classDoc.faculty) === String(profile._id)) return;
  }
  // Indistinguishable from "does not exist", so ids cannot be probed.
  throw ApiError.notFound('Excuse not found');
};

const assertCanReview = async (user, classDoc) => {
  if (user.role === 'admin') return;
  if (user.role === 'faculty') {
    const profile = await getFacultyProfile(user.id);
    if (profile && String(classDoc.faculty) === String(profile._id)) return;
    throw ApiError.forbidden('Only the teacher currently assigned to this class can review its excuses');
  }
  throw ApiError.forbidden('Only faculty and administrators can review excuses');
};

const toDTO = (doc) => ({
  id: String(doc._id),
  classId: String(doc.class?._id ?? doc.class),
  classCode: doc.class?.code,
  className: doc.class?.name,
  date: doc.date,
  category: doc.category,
  categoryLabel: CATEGORY_LABEL[doc.category],
  explanation: doc.explanation,
  document: doc.document?.filename ? { filename: doc.document.filename, mimetype: doc.document.mimetype, size: doc.document.size } : null,
  status: doc.status,
  reviewer: doc.reviewer?.name ?? null,
  reviewedAt: doc.reviewedAt,
  decisionNote: doc.decisionNote,
  createdAt: doc.createdAt,
  student: doc.student?.studentId
    ? { id: String(doc.student._id), studentId: doc.student.studentId, name: doc.student.user?.name ?? '—' }
    : undefined,
});

const POPULATE = [
  { path: 'class', select: 'code name faculty archivedAt' },
  { path: 'reviewer', select: 'name' },
  { path: 'student', select: 'studentId user', populate: { path: 'user', select: 'name' } },
];

/* ------------------------------------------------------------------ *
 *   Student side
 * ------------------------------------------------------------------ */

/** Absences the student can still excuse (absent, no open excuse). */
const eligible = async (user) => {
  const profile = await requireStudentProfile(user.id);
  const [absences, open] = await Promise.all([
    Attendance.find({ student: profile._id, status: 'absent' })
      .sort({ date: -1 })
      .populate('class', 'code name archivedAt')
      .lean(),
    Excuse.find({ student: profile._id, status: { $in: ['pending', 'approved'] } }).select('class date').lean(),
  ]);
  const openKeys = new Set(open.map((e) => `${e.class}|${e.date.toISOString()}`));
  return absences
    .filter((a) => a.class && !a.class.archivedAt && !openKeys.has(`${a.class._id}|${a.date.toISOString()}`))
    .map((a) => ({ attendanceId: String(a._id), classId: String(a.class._id), classCode: a.class.code, className: a.class.name, date: a.date }));
};

const submit = async (user, payload) => {
  const profile = await requireStudentProfile(user.id);
  if (!mongoose.isValidObjectId(payload.classId)) throw ApiError.validation('Select a class', [{ field: 'classId', message: 'Select a class' }]);
  const day = attendanceService.normalizeDay(payload.date);

  const classDoc = await Class.findById(payload.classId).select('code name department faculty archivedAt');
  if (!classDoc) throw ApiError.notFound('Class not found');
  if (classDoc.archivedAt) throw ApiError.conflict(`${classDoc.code} is archived`);

  // Only the student's own record, and only a recorded absence, is eligible.
  const record = await Attendance.findOne({ class: classDoc._id, student: profile._id, date: day });
  if (!record) {
    throw ApiError.conflict('Attendance for that session has not been recorded yet. Submit an excuse once it has.');
  }
  if (record.status === 'excused') throw ApiError.conflict('That absence is already excused');
  if (record.status !== 'absent') throw ApiError.conflict(`You were marked ${record.status} for that session, so there is nothing to excuse`);

  const existing = await Excuse.exists({ student: profile._id, class: classDoc._id, date: day, status: { $in: ['pending', 'approved'] } });
  if (existing) throw ApiError.conflict('You have already submitted an excuse for this session');

  const document = readDocument(payload.document);

  let excuse;
  try {
    excuse = await Excuse.create({
      student: profile._id,
      class: classDoc._id,
      date: day,
      attendance: record._id,
      category: payload.category,
      explanation: payload.explanation,
      document: document ?? undefined,
    });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('You have already submitted an excuse for this session');
    throw err;
  }

  const teacher = await classTeacherUserId(classDoc);
  if (teacher) {
    await notificationService.create({
      recipient: teacher,
      type: 'excuse_submitted',
      title: `New absence excuse for ${classDoc.code}`,
      message: `${user.name} submitted an excuse (${CATEGORY_LABEL[payload.category]}) for ${classDoc.code} on ${ymd(day)}.`,
      nextStep: 'Review the explanation and any supporting document, then approve or reject it.',
      link: `/excuses/review?id=${excuse._id}`,
      class: classDoc._id,
      student: profile._id,
    });
  }

  await auditService.record({
    actor: user,
    action: 'excuse.submitted',
    entityType: 'Excuse',
    entityId: excuse._id,
    classDoc,
    summary: `${user.name} submitted an absence excuse for ${classDoc.code} on ${ymd(day)} (${CATEGORY_LABEL[payload.category]}${document ? ', with document' : ''})`,
    // Metadata only — never the document contents.
    meta: { category: payload.category, document: document ? { mimetype: document.mimetype, size: document.size } : null },
  });

  return toDTO(await Excuse.findById(excuse._id).populate(POPULATE).lean());
};

const listMine = async (user) => {
  const profile = await requireStudentProfile(user.id);
  const rows = await Excuse.find({ student: profile._id }).sort({ createdAt: -1 }).populate(POPULATE).lean();
  return rows.map(toDTO);
};

/* ------------------------------------------------------------------ *
 *   Review side
 * ------------------------------------------------------------------ */

const listForReview = async (user, query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (user.role === 'faculty') {
    const profile = await getFacultyProfile(user.id);
    const classIds = profile ? await Class.find({ faculty: profile._id }).distinct('_id') : [];
    filter.class = { $in: classIds };
  } else if (user.role !== 'admin') {
    throw ApiError.forbidden();
  }
  if (query.status && ['pending', 'approved', 'rejected'].includes(query.status)) filter.status = query.status;
  if (query.classId && mongoose.isValidObjectId(query.classId)) {
    filter.class = filter.class ? { $in: filter.class.$in.filter((id) => String(id) === query.classId) } : query.classId;
  }

  const [total, pending, rows] = await Promise.all([
    Excuse.countDocuments(filter),
    Excuse.countDocuments({ ...filter, status: 'pending' }),
    Excuse.find(filter).sort({ status: 1, createdAt: -1 }).skip(skip).limit(limit).populate(POPULATE).lean(),
  ]);
  return { data: rows.map(toDTO), pending, pagination: buildPagination({ page, limit, total }) };
};

const getOne = async (user, id) => {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Excuse not found');
  const excuse = await Excuse.findById(id).populate(POPULATE).lean();
  if (!excuse) throw ApiError.notFound('Excuse not found');
  await assertCanView(user, excuse, excuse.class);
  return toDTO(excuse);
};

const getDocument = async (user, id) => {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Excuse not found');
  const excuse = await Excuse.findById(id).select('+document.data').populate('class', 'faculty').lean();
  if (!excuse) throw ApiError.notFound('Excuse not found');
  await assertCanView(user, excuse, excuse.class);
  if (!excuse.document?.data) throw ApiError.notFound('This excuse has no supporting document');
  return {
    filename: excuse.document.filename,
    mimetype: excuse.document.mimetype,
    data: Buffer.from(excuse.document.data.buffer ?? excuse.document.data),
  };
};

const review = async (user, id, { decision, note }) => {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Excuse not found');
  const excuse = await Excuse.findById(id).populate(POPULATE);
  if (!excuse) throw ApiError.notFound('Excuse not found');
  const classDoc = await Class.findById(excuse.class._id).select('_id name code department faculty students schedule archivedAt');
  await assertCanReview(user, classDoc);

  if (excuse.status !== 'pending') throw ApiError.conflict(`This excuse was already ${excuse.status}`);

  let attendanceChanged = false;
  if (decision === 'approved') {
    const record = await Attendance.findById(excuse.attendance).select('status');
    if (record?.status === 'absent') {
      // Same write path as marking: audited, counts and risk recalculated.
      await attendanceService.applyRecords({
        classDoc,
        date: ymd(excuse.date),
        records: [{ studentId: String(excuse.student._id), status: 'excused' }],
        actor: user,
        source: 'excuse',
      });
      attendanceChanged = true;
    }
  }

  excuse.status = decision;
  excuse.reviewer = user.id;
  excuse.reviewedAt = new Date();
  excuse.decisionNote = note || null;
  await excuse.save();

  const studentUser = excuse.student.user?._id ?? excuse.student.user;
  if (studentUser) {
    await notificationService.create({
      recipient: studentUser,
      type: 'excuse_decided',
      title: `Your excuse for ${classDoc.code} was ${decision}`,
      message: `Your excuse for ${classDoc.code} on ${ymd(excuse.date)} was ${decision}${note ? `: “${note}”` : '.'}`,
      link: '/excuses',
      class: classDoc._id,
      student: excuse.student._id,
    });
  }

  await auditService.record({
    actor: user,
    action: decision === 'approved' ? 'excuse.approved' : 'excuse.rejected',
    entityType: 'Excuse',
    entityId: excuse._id,
    classDoc,
    summary: `${decision === 'approved' ? 'Approved' : 'Rejected'} the excuse from ${excuse.student.user?.name ?? 'a student'} (${excuse.student.studentId}) for ${classDoc.code} on ${ymd(excuse.date)}${
      decision === 'approved' && !attendanceChanged ? ' — attendance was no longer Absent, so it was left unchanged' : ''
    }`,
    changes: [{ field: 'status', from: 'pending', to: decision }],
  });

  return { ...toDTO(await Excuse.findById(excuse._id).populate(POPULATE).lean()), attendanceChanged };
};

module.exports = { CATEGORY_LABEL, eligible, submit, listMine, listForReview, getOne, getDocument, review };
