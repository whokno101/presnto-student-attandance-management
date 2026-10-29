const { timeZone } = require('../config/env');

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const YMD = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * Today's calendar date in the institution's time zone, as UTC midnight (the
 * shape attendance dates are stored in). Using the UTC date instead made
 * "today" count as a future date for anyone east of UTC just after midnight.
 */
const todayInInstitution = (now = new Date()) => new Date(`${YMD.format(now)}T00:00:00.000Z`);

/** `YYYY-MM-DD` of a stored (UTC-midnight) day. */
const ymd = (day) => new Date(day).toISOString().slice(0, 10);

const addDays = (day, count) => new Date(new Date(day).getTime() + count * DAY_MS);

/** Weekday name ('Monday') of a stored day. */
const weekdayOf = (day) => WEEKDAYS[new Date(day).getUTCDay()];

/** Minutes since midnight for `HH:mm`. */
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

/** Offset (ms) of the institution zone from UTC at `instant`. */
const zoneOffset = (instant) => {
  const parts = Object.fromEntries(PARTS.formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

/**
 * The instant at which wall-clock `HH:mm` happens on stored `day` in the
 * institution's zone (e.g. when a 09:00–10:30 class actually ends).
 */
const zonedTime = (day, hhmm) => {
  const naive = new Date(new Date(day).getTime() + toMinutes(hhmm) * 60 * 1000);
  const first = new Date(naive.getTime() - zoneOffset(naive));
  // Re-check once so a DST change between the guess and the answer is honoured.
  return new Date(naive.getTime() - zoneOffset(first));
};

module.exports = { DAY_MS, WEEKDAYS, todayInInstitution, ymd, addDays, weekdayOf, toMinutes, zonedTime };
