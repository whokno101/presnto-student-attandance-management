const { timeZone } = require('../config/env');

const YMD = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Today's calendar date in the institution's time zone, as UTC midnight (the
 * shape attendance dates are stored in). Using the UTC date instead made
 * "today" count as a future date for anyone east of UTC just after midnight.
 */
const todayInInstitution = (now = new Date()) => new Date(`${YMD.format(now)}T00:00:00.000Z`);

module.exports = { todayInInstitution };
