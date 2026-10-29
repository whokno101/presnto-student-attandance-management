/**
 * PB-17 CSV export/import and PB-19 absence excuses.
 */
process.env.INSTITUTION_TIME_ZONE = 'UTC';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { startDb, stopDb, resetDb, app, request, loginAs, seedBasic, PASSWORD } = require('./helpers');
const { todayInInstitution, addDays, ymd } = require('../utils/dates');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const csv = (rows) => rows.map((r) => r.join(',')).join('\r\n');

describe('PB-17 CSV export and import', () => {
  let admin;
  let faculty;
  let fixture;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await resetDb();
    fixture = await seedBasic({ studentCount: 3 });
    admin = await loginAs('admin@test.edu');
    faculty = await loginAs('faculty@test.edu');
  });

  const preview = (dataset, body, token = admin) => request(app()).post(`/api/data/import/${dataset}/preview`).set(auth(token)).send({ filename: 'upload.csv', ...body });
  const commit = (dataset, body, token = admin) => request(app()).post(`/api/data/import/${dataset}/commit`).set(auth(token)).send({ filename: 'upload.csv', ...body });

  it('AC-1: an administrator can export students, classes, faculty and attendance', async () => {
    await request(app()).post('/api/attendance/mark').set(auth(admin)).send({ classId: String(fixture.classDoc._id), date: '2026-01-05', records: [{ studentId: String(fixture.students[0]._id), status: 'present' }] });
    for (const [dataset, header] of [['students', 'student_id,name,email'], ['faculty', 'employee_id,name'], ['classes', 'code,name,department'], ['attendance', 'date,class_code,student_id,status']]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app()).get(`/api/data/export/${dataset}`).set(auth(admin));
      assert.equal(res.status, 200, dataset);
      assert.match(res.headers['content-type'], /text\/csv/);
      assert.ok(res.text.replace(/^﻿/, '').startsWith(header), `${dataset}: ${res.text.slice(0, 40)}`);
    }
    const att = await request(app()).get('/api/data/export/attendance').set(auth(admin));
    assert.match(att.text, /2026-01-05,CS-101,STU-1,present/);
  });

  it('AC-2: faculty cannot import or export global directories, nor another class', async () => {
    assert.equal((await preview('faculty', { csv: 'employee_id,name,email,department\r\nEMP-9,X Y,x@y.edu,CS' }, faculty)).status, 403);
    assert.equal((await preview('students', { csv: 'student_id,name,email,department\r\nSTU-9,X Y,x@y.edu,CS' }, faculty)).status, 403);
    assert.equal((await request(app()).get('/api/data/export/students').set(auth(faculty))).status, 403);

    const { Class } = require('../models');
    await Class.create({ name: 'Other', code: 'CS-999', department: 'Computer Science', semester: 'Fall 2026', schedule: { day: 'Monday', startTime: '09:00', endTime: '10:00' }, students: [fixture.students[0]._id] });
    const res = await preview('attendance', { csv: csv([['date', 'class_code', 'student_id', 'status'], ['2026-01-05', 'CS-999', 'STU-1', 'present'], ['2026-01-05', 'CS-101', 'STU-1', 'present']]) }, faculty);
    assert.equal(res.status, 200);
    assert.match(res.body.data.rows[0].errors.join(), /not one of your classes/);
    assert.equal(res.body.data.rows[1].action, 'create');
  });

  it('AC-3: missing required headers are rejected with a readable explanation', async () => {
    const res = await preview('students', { csv: 'student_id,name\r\nSTU-9,Jane' });
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /Missing required columns: email, department/);
  });

  it('AC-4: invalid dates and unknown identifiers are flagged before anything is inserted', async () => {
    const body = { csv: csv([['date', 'class_code', 'student_id', 'status'], ['2026-02-31', 'CS-101', 'STU-1', 'present'], ['2026-01-05', 'CS-101', 'STU-404', 'present'], ['2026-01-05', 'NOPE', 'STU-1', 'present'], ['2026-01-05', 'CS-101', 'STU-1', 'maybe']]) };
    const res = await preview('attendance', body);
    const errors = res.body.data.rows.map((r) => r.errors.join(' '));
    assert.match(errors[0], /not a real date/);
    assert.match(errors[1], /unknown student_id STU-404/);
    assert.match(errors[2], /unknown class_code NOPE/);
    assert.match(errors[3], /status must be one of/);
    assert.equal(res.body.data.summary.reject, 4);
    const { Attendance } = require('../models');
    assert.equal(await Attendance.countDocuments(), 0);
    const committed = await commit('attendance', body);
    assert.equal(committed.body.data.applied, false);
    assert.equal(await Attendance.countDocuments(), 0);
  });

  it('AC-5/AC-6: preview writes nothing; commit applies and reports counts with an audit entry', async () => {
    const body = { csv: csv([['student_id', 'name', 'email', 'department', 'password'], ['STU-50', 'New Person', 'new@test.edu', 'Computer Science', PASSWORD], ['STU-1', 'Renamed One', 'student1@test.edu', 'Computer Science', ''], ['STU-2', 'Stu Dent2', 'student2@test.edu', 'Computer Science', '']]) };
    const pre = await preview('students', body);
    assert.deepEqual(pre.body.data.summary, { total: 3, create: 1, update: 1, skip: 1, reject: 0 });
    assert.equal(pre.body.data.rows[0].values.password, '••••••', 'passwords are never echoed back');
    const { Student } = require('../models');
    assert.equal(await Student.countDocuments(), 3);

    const done = await commit('students', body);
    assert.equal(done.status, 200);
    assert.equal(done.body.data.applied, true);
    assert.deepEqual(done.body.data.summary, { total: 3, create: 1, update: 1, skip: 1, reject: 0 });
    assert.equal(await Student.countDocuments(), 4);
    assert.ok(await loginAs('new@test.edu'));

    const log = await request(app()).get('/api/audit?action=import.committed').set(auth(admin));
    assert.equal(log.body.data.length, 1);
    assert.match(log.body.data[0].summary, /1 created, 1 updated, 1 unchanged, 0 rejected/);
    assert.equal(log.body.data[0].meta.filename, 'upload.csv');
    assert.doesNotMatch(JSON.stringify(log.body.data[0]), new RegExp(PASSWORD));
  });

  it('duplicate rows are rejected and a repeated import creates no duplicates', async () => {
    const body = { csv: csv([['date', 'class_code', 'student_id', 'status'], ['2026-01-05', 'CS-101', 'STU-1', 'absent'], ['2026-01-05', 'CS-101', 'STU-1', 'present'], ['2026-01-05', 'CS-101', 'STU-2', 'present']]) };
    const first = await commit('attendance', body);
    assert.match(first.body.data.rows[1].errors.join(), /Duplicate student\/session — same as line 2/);
    const again = await commit('attendance', body);
    assert.equal(again.body.data.summary.skip, 2);
    const { Attendance } = require('../models');
    assert.equal(await Attendance.countDocuments(), 2);
    const records = await request(app()).get('/api/reports/records').set(auth(admin));
    assert.ok(records.body.data.every((r) => r.source === 'import'));
  });

  it('attendance imports trigger the same audit and risk recalculation as manual marking', async () => {
    const rows = [['date', 'class_code', 'student_id', 'status']];
    ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'].forEach((d) => rows.push([d, 'CS-101', 'STU-1', 'absent']));
    await commit('attendance', { csv: csv(rows) });
    // Applied in date order: below 75% after the first absence, then the 4th
    // absence adds the second reason — exactly what manual marking would do.
    const alerts = await request(app()).get('/api/notifications?type=risk').set(auth(faculty));
    assert.deepEqual(alerts.body.data.map((a) => a.reasons), [['absences', 'rate'], ['rate']]);
    const log = await request(app()).get('/api/audit?action=attendance.status_set').set(auth(admin));
    assert.equal(log.body.data.length, 4);
    assert.match(log.body.data[0].summary, /\(CSV import\)/);
  });

  it('rejects archived classes, non-UTF-8 files and non-CSV uploads; warns about extra columns', async () => {
    await request(app()).delete(`/api/classes/${fixture.classDoc._id}`).set(auth(admin));
    const archived = await preview('attendance', { csv: csv([['date', 'class_code', 'student_id', 'status', 'notes'], ['2026-01-05', 'CS-101', 'STU-1', 'present', 'x']]) });
    assert.match(archived.body.data.rows[0].errors.join(), /archived/);
    assert.match(archived.body.data.warnings.join(), /Ignored unexpected column: notes/);

    assert.equal((await preview('attendance', { csv: 'date,class_code,student_id,status\r\n2026-01-05,CS-101,STU-1,pr�sent' })).status, 400);
    assert.equal((await preview('attendance', { csv: 'date,class_code', filename: 'data.xlsx' })).status, 400);
  });

  it('keeps formula-like text as text and round-trips its own export', async () => {
    const { User } = require('../models');
    await User.updateOne({ email: 'student1@test.edu' }, { name: '=1+1 Evil' });
    const exported = await request(app()).get('/api/data/export/students').set(auth(admin));
    assert.match(exported.text, /'=1\+1 Evil/);
    const res = await preview('students', { csv: exported.text });
    assert.equal(res.body.data.summary.skip, 3, JSON.stringify(res.body.data.rows.map((r) => r.errors)));
  });

  it('a mixed file applies the valid rows and reports the rejected ones (mixed endings too)', async () => {
    const body = { csv: 'date,class_code,student_id,status\n2026-01-05,CS-101,STU-1,present\r2026-01-05,CS-101,STU-404,present\r\n2026-01-05,CS-101,STU-2,late\n' };
    const res = await commit('attendance', body);
    assert.deepEqual(res.body.data.summary, { total: 3, create: 2, update: 0, skip: 0, reject: 1 });
  });

  it('schedule imports apply the conflict rules across the file', async () => {
    const day = ymd(addDays(todayInInstitution(), 7));
    const body = { csv: csv([['class_code', 'date', 'start_time', 'end_time', 'room'], ['CS-101', day, '09:00', '10:00', 'A-1'], ['CS-101', day, '09:30', '10:30', 'A-1']]) };
    const res = await commit('sessions', body);
    assert.equal(res.body.data.summary.create, 1);
    assert.match(res.body.data.rows[1].errors.join(), /Room A-1 is already booked .*another row in this file/);
  });
});

