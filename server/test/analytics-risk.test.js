/**
 * PB-12 admin analytics and PB-16 faculty insights & at-risk alerts.
 */
process.env.INSTITUTION_TIME_ZONE = 'UTC';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { startDb, stopDb, resetDb, app, request, loginAs, seedBasic, PASSWORD } = require('./helpers');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const DAYS = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02', '2026-02-09', '2026-02-16', '2026-02-23'];

describe('PB-12 admin analytics', () => {
  let admin;
  let fixture;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await resetDb();
    fixture = await seedBasic({ studentCount: 4 });
    admin = await loginAs('admin@test.edu');
  });

  const mark = (date, statuses) =>
    request(app())
      .post('/api/attendance/mark')
      .set(auth(admin))
      .send({ classId: String(fixture.classDoc._id), date, records: statuses.map((status, i) => ({ studentId: String(fixture.students[i]._id), status })) });

  const analytics = (qs = 'timeframe=all') => request(app()).get(`/api/analytics/admin?${qs}`).set(auth(admin));

  it('AC-2: shows metrics and a labelled trend for valid records', async () => {
    await mark(DAYS[0], ['present', 'present', 'absent', 'late']);
    await mark(DAYS[1], ['present', 'absent', 'absent', 'excused']);

    const res = await analytics();
    assert.equal(res.status, 200);
    const { metrics, trend, byClass } = res.body.data;
    assert.equal(res.body.data.empty, false);
    assert.equal(metrics.sessionsHeld, 2);
    assert.equal(metrics.totalStudents, 4);
    assert.equal(metrics.studentsAbsent, 2);
    assert.equal(metrics.absences, 3);
    // 4 attended / (8 marked - 1 excused)
    assert.equal(metrics.rate, 57.1);
    assert.equal(trend.points.length, 2);
    assert.deepEqual(trend.points.map((p) => p.period), [DAYS[0], DAYS[1]]);
    assert.equal(byClass[0].belowThreshold, true);
    assert.equal(metrics.classesBelowThreshold, 1);
  });

  it('AC-3: changing the date range updates every dependent metric consistently', async () => {
    await mark(DAYS[0], ['absent', 'absent', 'absent', 'absent']);
    await mark(DAYS[1], ['present', 'present', 'present', 'present']);

    const res = await analytics(`timeframe=custom&from=${DAYS[1]}&to=${DAYS[1]}`);
    const { metrics, trend } = res.body.data;
    assert.equal(metrics.rate, 100);
    assert.equal(metrics.absences, 0);
    assert.equal(metrics.studentsAbsent, 0);
    assert.equal(metrics.sessionsHeld, 1);
    assert.equal(trend.points.length, 1);
    assert.deepEqual(res.body.range.from, DAYS[1]);

    const report = await request(app()).get(`/api/reports/sessions?from=${DAYS[1]}&to=${DAYS[1]}`).set(auth(admin));
    assert.equal(report.body.summary.rate, metrics.rate, 'analytics and reports agree');
  });

  it('AC-4: reports an explicit empty state rather than misleading zeroes', async () => {
    await mark(DAYS[0], ['present']);
    const res = await analytics('timeframe=custom&from=2025-01-01&to=2025-01-31');
    assert.equal(res.body.data.empty, true);
    assert.equal(res.body.data.metrics.rate, null);
    assert.equal(res.body.data.trend.points.length, 0);
  });

  it('AC-5: a new submission is reflected on the next refresh (no stale cache)', async () => {
    await mark(DAYS[0], ['present', 'present', 'present', 'present']);
    assert.equal((await analytics()).body.data.metrics.absences, 0);
    await mark(DAYS[1], ['absent', 'present', 'present', 'present']);
    assert.equal((await analytics()).body.data.metrics.absences, 1);
  });

  it('weekly buckets for long ranges; filters by department', async () => {
    for (const day of DAYS) {
      // eslint-disable-next-line no-await-in-loop
      await mark(day, ['present']);
    }
    const res = await analytics('timeframe=custom&from=2026-01-01&to=2026-03-31');
    assert.equal(res.body.data.trend.unit, 'week');
    const none = await analytics('timeframe=all&department=History');
    assert.equal(none.body.data.empty, true);
  });

  it('AC-1: administrators only', async () => {
    const faculty = await loginAs('faculty@test.edu');
    assert.equal((await request(app()).get('/api/analytics/admin').set(auth(faculty))).status, 403);
  });
});

