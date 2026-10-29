/**
 * QR code attendance check-in (PB-20).
 *
 * The teacher opens a check-in for today's session of a class they manage.
 * The screen shows a token that changes every QR_ROTATION_SECONDS:
 *
 *   token = <checkinId>.<window>.<HMAC-SHA256(secret, checkinId.window)>
 *
 * The server accepts the current window and the one before it (so a code
 * scanned just before it rotates still works), never trusts a student id or
 * time from the client, and records attendance through applyRecords with
 * `onlyIfUnmarked`: repeated scans are idempotent and a manual mark by the
 * teacher always wins. A scan is a convenience, not proof of presence — a
 * screenshot shared within ~30 seconds would still work; manual marking stays
 * available.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const QrCheckin = require('../models/QrCheckin');
const policy = require('../config/policy');
const attendanceService = require('./attendance.service');
const auditService = require('./audit.service');
const { assertClassAccess, requireStudentProfile } = require('./access.service');
const { ApiError, CODES } = require('../utils/apiError');
const { todayInInstitution, ymd } = require('../utils/dates');

const ROTATION_MS = policy.QR_ROTATION_SECONDS * 1000;
const SESSION_TTL_MS = 3 * 60 * 60 * 1000;

const windowAt = (now = Date.now()) => Math.floor(now / ROTATION_MS);

const sign = (secret, id, window) => crypto.createHmac('sha256', secret).update(`${id}.${window}`).digest('base64url');

const tokenFor = (checkin, now = Date.now()) => {
  const window = windowAt(now);
  return {
    token: `${checkin._id}.${window}.${sign(checkin.secret, String(checkin._id), window)}`,
    window,
    rotatesInMs: ROTATION_MS - (now % ROTATION_MS),
    rotationSeconds: policy.QR_ROTATION_SECONDS,
  };
};

const rejected = (status, code, message) => new ApiError(status, code, message);

/* ------------------------------------------------------------------ *
 *   Teacher side
 * ------------------------------------------------------------------ */

const toDTO = (checkin, classDoc) => ({
  id: String(checkin._id),
  classId: String(classDoc._id),
  classCode: classDoc.code,
  className: classDoc.name,
  date: checkin.date,
  active: checkin.active && checkin.expiresAt > new Date(),
  expiresAt: checkin.expiresAt,
  rotationSeconds: policy.QR_ROTATION_SECONDS,
});

