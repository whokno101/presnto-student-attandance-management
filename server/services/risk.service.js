/**
 * At-risk evaluation and alerts (PB-16).
 *
 * A student is at risk in a class when they have 4+ unexcused absences or
 * their rate is below 75% (services/metrics riskOf — the same rule the reports
 * use). After every attendance change the affected students are re-evaluated
 * against their stored RiskState:
 *
 *   not at risk -> at risk, or a new reason appears  -> notify the class teacher
 *   condition unchanged                              -> nothing (no repeats)
 *   at risk -> not at risk (corrected record)        -> state updated, UI reflects it
 *
 * Alerts go to whoever teaches the class now; they are an academic-support
 * signal, never a disciplinary decision.
 */
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const Faculty = require('../models/Faculty');
const RiskState = require('../models/RiskState');
const Student = require('../models/Student');
const attendanceService = require('./attendance.service');
const notificationService = require('./notification.service');
const { TALLY_FIELDS, RATE_STAGE, riskOf, describeRisk } = require('./metrics');

const NEXT_STEP = 'Review the attendance record and, if appropriate, contact the student through approved university channels.';

/**
 * Re-evaluates `studentIds` (default: the whole roster) in one class.
 * @returns {Promise<{ evaluated: number, newlyAtRisk: number, cleared: number }>}
 */
const evaluate = async (classId, studentIds = null) => {
  const classDoc = await Class.findById(classId).select('code name faculty students archivedAt');
  if (!classDoc) return { evaluated: 0, newlyAtRisk: 0, cleared: 0 };

  const ids = (studentIds ?? classDoc.students ?? []).map(String);
  if (!ids.length) return { evaluated: 0, newlyAtRisk: 0, cleared: 0 };

  const [tallies, states] = await Promise.all([
    Attendance.aggregate([
      { $match: { class: classDoc._id, student: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: '$student', ...TALLY_FIELDS } },
      RATE_STAGE,
    ]),
    RiskState.find({ class: classDoc._id, student: { $in: ids } }).lean(),
  ]);

  const tallyById = new Map(tallies.map((t) => [String(t._id), t]));
  const stateById = new Map(states.map((s) => [String(s.student), s]));

  const facultyUserId = classDoc.faculty
    ? (await Faculty.findById(classDoc.faculty).select('user').lean())?.user
    : null;

  let newlyAtRisk = 0;
  let cleared = 0;
  const alerts = [];
  const now = new Date();

  for (const studentId of ids) {
    const tally = tallyById.get(studentId) ?? { absent: 0, excused: 0, eligible: 0, rate: 0 };
    const { atRisk, reasons } = riskOf(tally);
    const previous = stateById.get(studentId);
    const previousReasons = new Set(previous?.atRisk ? previous.reasons : []);
    const crossed = atRisk && reasons.some((r) => !previousReasons.has(r));

    const update = {
      atRisk,
      reasons,
      absent: tally.absent,
      excused: tally.excused,
      eligible: tally.eligible,
      rate: tally.rate,
      since: atRisk ? (previous?.atRisk ? previous.since : now) : null,
    };
    if (crossed) update.notifiedAt = now;

    // eslint-disable-next-line no-await-in-loop
    await RiskState.updateOne({ student: studentId, class: classDoc._id }, { $set: update }, { upsert: true });

    if (crossed) {
      newlyAtRisk += 1;
      alerts.push({ studentId, tally, reasons });
    } else if (previous?.atRisk && !atRisk) {
      cleared += 1;
    }
  }

  if (alerts.length && facultyUserId && !classDoc.archivedAt) {
    const students = await Student.find({ _id: { $in: alerts.map((a) => a.studentId) } })
      .select('studentId user')
      .populate('user', 'name')
      .lean();
    const byId = new Map(students.map((s) => [String(s._id), s]));

    await Promise.all(
      alerts.map(({ studentId, tally, reasons }) => {
        const student = byId.get(studentId);
        const name = student?.user?.name ?? 'A student';
        return notificationService.create({
          recipient: facultyUserId,
          type: 'risk',
          title: `${name} is at risk in ${classDoc.code}`,
          message: `${name} (${student?.studentId ?? ''}) has ${describeRisk({ reasons, absent: tally.absent, rate: tally.rate })} in ${classDoc.code} — ${classDoc.name}.`,
          nextStep: NEXT_STEP,
          link: `/insights?classId=${classDoc._id}&student=${encodeURIComponent(student?.studentId ?? '')}`,
          class: classDoc._id,
          student: studentId,
          reasons,
          meta: { absent: tally.absent, rate: tally.rate, eligible: tally.eligible },
        });
      })
    );
  }

  return { evaluated: ids.length, newlyAtRisk, cleared };
};

// Every attendance write (manual, import, QR, approved excuse) re-evaluates.
attendanceService.onAttendanceChanged(({ classDoc, studentIds }) => evaluate(classDoc._id, studentIds));

module.exports = { evaluate, NEXT_STEP };
