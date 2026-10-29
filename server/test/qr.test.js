/**
 * PB-20 QR code attendance check-in.
 */
process.env.INSTITUTION_TIME_ZONE = 'UTC';

const { describe, it, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { startDb, stopDb, resetDb, app, request, loginAs, seedBasic, PASSWORD, EVERY_DAY } = require('./helpers');

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('PB-20 QR check-in', () => {
  let admin;
  let faculty;
  let student;
  let fixture;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await resetDb();
    fixture = await seedBasic({ studentCount: 2, schedule: EVERY_DAY });
    admin = await loginAs('admin@test.edu');
    faculty = await loginAs('faculty@test.edu');
    student = await loginAs('student1@test.edu');
    // Mid-window, so tests that advance the clock land where they intend.
    const now = Date.now();
    mock.timers.enable({ apis: ['Date'], now: now - (now % 15000) + 1000 });
  });

  afterEach(() => mock.timers.reset());

  const startSession = (token = faculty) => request(app()).post('/api/qr/sessions').set(auth(token)).send({ classId: String(fixture.classDoc._id) });
  const code = async (id, token = faculty) => (await request(app()).get(`/api/qr/sessions/${id}/token`).set(auth(token))).body.data.token;
  const scan = (token, who = student, extra = {}) => request(app()).post('/api/qr/checkin').set(auth(who)).send({ token, ...extra });

  it('AC-1: an assigned teacher can open a rotating code for today; others cannot', async () => {
    const res = await startSession();
    assert.equal(res.status, 201);
    assert.equal(res.body.data.rotationSeconds, 15);
    const token = await request(app()).get(`/api/qr/sessions/${res.body.data.id}/token`).set(auth(faculty));
    assert.match(token.body.data.token, /^[0-9a-f]{24}\.\d+\.[A-Za-z0-9_-]{43}$/);
    assert.ok(token.body.data.rotatesInMs <= 15000);

    // reopening returns the same session
    assert.equal((await startSession()).body.data.id, res.body.data.id);

    assert.equal((await startSession(student)).status, 403);
    const { User, Faculty } = require('../models');
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const u = await User.create({ name: 'Other', email: 'other@test.edu', passwordHash, role: 'faculty' });
    await Faculty.create({ user: u._id, department: 'Computer Science', employeeId: 'EMP-3' });
    const other = await loginAs('other@test.edu');
    assert.equal((await startSession(other)).status, 403);
    assert.equal((await request(app()).get(`/api/qr/sessions/${res.body.data.id}/token`).set(auth(other))).status, 403);
  });

  it('AC-2/AC-6: a valid scan records Present and the teacher sees it', async () => {
    const { body } = await startSession();
    const res = await scan(await code(body.data.id));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.result, 'accepted');

    const { Attendance } = require('../models');
    const record = await Attendance.findOne({ student: fixture.students[0]._id });
    assert.equal(record.status, 'present');
    assert.equal(record.source, 'qr');

    const status = await request(app()).get(`/api/qr/sessions/${body.data.id}`).set(auth(faculty));
    assert.equal(status.body.data.checkedIn.length, 1);
    assert.equal(status.body.data.checkedIn[0].studentId, 'STU-1');
    const log = await request(app()).get('/api/audit?action=attendance.status_set').set(auth(admin));
    assert.match(log.body.data[0].summary, /\(QR check-in\)/);
  });

  it('accepts a code scanned just after it rotated, rejects one two rotations old (AC-3)', async () => {
    const { body } = await startSession();
    const token = await code(body.data.id);
    mock.timers.tick(15000);
    assert.equal((await scan(token)).status, 200, 'previous window is still accepted');

    const token2 = await code(body.data.id);
    mock.timers.tick(30000);
    const other = await loginAs('student2@test.edu');
    const late = await scan(token2, other);
    assert.equal(late.status, 410);
    assert.equal(late.body.error.code, 'QR_EXPIRED');
    assert.match(late.body.error.message, /expired/);
  });

  it('AC-3: tampered, forged and closed-session codes are rejected', async () => {
    const { body } = await startSession();
    const token = await code(body.data.id);
    const [id, window, sig] = token.split('.');
    assert.equal((await scan(`${id}.${window}.${sig.slice(0, -2)}xx`)).status, 400);
    assert.equal((await scan(`${id}.${Number(window) + 1}.${sig}`)).status, 400, 'window cannot be advanced without the secret');
    assert.equal((await scan('hello')).status, 400);

    await request(app()).post(`/api/qr/sessions/${body.data.id}/close`).set(auth(faculty));
    assert.equal((await scan(token)).status, 410);
  });

  it('AC-4: scanning the same code repeatedly never duplicates the record', async () => {
    const { body } = await startSession();
    const token = await code(body.data.id);
    const results = await Promise.all([scan(token), scan(token), scan(token)]);
    assert.ok(results.every((r) => r.status === 200));
    assert.ok(results.some((r) => r.body.data.result === 'accepted'));
    assert.equal((await scan(token)).body.data.result, 'already_checked_in');
    const { Attendance } = require('../models');
    assert.equal(await Attendance.countDocuments({ student: fixture.students[0]._id }), 1);
  });

  it('AC-5: a student cannot check in to a class they are not enrolled in', async () => {
    const { User, Student } = require('../models');
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const u = await User.create({ name: 'Outsider', email: 'outsider@test.edu', passwordHash, role: 'student' });
    await Student.create({ user: u._id, department: 'Computer Science', studentId: 'STU-99' });
    const outsider = await loginAs('outsider@test.edu');
    const { body } = await startSession();
    const res = await scan(await code(body.data.id), outsider);
    assert.equal(res.status, 403);
    assert.match(res.body.error.message, /not enrolled in CS-101/);
  });

  it('a manual mark by the teacher is never overwritten by a scan', async () => {
    const { body } = await startSession();
    const today = new Date().toISOString().slice(0, 10);
    await request(app()).post('/api/attendance/mark').set(auth(faculty)).send({ classId: String(fixture.classDoc._id), date: today, records: [{ studentId: String(fixture.students[0]._id), status: 'absent' }] });
    const res = await scan(await code(body.data.id));
    assert.equal(res.body.data.result, 'already_recorded');
    assert.match(res.body.data.message, /already recorded you as absent/);
    const { Attendance } = require('../models');
    assert.equal((await Attendance.findOne({ student: fixture.students[0]._id })).status, 'absent');
  });

  it('never trusts a student id sent by the client', async () => {
    const { body } = await startSession();
    await scan(await code(body.data.id), student, { studentId: String(fixture.students[1]._id) });
    const { Attendance } = require('../models');
    assert.equal(await Attendance.countDocuments({ student: fixture.students[1]._id }), 0);
    assert.equal(await Attendance.countDocuments({ student: fixture.students[0]._id }), 1);
  });
});