/** Opens (or reuses) today's check-in for a class the caller manages. */
const start = async (user, classId) => {
  const { classDoc } = await assertClassAccess(user, classId);
  if (classDoc.archivedAt) throw ApiError.conflict(`${classDoc.code} is archived`);
  const today = todayInInstitution();

  const existing = await QrCheckin.findOne({ class: classDoc._id, date: today, active: true, expiresAt: { $gt: new Date() } });
  if (existing) return toDTO(existing, classDoc);

  const checkin = await QrCheckin.create({
    class: classDoc._id,
    date: today,
    startedBy: user.id,
    secret: crypto.randomBytes(32).toString('hex'),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  await auditService.record({
    actor: user,
    action: 'attendance.qr_started',
    entityType: 'QrCheckin',
    entityId: checkin._id,
    classDoc,
    summary: `Started QR check-in for ${classDoc.code} on ${ymd(today)}`,
  });
  return toDTO(checkin, classDoc);
};

const loadForOwner = async (user, id) => {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Check-in not found');
  const checkin = await QrCheckin.findById(id).select('+secret');
  if (!checkin) throw ApiError.notFound('Check-in not found');
  // Only someone who may manage the class may display its code.
  const { classDoc } = await assertClassAccess(user, checkin.class);
  return { checkin, classDoc };
};

const currentToken = async (user, id) => {
  const { checkin, classDoc } = await loadForOwner(user, id);
  if (!checkin.active || checkin.expiresAt <= new Date()) {
    throw rejected(410, CODES.CONFLICT, 'This check-in has ended. Start a new one to show a code.');
  }
  return { ...tokenFor(checkin), ...toDTO(checkin, classDoc) };
};

/** The check-in result as the teacher sees it in the session (AC-6). */
const status = async (user, id) => {
  const { checkin, classDoc } = await loadForOwner(user, id);
  const records = await Attendance.find({ class: classDoc._id, date: checkin.date })
    .select('student status source updatedAt')
    .populate({ path: 'student', select: 'studentId user', populate: { path: 'user', select: 'name' } })
    .lean();
  const checkedIn = records
    .filter((r) => r.source === 'qr')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((r) => ({ studentId: r.student?.studentId, name: r.student?.user?.name ?? '—', at: r.updatedAt, status: r.status }));
  return {
    ...toDTO(checkin, classDoc),
    enrolled: (classDoc.students || []).length,
    marked: records.length,
    checkedIn,
  };
};

const close = async (user, id) => {
  const { checkin, classDoc } = await loadForOwner(user, id);
  if (checkin.active) {
    checkin.active = false;
    checkin.closedAt = new Date();
    await checkin.save();
    await auditService.record({
      actor: user,
      action: 'attendance.qr_closed',
      entityType: 'QrCheckin',
      entityId: checkin._id,
      classDoc,
      summary: `Closed QR check-in for ${classDoc.code} on ${ymd(checkin.date)}`,
    });
  }
  return toDTO(checkin, classDoc);
};

/* ------------------------------------------------------------------ *
 *   Student side
 * ------------------------------------------------------------------ */

const TOKEN_RE = /^([0-9a-f]{24})\.(\d{1,15})\.([A-Za-z0-9_-]{43})$/;

/**
 * POST /api/qr/checkin — the student comes from the session, never the body.
 * @returns {{ result: 'accepted'|'already_checked_in'|'already_recorded', classCode, date, status }}
 */
const checkIn = async (user, rawToken) => {
  const match = TOKEN_RE.exec(String(rawToken ?? '').trim());
  if (!match) throw rejected(400, CODES.VALIDATION_ERROR, 'That is not a valid check-in code. Scan the code on your teacher’s screen.');
  const [, id, windowText, signature] = match;

  const checkin = await QrCheckin.findById(id).select('+secret');
  if (!checkin) throw rejected(400, CODES.VALIDATION_ERROR, 'That is not a valid check-in code.');

  const expected = sign(checkin.secret, id, Number(windowText));
  const valid = expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!valid) throw rejected(400, CODES.VALIDATION_ERROR, 'That is not a valid check-in code.');

  const now = windowAt();
  const window = Number(windowText);
  if (!checkin.active || checkin.expiresAt <= new Date()) {
    throw rejected(410, 'QR_EXPIRED', 'Check-in for this session has ended. Ask your teacher to mark you manually.');
  }
  if (window > now || window < now - 1) {
    throw rejected(410, 'QR_EXPIRED', 'This code has expired. Scan the new code on your teacher’s screen.');
  }
  if (checkin.date.getTime() !== todayInInstitution().getTime()) {
    throw rejected(410, 'QR_EXPIRED', 'This code is for a different day.');
  }

  const profile = await requireStudentProfile(user.id);
  const classDoc = await Class.findById(checkin.class).select('_id name code department faculty students schedule archivedAt');
  if (!classDoc || classDoc.archivedAt) throw rejected(410, 'QR_EXPIRED', 'This class is no longer active.');
  if (!(classDoc.students || []).some((s) => String(s) === String(profile._id))) {
    throw ApiError.forbidden(`You are not enrolled in ${classDoc.code}, so you cannot check in to it.`);
  }

  const existing = await Attendance.findOne({ class: classDoc._id, student: profile._id, date: checkin.date }).select('status source');
  if (existing) {
    const already = existing.source === 'qr';
    return {
      result: already ? 'already_checked_in' : 'already_recorded',
      classCode: classDoc.code,
      className: classDoc.name,
      date: checkin.date,
      status: existing.status,
      message: already
        ? `You are already checked in to ${classDoc.code}.`
        : `Your teacher has already recorded you as ${existing.status} for ${classDoc.code}. Speak to them if that is wrong.`,
    };
  }

  const result = await attendanceService.applyRecords({
    classDoc,
    date: ymd(checkin.date),
    records: [{ studentId: String(profile._id), status: 'present' }],
    actor: user,
    source: 'qr',
    onlyIfUnmarked: true,
  });

  // A concurrent duplicate scan lost the race — still idempotent.
  if (result.skipped) {
    return { result: 'already_checked_in', classCode: classDoc.code, className: classDoc.name, date: checkin.date, status: 'present', message: `You are already checked in to ${classDoc.code}.` };
  }

  return { result: 'accepted', classCode: classDoc.code, className: classDoc.name, date: checkin.date, status: 'present', message: `Checked in to ${classDoc.code}. You are marked Present.` };
};

module.exports = { start, currentToken, status, close, checkIn, tokenFor, windowAt, ROTATION_MS };
