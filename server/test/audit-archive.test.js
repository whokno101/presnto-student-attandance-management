/**
 * PB-13 activity log and PB-14 accidental-deletion protection.
 */
process.env.INSTITUTION_TIME_ZONE = 'UTC';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { startDb, stopDb, resetDb, app, request, loginAs, seedBasic, EVERY_DAY } = require('./helpers');
const { todayInInstitution, addDays, ymd, weekdayOf } = require('../utils/dates');

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('PB-13 activity log', () => {
  let admin;
  let faculty;
  let fixture;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await resetDb();
    fixture = await seedBasic({ schedule: EVERY_DAY });
    admin = await loginAs('admin@test.edu');
    faculty = await loginAs('faculty@test.edu');
  });

  const mark = (token, status, date = ymd(todayInInstitution()), studentIndex = 0) =>
    request(app())
      .post('/api/attendance/mark')
      .set(auth(token))
      .send({ classId: String(fixture.classDoc._id), date, records: [{ studentId: String(fixture.students[studentIndex]._id), status }] });

  it('AC-2: an attendance change records actor, timestamp, target record and action', async () => {
    await mark(faculty, 'present');
    const res = await mark(faculty, 'absent');
    assert.equal(res.status, 200);

    const log = await request(app()).get('/api/audit?category=attendance').set(auth(admin));
    const changed = log.body.data.find((e) => e.action === 'attendance.status_changed');
    assert.ok(changed, JSON.stringify(log.body.data.map((e) => e.action)));
    assert.equal(changed.actor.name, 'Fay Faculty');
    assert.equal(changed.actor.role, 'faculty');
    assert.equal(changed.entityType, 'Attendance');
    assert.ok(changed.entityId);
    assert.ok(changed.createdAt);
    assert.deepEqual(changed.changes, [{ field: 'status', from: 'present', to: 'absent' }]);
    assert.match(changed.summary, /from Present to Absent/);

    const actions = log.body.data.map((e) => e.action);
    assert.ok(actions.includes('attendance.status_set'));
    assert.ok(actions.includes('attendance.submitted'));
    assert.ok(actions.includes('attendance.resubmitted'));
  });

  it('two changes in quick succession produce distinct entries', async () => {
    await Promise.all([mark(faculty, 'present', undefined, 0), mark(faculty, 'late', undefined, 1)]);
    const log = await request(app()).get('/api/audit?action=attendance.status_set').set(auth(admin));
    assert.equal(log.body.data.length, 2);
    assert.notEqual(log.body.data[0].id, log.body.data[1].id);
  });

  it('logs opening an attendance sheet once per 15 minutes', async () => {
    const open = () => request(app()).get(`/api/attendance/class/${fixture.classDoc._id}`).set(auth(faculty));
    await open();
    await open();
    const log = await request(app()).get('/api/audit?action=attendance.opened').set(auth(admin));
    assert.equal(log.body.data.length, 1);
  });

  it('AC-1: filters by faculty member and date range', async () => {
    await mark(faculty, 'present');
    await mark(admin, 'late', ymd(todayInInstitution()), 1);
    const { Faculty } = require('../models');
    const facultyProfile = await Faculty.findOne();

    const mine = await request(app()).get(`/api/audit?facultyId=${facultyProfile._id}`).set(auth(admin));
    assert.ok(mine.body.data.length > 0);
    assert.ok(mine.body.data.every((e) => e.actor.name === 'Fay Faculty'));

    const today = ymd(todayInInstitution());
    const inRange = await request(app()).get(`/api/audit?from=${today}&to=${today}`).set(auth(admin));
    assert.ok(inRange.body.data.length > 0);
    const tomorrow = ymd(addDays(todayInInstitution(), 1));
    const empty = await request(app()).get(`/api/audit?from=${tomorrow}&to=${tomorrow}`).set(auth(admin));
    assert.equal(empty.body.data.length, 0);
  });

  it('AC-4: entries cannot be modified or removed', async () => {
    await mark(faculty, 'present');
    const AuditLog = require('../models/AuditLog');
    const entry = await AuditLog.findOne();

    await assert.rejects(AuditLog.updateOne({ _id: entry._id }, { summary: 'tampered' }), /append-only/);
    await assert.rejects(AuditLog.deleteOne({ _id: entry._id }), /append-only/);
    await assert.rejects(AuditLog.deleteMany({}), /append-only/);
    entry.summary = 'tampered';
    await assert.rejects(entry.save(), /append-only/);

    const put = await request(app()).put(`/api/audit/${entry._id}`).set(auth(admin)).send({ summary: 'x' });
    const del = await request(app()).delete(`/api/audit/${entry._id}`).set(auth(admin));
    assert.equal(put.status, 404);
    assert.equal(del.status, 404);
    assert.notEqual((await AuditLog.findById(entry._id)).summary, 'tampered');
  });

  it('AC-5: non-administrators cannot read the global log', async () => {
    const student = await loginAs('student1@test.edu');
    assert.equal((await request(app()).get('/api/audit').set(auth(faculty))).status, 403);
    assert.equal((await request(app()).get('/api/audit').set(auth(student))).status, 403);
    assert.equal((await request(app()).get('/api/audit/submissions').set(auth(faculty))).status, 403);
  });

  it('never stores passwords', async () => {
    await request(app())
      .put(`/api/students/${fixture.students[0]._id}`)
      .set(auth(admin))
      .send({ password: 'SuperSecret#123', name: 'Renamed Student' });
    const raw = JSON.stringify(await mongoose.connection.db.collection('auditlogs').find().toArray());
    assert.doesNotMatch(raw, /SuperSecret/);
    assert.match(raw, /\(changed\)/);
  });

  it('AC-3: on-time, late, pending and missing submissions are distinguished', async () => {
    const { Class, Attendance } = require('../models');
    const today = todayInInstitution();
    // Weekly slot on today's weekday, 09:00-10:00 UTC; class created four weeks ago.
    await Class.collection.updateOne(
      { _id: fixture.classDoc._id },
      { $set: { schedule: { day: weekdayOf(today), startTime: '09:00', endTime: '10:00' }, createdAt: addDays(today, -28) } }
    );
    const onTimeDay = addDays(today, -21);
    const lateDay = addDays(today, -14);
    // addDays(today, -7) has no attendance -> missing
    const at = (day, h) => new Date(day.getTime() + h * 3600 * 1000);

    await Attendance.collection.insertMany([
      { class: fixture.classDoc._id, student: fixture.students[0]._id, date: onTimeDay, status: 'present', createdAt: at(onTimeDay, 9.5), updatedAt: at(onTimeDay, 9.5) },
      { class: fixture.classDoc._id, student: fixture.students[0]._id, date: lateDay, status: 'present', createdAt: at(lateDay, 30), updatedAt: at(lateDay, 30) },
    ]);

    const res = await request(app())
      .get(`/api/audit/submissions?from=${ymd(addDays(today, -21))}&to=${ymd(addDays(today, -7))}`)
      .set(auth(admin));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const byDate = Object.fromEntries(res.body.data.map((r) => [ymd(new Date(r.date)), r.status]));
    assert.equal(byDate[ymd(onTimeDay)], 'on_time');
    assert.equal(byDate[ymd(lateDay)], 'late');
    assert.equal(byDate[ymd(addDays(today, -7))], 'missing');
    assert.deepEqual(
      { on_time: res.body.summary.on_time, late: res.body.summary.late, missing: res.body.summary.missing },
      { on_time: 1, late: 1, missing: 1 }
    );

    const missingOnly = await request(app())
      .get(`/api/audit/submissions?from=${ymd(addDays(today, -21))}&to=${ymd(addDays(today, -7))}&status=missing`)
      .set(auth(admin));
    assert.equal(missingOnly.body.data.length, 1);
  });
});

