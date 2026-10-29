/**
 * Institutional attendance policy — the single source for every threshold and
 * calculation rule used by reports, analytics, alerts and imports, so the class
 * view, admin report and risk alerts can never contradict one another.
 *
 * Product Owner decisions (Sprint 02 handbook §16) are recorded in
 * docs/sprint-02-decisions.md; change them here, not in individual services.
 */
const { timeZone } = require('./env');

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  /** Statuses that count as "attended" in the numerator. */
  ATTENDED_STATUSES: ['present', 'late'],

  /**
   * Approved excused sessions are removed from the denominator:
   *   rate = attended / (marked - excused)
   * so an approved excuse neither helps nor hurts a student's percentage.
   */
  EXCLUDE_EXCUSED_FROM_DENOMINATOR: true,

  /** A session whose attendance rate is below this % gets a warning badge (PB-15). */
  SESSION_WARNING_RATE: 60,

  /** A student below this % in a class is at risk (PB-16). */
  STUDENT_RISK_RATE: 75,

  /** "Exceeds 3 unexcused absences" is interpreted as 4 or more (PB-16). */
  RISK_MIN_UNEXCUSED_ABSENCES: 4,

  /** Soft-deleted / archived records stay restorable for this many days (PB-14). */
  RETENTION_DAYS: toNumber(process.env.RETENTION_DAYS, 90),

  /**
   * Attendance for a session is due this many hours after the session ends; a
   * submission is flagged as overdue once it is still missing 24h after that
   * deadline (PB-13).
   */
  SUBMISSION_DEADLINE_HOURS: toNumber(process.env.SUBMISSION_DEADLINE_HOURS, 0),
  OVERDUE_AFTER_HOURS: 24,

  /** IANA time zone that defines the institution's calendar day (config/env.js). */
  TIME_ZONE: timeZone,

  /** Whether faculty may import attendance CSVs for their own classes (PB-17). */
  FACULTY_IMPORT_ENABLED: process.env.FACULTY_IMPORT_ENABLED !== 'false',

  /** QR check-in tokens rotate every N seconds (PB-20). */
  QR_ROTATION_SECONDS: 15,
};
