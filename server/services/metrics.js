/**
 * The one definition of every attendance number (handbook §2, PB-12/15/16).
 *
 * Reports, analytics, the admin overview and risk alerts all build their
 * aggregations from these helpers, so the class view, admin report and alerts
 * can never disagree. Counts are always derived from the stored records —
 * nothing is incremented — so editing a status, retrying a request or
 * re-importing a file can never double-count an absence.
 *
 *   attended = present + late
 *   eligible = marked − excused        (approved excuses leave the denominator)
 *   rate     = attended / eligible × 100, one decimal; no eligible sessions → no rate
 */
const policy = require('../config/policy');

const STATUSES = ['present', 'late', 'absent', 'excused'];

const countOf = (status) => ({ $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] } });

/** `$group` accumulators for a set of attendance records. */
const TALLY_FIELDS = {
  marked: { $sum: 1 },
  present: countOf('present'),
  late: countOf('late'),
  absent: countOf('absent'),
  excused: countOf('excused'),
  attended: { $sum: { $cond: [{ $in: ['$status', policy.ATTENDED_STATUSES] }, 1, 0] } },
};

const ELIGIBLE_EXPR = policy.EXCLUDE_EXCUSED_FROM_DENOMINATOR
  ? { $subtract: ['$marked', { $ifNull: ['$excused', 0] }] }
  : '$marked';

/** attended / eligible × 100 (0 when there is nothing eligible — check `eligible`). */
const RATE_EXPR = {
  $cond: [
    { $gt: [ELIGIBLE_EXPR, 0] },
    { $round: [{ $multiply: [{ $divide: ['$attended', ELIGIBLE_EXPR] }, 100] }, 1] },
    0,
  ],
};

/** `$set` stage adding `eligible` and `rate` after a TALLY_FIELDS group. */
const RATE_STAGE = { $set: { eligible: ELIGIBLE_EXPR, rate: RATE_EXPR } };

const rateOf = (attended, eligible) => (eligible > 0 ? Math.round((attended / eligible) * 1000) / 10 : 0);

/** JS twin of TALLY_FIELDS + RATE_STAGE for records already in memory. */
const summarise = (records) => {
  const count = (status) => records.filter((r) => r.status === status).length;
  const present = count('present');
  const late = count('late');
  const absent = count('absent');
  const excused = count('excused');
  const attended = records.filter((r) => policy.ATTENDED_STATUSES.includes(r.status)).length;
  const total = records.length;
  const eligible = policy.EXCLUDE_EXCUSED_FROM_DENOMINATOR ? total - excused : total;

  return { total, present, late, absent, excused, attended, eligible, percentage: rateOf(attended, eligible) };
};

/**
 * PB-16 risk rule. `absent` is the unexcused count (Excused is its own status).
 * @returns {{ atRisk: boolean, reasons: Array<'absences'|'rate'> }}
 */
const riskOf = ({ absent = 0, rate = 0, eligible = 0 }) => {
  const reasons = [];
  if (absent >= policy.RISK_MIN_UNEXCUSED_ABSENCES) reasons.push('absences');
  if (eligible > 0 && rate < policy.STUDENT_RISK_RATE) reasons.push('rate');
  return { atRisk: reasons.length > 0, reasons };
};

const describeRisk = ({ reasons, absent, rate }) =>
  reasons
    .map((reason) =>
      reason === 'absences'
        ? `${absent} unexcused absences (more than ${policy.RISK_MIN_UNEXCUSED_ABSENCES - 1})`
        : `attendance ${rate}% (below ${policy.STUDENT_RISK_RATE}%)`
    )
    .join(' and ');

/** PB-15: a session below this rate gets a warning badge. */
const isSessionBelowWarning = ({ rate, eligible }) => eligible > 0 && rate < policy.SESSION_WARNING_RATE;

module.exports = {
  STATUSES,
  TALLY_FIELDS,
  ELIGIBLE_EXPR,
  RATE_EXPR,
  RATE_STAGE,
  rateOf,
  summarise,
  riskOf,
  describeRisk,
  isSessionBelowWarning,
};