describe('PB-19 absence excuses', () => {
  let admin;
  let faculty;
  let student;
  let fixture;

  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await resetDb();
    fixture = await seedBasic({ studentCount: 2 });
    admin = await loginAs('admin@test.edu');
    faculty = await loginAs('faculty@test.edu');
    student = await loginAs('student1@test.edu');
    await request(app())
      .post('/api/attendance/mark')
      .set(auth(faculty))
      .send({ classId: String(fixture.classDoc._id), date: '2026-01-05', records: [{ studentId: String(fixture.students[0]._id), status: 'absent' }, { studentId: String(fixture.students[1]._id), status: 'present' }] });
  });

  const submit = (overrides = {}, token = student) =>
    request(app())
      .post('/api/excuses')
      .set(auth(token))
      .send({ classId: String(fixture.classDoc._id), date: '2026-01-05', category: 'illness', explanation: 'I had a fever and stayed home.', document: { filename: 'note.png', mimetype: 'image/png', data: PNG.toString('base64') }, ...overrides });

  const absentCount = async () => {
    const res = await request(app()).get('/api/reports/students').set(auth(faculty));
    return res.body.data.find((r) => r.studentId === String(fixture.students[0]._id));
  };

  it('AC-1: a student submits an excuse for an eligible absence and gets confirmation', async () => {
    const eligible = await request(app()).get('/api/excuses/eligible').set(auth(student));
    assert.equal(eligible.body.data.length, 1);
    const res = await submit();
    assert.equal(res.status, 201);
    assert.equal(res.body.data.status, 'pending');
    assert.match(res.body.message, /submitted/);
    assert.equal((await request(app()).get('/api/excuses/eligible').set(auth(student))).body.data.length, 0);
  });

  it('AC-2: the class teacher sees the pending request and its document', async () => {
    const { body } = await submit();
    const notifications = await request(app()).get('/api/notifications?type=excuse_submitted').set(auth(faculty));
    assert.equal(notifications.body.data.length, 1);
    const list = await request(app()).get('/api/excuses?status=pending').set(auth(faculty));
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].student.studentId, 'STU-1');
    const doc = await request(app()).get(`/api/excuses/${body.data.id}/document`).set(auth(faculty)).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(doc.status, 200);
    assert.equal(doc.headers['content-type'], 'image/png');
    assert.equal(doc.headers['x-content-type-options'], 'nosniff');
    assert.ok(Buffer.compare(doc.body, PNG) === 0);
  });

  it('AC-4: a pending excuse does not change the official absence count', async () => {
    await submit();
    const row = await absentCount();
    assert.equal(row.absent, 1);
    assert.equal(row.excused, 0);
  });

  it('AC-3/AC-5: approval records reviewer and time, and recalculates attendance and risk', async () => {
    assert.equal((await request(app()).get('/api/analytics/faculty?timeframe=all').set(auth(faculty))).body.data.atRisk.length, 1);
    const { body } = await submit();
    const res = await request(app()).post(`/api/excuses/${body.data.id}/review`).set(auth(faculty)).send({ decision: 'approved', note: 'Doctor note accepted' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'approved');
    assert.equal(res.body.data.reviewer, 'Fay Faculty');
    assert.ok(res.body.data.reviewedAt);
    assert.equal(res.body.data.attendanceChanged, true);

    const row = await absentCount();
    assert.equal(row.absent, 0);
    assert.equal(row.excused, 1);
    assert.equal((await request(app()).get('/api/analytics/faculty?timeframe=all').set(auth(faculty))).body.data.atRisk.length, 0);

    const mine = await request(app()).get('/api/excuses/mine').set(auth(student));
    assert.equal(mine.body.data[0].decisionNote, 'Doctor note accepted');
    const decided = await request(app()).get('/api/notifications?type=excuse_decided').set(auth(student));
    assert.equal(decided.body.data.length, 1);
    const log = await request(app()).get('/api/audit?category=excuse').set(auth(admin));
    assert.deepEqual(log.body.data.map((e) => e.action).sort(), ['excuse.approved', 'excuse.submitted']);

    const again = await request(app()).post(`/api/excuses/${body.data.id}/review`).set(auth(faculty)).send({ decision: 'rejected' });
    assert.equal(again.status, 409);
  });

  it('rejection leaves attendance alone and allows a resubmission; duplicates are refused', async () => {
    const { body } = await submit();
    assert.equal((await submit()).status, 409, 'second submission for the same session');
    await request(app()).post(`/api/excuses/${body.data.id}/review`).set(auth(faculty)).send({ decision: 'rejected', note: 'No evidence' });
    assert.equal((await absentCount()).absent, 1);
    assert.equal((await submit()).status, 201);
  });

  it('validates uploads: type, content and size', async () => {
    assert.equal((await submit({ document: { filename: 'x.exe', mimetype: 'application/x-msdownload', data: 'AAAA' } })).status, 400);
    const fake = await submit({ document: { filename: 'x.pdf', mimetype: 'application/pdf', data: PNG.toString('base64') } });
    assert.equal(fake.status, 400);
    assert.match(fake.body.error.message, /does not match its type/);
    const big = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(5 * 1024 * 1024)]);
    assert.equal((await submit({ document: { filename: 'big.pdf', mimetype: 'application/pdf', data: big.toString('base64') } })).status, 400);
  });

  it('only recorded absences of your own are eligible', async () => {
    assert.equal((await submit({ date: '2026-01-12' })).status, 409, 'not recorded yet');
    const other = await loginAs('student2@test.edu');
    const res = await submit({}, other);
    assert.equal(res.status, 409, 'student 2 was present');
    assert.match(res.body.error.message, /marked present/);
  });

  it('protects documents and reviews: other students, reassigned teachers', async () => {
    const { body } = await submit();
    const other = await loginAs('student2@test.edu');
    assert.equal((await request(app()).get(`/api/excuses/${body.data.id}`).set(auth(other))).status, 404);
    assert.equal((await request(app()).get(`/api/excuses/${body.data.id}/document`).set(auth(other))).status, 404);

    const { User, Faculty } = require('../models');
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const u = await User.create({ name: 'Next Teacher', email: 'next@test.edu', passwordHash, role: 'faculty' });
    const f = await Faculty.create({ user: u._id, department: 'Computer Science', employeeId: 'EMP-7' });
    await request(app()).put(`/api/classes/${fixture.classDoc._id}/assign-faculty`).set(auth(admin)).send({ facultyId: String(f._id) });

    const stale = await request(app()).post(`/api/excuses/${body.data.id}/review`).set(auth(faculty)).send({ decision: 'approved' });
    assert.equal(stale.status, 403);
    const next = await loginAs('next@test.edu');
    assert.equal((await request(app()).post(`/api/excuses/${body.data.id}/review`).set(auth(next)).send({ decision: 'approved' })).status, 200);
  });
});