describe('PB-14 accidental deletion protection', () => {
  let admin;
  let faculty;
  let fixture;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await resetDb();
    fixture = await seedBasic();
    admin = await loginAs('admin@test.edu');
    faculty = await loginAs('faculty@test.edu');
    await request(app())
      .post('/api/attendance/mark')
      .set(auth(admin))
      .send({ classId: String(fixture.classDoc._id), date: '2026-01-05', records: fixture.students.map((s) => ({ studentId: String(s._id), status: 'present' })) });
  });

  const archive = (token = admin) => request(app()).delete(`/api/classes/${fixture.classDoc._id}`).set(auth(token));

  it('AC-3: archiving removes the class from active lists but keeps its attendance history', async () => {
    const { Attendance } = require('../models');
    const res = await archive();
    assert.equal(res.status, 200);
    assert.equal(res.body.data.archived, true);
    assert.ok(res.body.data.restoreDeadline);

    assert.equal(await Attendance.countDocuments({ class: fixture.classDoc._id }), 2);

    const active = await request(app()).get('/api/classes').set(auth(admin));
    assert.equal(active.body.data.length, 0);
    const archived = await request(app()).get('/api/classes?status=archived').set(auth(admin));
    assert.equal(archived.body.data.length, 1);

    const mine = await request(app()).get('/api/classes/mine').set(auth(faculty));
    assert.equal(mine.body.data.length, 0);

    const report = await request(app()).get(`/api/students/${fixture.students[0]._id}/attendance`).set(auth(admin));
    assert.equal(report.body.data.classes.length, 1);
    assert.equal(report.body.data.classes[0].archived, true);

    const overview = await request(app()).get('/api/attendance/overview').set(auth(admin));
    assert.equal(overview.body.data.byClass[0].archived, true);
  });

  it('archived classes are frozen until restored', async () => {
    await archive();
    const markRes = await request(app())
      .post('/api/attendance/mark')
      .set(auth(admin))
      .send({ classId: String(fixture.classDoc._id), date: '2026-01-06', records: [{ studentId: String(fixture.students[0]._id), status: 'present' }] });
    assert.equal(markRes.status, 409);
    const edit = await request(app()).put(`/api/classes/${fixture.classDoc._id}`).set(auth(admin)).send({ name: 'New name' });
    assert.equal(edit.status, 409);
    const student = await loginAs('student1@test.edu');
    const leave = await request(app()).post(`/api/classes/${fixture.classDoc._id}/unenroll`).set(auth(student)).send({});
    assert.equal(leave.status, 409);
  });

  it('AC-4: an administrator can restore within the retention window; not twice, not after it', async () => {
    await archive();
    const restored = await request(app()).post(`/api/classes/${fixture.classDoc._id}/restore`).set(auth(admin));
    assert.equal(restored.status, 200);
    assert.equal(restored.body.data.archived, false);
    assert.equal((await request(app()).get('/api/classes').set(auth(admin))).body.data.length, 1);

    assert.equal((await request(app()).post(`/api/classes/${fixture.classDoc._id}/restore`).set(auth(admin))).status, 409);

    await archive();
    const { Class } = require('../models');
    await Class.collection.updateOne({ _id: fixture.classDoc._id }, { $set: { archivedAt: addDays(new Date(), -91) } });
    const expired = await request(app()).post(`/api/classes/${fixture.classDoc._id}/restore`).set(auth(admin));
    assert.equal(expired.status, 409);
    assert.match(expired.body.error.message, /90 days/);
  });

  it('rejects archiving an already archived class', async () => {
    await archive();
    assert.equal((await archive()).status, 409);
  });

  it('AC-5/AC-6: archive and restore are audited; unauthorised attempts are blocked and logged', async () => {
    const denied = await archive(faculty);
    assert.equal(denied.status, 403);
    const { Class } = require('../models');
    assert.equal((await Class.findById(fixture.classDoc._id)).archivedAt, null);

    await archive();
    await request(app()).post(`/api/classes/${fixture.classDoc._id}/restore`).set(auth(admin));

    const log = await request(app()).get('/api/audit?category=class').set(auth(admin));
    const actions = log.body.data.map((e) => e.action);
    assert.ok(actions.includes('class.archived'));
    assert.ok(actions.includes('class.restored'));
    const archivedEntry = log.body.data.find((e) => e.action === 'class.archived');
    assert.equal(archivedEntry.actor.name, 'Ada Admin');
    assert.match(archivedEntry.summary, /2 attendance records retained/);

    const deniedLog = await request(app()).get('/api/audit?category=destructive').set(auth(admin));
    assert.equal(deniedLog.body.data.length, 1);
    assert.equal(deniedLog.body.data[0].actor.role, 'faculty');
    assert.equal(deniedLog.body.data[0].outcome, 'denied');
  });

  it('deactivating a student keeps their history and is audited', async () => {
    const res = await request(app()).delete(`/api/students/${fixture.students[0]._id}`).set(auth(admin));
    assert.equal(res.status, 200);
    const { Attendance } = require('../models');
    assert.equal(await Attendance.countDocuments({ student: fixture.students[0]._id }), 1);
    const log = await request(app()).get('/api/audit?action=student.deactivated').set(auth(admin));
    assert.equal(log.body.data.length, 1);
  });
});
