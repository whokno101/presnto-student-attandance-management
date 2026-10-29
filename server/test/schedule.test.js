/**
 * PB-22 multi-date scheduling and PB-23 schedule conflict resolution.
 */
process.env.INSTITUTION_TIME_ZONE = 'UTC';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { startDb, stopDb, resetDb, app, request, loginAs, seedBasic, PASSWORD } = require('./helpers');
const { todayInInstitution, addDays, ymd, weekdayOf } = require('../utils/dates');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const inDays = (n) => ymd(addDays(todayInInstitution(), n));

describe('PB-22/PB-23 scheduling and conflicts', () => {
  let admin;
  let fixture;
  let otherClass;
  let otherFaculty;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await resetDb();
    fixture = await seedBasic({ studentCount: 1 });
    admin = await loginAs('admin@test.edu');
    const { User, Faculty, Class } = require('../models');
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const u = await User.create({ name: 'Second Teacher', email: 'second@test.edu', passwordHash, role: 'faculty' });
    otherFaculty = await Faculty.create({ user: u._id, department: 'Computer Science', employeeId: 'EMP-2' });
    otherClass = await Class.create({ name: 'Databases', code: 'CS-202', department: 'Computer Science', semester: 'Fall 2026', schedule: { day: 'Tuesday', startTime: '09:00', endTime: '10:00' }, faculty: otherFaculty._id, room: 'B-2' });
  });

  const preview = (body) => request(app()).post('/api/schedule/preview').set(auth(admin)).send(body);
  const create = (body) => request(app()).post('/api/schedule').set(auth(admin)).send(body);
  const base = (classId = fixture.classDoc._id) => ({ classId: String(classId), room: 'A-1', startTime: '09:00', endTime: '10:00' });

  it('PB-22: expands individual dates and a weekly pattern, de-duplicated and sorted', async () => {
    const from = inDays(1);
    const to = inDays(14);
    const weekday = weekdayOf(addDays(todayInInstitution(), 1));
    const res = await preview({ ...base(), dates: [inDays(1), inDays(3)], recurrence: { days: [weekday], from, to } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const dates = res.body.data.occurrences.map((o) => o.date);
    assert.deepEqual(dates, [inDays(1), inDays(3), inDays(8)]);
    assert.ok(res.body.data.occurrences.every((o) => o.ok && o.room === 'A-1'));
  });

  it('PB-22: saves the confirmed dates and reports them', async () => {
    const res = await create({ ...base(), dates: [inDays(2), inDays(9)] });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data.saved, [inDays(2), inDays(9)]);
    assert.deepEqual(res.body.data.rejected, []);
    const list = await request(app()).get('/api/schedule').set(auth(admin));
    assert.equal(list.body.data.length, 2);
  });

  it('PB-23: an overlapping room booking is rejected with the reason, and nothing is saved', async () => {
    await create({ ...base(otherClass._id), room: 'A-1', dates: [inDays(2)], startTime: '09:30', endTime: '11:00' });
    const pre = await preview({ ...base(), dates: [inDays(2), inDays(3)] });
    const [conflicted, clear] = pre.body.data.occurrences;
    assert.equal(conflicted.ok, false);
    assert.match(conflicted.conflicts[0].reason, /Room A-1 is already booked for CS-202 09:30–11:00/);
    assert.equal(clear.ok, true);

    const res = await create({ ...base(), dates: [inDays(2), inDays(3)] });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /1 of 2 dates conflict.*Nothing was saved/);
    assert.equal(res.body.error.details[0].field, inDays(2));
    const { ClassSession } = require('../models');
    assert.equal(await ClassSession.countDocuments({ class: fixture.classDoc._id }), 0);
  });

  it('PB-23: an overlapping instructor booking is rejected with the reason', async () => {
    const { Class } = require('../models');
    await Class.updateOne({ _id: otherClass._id }, { faculty: fixture.faculty._id });
    await create({ ...base(otherClass._id), room: 'B-2', dates: [inDays(4)] });
    const res = await create({ ...base(), room: 'A-1', dates: [inDays(4)], startTime: '09:45', endTime: '10:30' });
    assert.equal(res.status, 409);
    assert.match(res.body.error.details[0].message, /Fay Faculty already teaches CS-202 09:00–10:00/);
  });

  it('PB-23: back-to-back and different-room bookings are accepted', async () => {
    await create({ ...base(otherClass._id), dates: [inDays(5)] });
    assert.equal((await create({ ...base(), dates: [inDays(5)], startTime: '10:00', endTime: '11:00' })).status, 201);
    assert.equal((await create({ ...base(), room: 'C-3', dates: [inDays(6)] })).status, 201);
  });

  it('PB-23: two concurrent saves for the same slot — exactly one wins', async () => {
    const [a, b] = await Promise.all([
      create({ ...base(), dates: [inDays(7)] }),
      create({ ...base(otherClass._id), dates: [inDays(7)] }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    const { ClassSession } = require('../models');
    assert.equal(await ClassSession.countDocuments({ date: new Date(`${inDays(7)}T00:00:00.000Z`) }), 1);
  });

  it('validates the slot: past dates, end before start, unknown or archived class', async () => {
    assert.equal((await create({ ...base(), dates: [inDays(-1)] })).status, 400);
    assert.equal((await create({ ...base(), startTime: '10:00', endTime: '09:00', dates: [inDays(1)] })).status, 400);
    await request(app()).delete(`/api/classes/${fixture.classDoc._id}`).set(auth(admin));
    assert.equal((await create({ ...base(), dates: [inDays(1)] })).status, 409);
  });

  it('archiving a class frees its future bookings; cancelled sessions free the slot too', async () => {
    await create({ ...base(), dates: [inDays(3)] });
    const list = await request(app()).get('/api/schedule').set(auth(admin));
    await request(app()).delete(`/api/schedule/${list.body.data[0].id}`).set(auth(admin));
    assert.equal((await create({ ...base(otherClass._id), dates: [inDays(3)] })).status, 201, 'cancelled slot is free');

    await create({ ...base(), room: 'Z-9', dates: [inDays(10)] });
    await request(app()).delete(`/api/classes/${fixture.classDoc._id}`).set(auth(admin));
    const { ClassSession } = require('../models');
    assert.equal(await ClassSession.countDocuments({ class: fixture.classDoc._id, status: 'scheduled' }), 0);
  });

  it('PB-23: assigning a teacher whose sessions overlap is rejected', async () => {
    await create({ ...base(), dates: [inDays(4)] });
    await create({ ...base(otherClass._id), room: 'B-2', dates: [inDays(4)], startTime: '09:30', endTime: '10:30' });
    const res = await request(app()).put(`/api/classes/${otherClass._id}/assign-faculty`).set(auth(admin)).send({ facultyId: String(fixture.faculty._id) });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /overlapping session/);
  });

  it('scheduled sessions drive the submission timeliness view', async () => {
    const { ClassSession } = require('../models');
    const yesterday = addDays(todayInInstitution(), -2);
    await ClassSession.create({ class: fixture.classDoc._id, faculty: fixture.faculty._id, room: 'A-1', date: yesterday, startTime: '07:00', endTime: '08:00', startMinutes: 420, endMinutes: 480 });
    const res = await request(app()).get(`/api/audit/submissions?from=${ymd(yesterday)}&to=${ymd(yesterday)}`).set(auth(admin));
    const row = res.body.data.find((r) => r.code === 'CS-101');
    assert.equal(row.status, 'missing');
    assert.equal(row.room, 'A-1');
  });

  it('scheduling is administrators only', async () => {
    const faculty = await loginAs('faculty@test.edu');
    assert.equal((await request(app()).post('/api/schedule').set(auth(faculty)).send({ ...base(), dates: [inDays(1)] })).status, 403);
  });
});