describe('PB-16 faculty insights and at-risk alerts', () => {
  let faculty;
  let fixture;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await resetDb();
    fixture = await seedBasic({ studentCount: 3 });
    faculty = await loginAs('faculty@test.edu');
  });

  const mark = (date, statuses, token = faculty) =>
    request(app())
      .post('/api/attendance/mark')
      .set(auth(token))
      .send({ classId: String(fixture.classDoc._id), date, records: statuses.map((status, i) => ({ studentId: String(fixture.students[i]._id), status })) });

  const riskNotifications = async (token = faculty) =>
    (await request(app()).get('/api/notifications?type=risk').set(auth(token))).body.data;

  /** Student 0's history: `absences` absent days among `presents` present days, absences last. */
  const history = async (presents, absences) => {
    let d = 0;
    for (let i = 0; i < presents; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await mark(DAYS[d++], ['present', 'present', 'present']);
    }
    for (let i = 0; i < absences; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await mark(DAYS[d++], ['absent', 'present', 'present']);
    }
  };

  it('AC-1: faculty can open insights for an assigned class', async () => {
    await history(2, 0);
    const res = await request(app()).get(`/api/analytics/faculty?timeframe=all&classId=${fixture.classDoc._id}`).set(auth(faculty));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.metrics.rate, 100);
    assert.equal(res.body.data.trend.points.length, 2);
  });

  it('AC-2: "exceeds 3" — three unexcused absences do not alert, the fourth does', async () => {
    // 13 presents + 3 absences = 81% (>= 75%): only the absence count can trigger.
    const { Attendance } = require('../models');
    const presentDays = Array.from({ length: 13 }, (_, i) => new Date(Date.UTC(2025, 8, 1 + i)));
    await Attendance.collection.insertMany(
      presentDays.map((date) => ({ class: fixture.classDoc._id, student: fixture.students[0]._id, date, status: 'present', markedBy: null }))
    );
    for (const day of DAYS.slice(0, 3)) {
      // eslint-disable-next-line no-await-in-loop
      await mark(day, ['absent', 'present', 'present']);
    }
    assert.equal((await riskNotifications()).length, 0, 'three absences is not "more than three"');

    await mark(DAYS[3], ['absent', 'present', 'present']);
    const alerts = await riskNotifications();
    assert.equal(alerts.length, 1);
    assert.deepEqual(alerts[0].reasons, ['absences']);
    assert.match(alerts[0].message, /4 unexcused absences/);
  });

  it('AC-3/AC-4: below 75% is listed at risk and the teacher gets an alert with the reason', async () => {
    await history(2, 1); // 2/3 = 66.7%
    const insights = await request(app()).get('/api/analytics/faculty?timeframe=all').set(auth(faculty));
    const [row] = insights.body.data.atRisk;
    assert.equal(row.studentNumber, 'STU-1');
    assert.equal(row.rate, 66.7);
    assert.match(row.reason, /below 75%/);
    assert.ok(row.nextStep);

    const [alert] = await riskNotifications();
    assert.match(alert.title, /at risk in CS-101/);
    assert.match(alert.message, /66.7%/);
    assert.match(alert.link, /\/insights\?classId=/);
    assert.equal(alert.read, false);
  });

  it('crossing both thresholds at once sends one alert with both reasons', async () => {
    // 9 present + 3 absent, then one more present: 10/13 = 76.9% with 3 absences — not at risk yet.
    const { Attendance } = require('../models');
    const days = (n, offset) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2025, 8, 1 + offset + i)));
    await Attendance.collection.insertMany([
      ...days(9, 0).map((date) => ({ class: fixture.classDoc._id, student: fixture.students[0]._id, date, status: 'present' })),
      ...days(3, 9).map((date) => ({ class: fixture.classDoc._id, student: fixture.students[0]._id, date, status: 'absent' })),
    ]);
    await mark(DAYS[0], ['present', 'present', 'present']);
    assert.equal((await riskNotifications()).length, 0);

    // One more absence: 4 unexcused absences and 10/14 = 71.4% in the same save.
    await mark(DAYS[1], ['absent', 'present', 'present']);
    const alerts = await riskNotifications();
    assert.equal(alerts.length, 1);
    assert.deepEqual(alerts[0].reasons, ['absences', 'rate']);
    assert.match(alerts[0].message, /4 unexcused absences \(more than 3\) and attendance 71.4% \(below 75%\)/);
  });

  it('a second reason appearing later is a new crossing and alerts again', async () => {
    await history(0, 4);
    const alerts = await riskNotifications();
    assert.equal(alerts.length, 2);
    assert.deepEqual(alerts.map((a) => a.reasons), [['absences', 'rate'], ['rate']]);
  });

  it('AC-5: an unchanged condition never repeats the alert', async () => {
    await history(2, 1);
    assert.equal((await riskNotifications()).length, 1);
    await mark(DAYS[2], ['absent', 'present', 'present']); // re-save, same state
    await request(app()).get('/api/analytics/faculty').set(auth(faculty));
    await request(app()).get('/api/analytics/faculty').set(auth(faculty));
    await mark(DAYS[3], ['present', 'late', 'present']); // still below 75%? 3/4 = 75 -> clears
    await mark(DAYS[4], ['absent', 'present', 'present']); // back below: a new crossing
    const alerts = await riskNotifications();
    assert.equal(alerts.length, 2, JSON.stringify(alerts.map((a) => a.message)));
  });

  it('AC-6: correcting the record clears the risk and marks the alert resolved', async () => {
    await history(2, 1);
    assert.equal((await riskNotifications())[0].resolved, false);
    await request(app()).patch(`/api/notifications/${(await riskNotifications())[0].id}/read`).set(auth(faculty));

    await mark(DAYS[2], ['excused', 'present', 'present']);
    const insights = await request(app()).get('/api/analytics/faculty?timeframe=all').set(auth(faculty));
    assert.equal(insights.body.data.atRisk.length, 0);
    const [alert] = await riskNotifications();
    assert.equal(alert.resolved, true);
    assert.equal(alert.read, true);
  });

  it('alerts go to the current teacher; a reassigned teacher no longer sees the class', async () => {
    const { User, Faculty } = require('../models');
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const newUser = await User.create({ name: 'New Teacher', email: 'new@test.edu', passwordHash, role: 'faculty' });
    const newFaculty = await Faculty.create({ user: newUser._id, department: 'Computer Science', employeeId: 'EMP-9' });
    const admin = await loginAs('admin@test.edu');
    await request(app()).put(`/api/classes/${fixture.classDoc._id}/assign-faculty`).set(auth(admin)).send({ facultyId: String(newFaculty._id) });

    const newToken = await loginAs('new@test.edu');
    await history.call(null, 0, 0);
    await mark(DAYS[0], ['absent', 'present', 'present'], newToken);

    assert.equal((await riskNotifications(newToken)).length, 1);
    assert.equal((await riskNotifications(faculty)).length, 0);
    const oldInsights = await request(app()).get(`/api/analytics/faculty?classId=${fixture.classDoc._id}`).set(auth(faculty));
    assert.equal(oldInsights.status, 403);
  });

  it('flags declining attendance only for a real drop (two of the last four sessions)', async () => {
    // Student 0: 4 present, then 1 absence in the last 4 -> 75% vs 100%: not declining.
    // Student 1: 4 present, then 2 absences in the last 4 -> 50% vs 100%: declining.
    const plan = [
      ['present', 'present'], ['present', 'present'], ['present', 'present'], ['present', 'present'],
      ['absent', 'absent'], ['present', 'absent'], ['present', 'present'], ['present', 'present'],
    ];
    for (let i = 0; i < plan.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await mark(DAYS[i], [...plan[i], 'present']);
    }
    const res = await request(app()).get('/api/analytics/faculty?timeframe=all').set(auth(faculty));
    const declining = res.body.data.declining.map((d) => d.studentNumber);
    assert.deepEqual(declining, ['STU-2']);
    assert.equal(res.body.data.declining[0].recentRate, 50);
    assert.equal(res.body.data.thresholds.recentSessions, 4);
  });

  it('notifications are private: read state can only be changed by the recipient', async () => {
    await history(2, 1);
    const [alert] = await riskNotifications();
    const student = await loginAs('student1@test.edu');
    assert.equal((await request(app()).patch(`/api/notifications/${alert.id}/read`).set(auth(student))).status, 404);
    assert.equal((await request(app()).get('/api/notifications').set(auth(student))).body.data.length, 0);

    const count = await request(app()).get('/api/notifications/unread-count').set(auth(faculty));
    assert.equal(count.body.data.unread, 1);
    await request(app()).post('/api/notifications/read-all').set(auth(faculty));
    assert.equal((await request(app()).get('/api/notifications/unread-count').set(auth(faculty))).body.data.unread, 0);
  });
});
