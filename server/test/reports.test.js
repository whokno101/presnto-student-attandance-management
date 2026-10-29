/**
 * PB-15 class-by-class overview, filters and automatic absence counting.
 */
process.env.INSTITUTION_TIME_ZONE = 'UTC';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { startDb, stopDb, resetDb, app, request, loginAs, seedBasic, PASSWORD } = require('./helpers');

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('PB-15 class reports and absence counting', () => {
  let admin;
  let faculty;
  let fixture;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await resetDb();
    fixture = await seedBasic({ studentCount: 5 });
    admin = await loginAs('admin@test.edu');
    faculty = await loginAs('faculty@test.edu');
  });

  const mark = (date, statuses, token = faculty) =>
    request(app())
      .post('/api/attendance/mark')
      .set(auth(token))
      .send({
        classId: String(fixture.classDoc._id),
        date,
        records: statuses.map((status, i) => ({ studentId: String(fixture.students[i]._id), status })),
      });

  const studentRow = async (index, token = faculty) => {
    const res = await request(app()).get(`/api/reports/students?classId=${fixture.classDoc._id}`).set(auth(token));
    return res.body.data.find((r) => r.studentId === String(fixture.students[index]._id));
  };

  it('AC-1: session rows show status counts and the attendance percentage', async () => {
    await mark('2026-01-05', ['present', 'present', 'late', 'absent', 'excused']);
    const res = await request(app()).get('/api/reports/sessions').set(auth(faculty));
    assert.equal(res.status, 200);
    const [row] = res.body.data;
    assert.deepEqual(
      { present: row.present, late: row.late, absent: row.absent, excused: row.excused, enrolled: row.enrolled },
      { present: 2, late: 1, absent: 1, excused: 1, enrolled: 5 }
    );
    // excused leaves the denominator: 3 attended / 4 eligible
    assert.equal(row.rate, 75);
    assert.equal(row.code, 'CS-101');
  });

  it('AC-2: a session below 60% gets the warning flag', async () => {
    await mark('2026-01-05', ['present', 'absent', 'absent', 'absent', 'present']);
    await mark('2026-01-12', ['present', 'present', 'present', 'absent', 'present']);
    const res = await request(app()).get('/api/reports/sessions?sort=date&order=asc').set(auth(faculty));
    assert.equal(res.body.data[0].rate, 40);
    assert.equal(res.body.data[0].belowWarning, true);
    assert.equal(res.body.data[1].belowWarning, false);
    assert.equal(res.body.summary.belowWarning, 1);
  });

  it('AC-3: marking a student absent updates their absence count', async () => {
    await mark('2026-01-05', ['absent']);
    assert.equal((await studentRow(0)).absent, 1);

    const sheet = await request(app()).get(`/api/attendance/class/${fixture.classDoc._id}?date=2026-01-06`).set(auth(faculty));
    assert.equal(sheet.body.data.students.find((s) => s.id === String(fixture.students[0]._id)).absences, 1);
  });

  it('AC-4: correcting Absent to Present or Excused recalculates without a duplicate', async () => {
    await mark('2026-01-05', ['absent']);
    await mark('2026-01-05', ['absent']); // retried save
    assert.equal((await studentRow(0)).absent, 1);

    await mark('2026-01-05', ['present']);
    let row = await studentRow(0);
    assert.equal(row.absent, 0);
    assert.equal(row.present, 1);
    assert.equal(row.marked, 1);

    await mark('2026-01-05', ['excused']);
    row = await studentRow(0);
    assert.equal(row.absent, 0);
    assert.equal(row.excused, 1);
    assert.equal(row.eligible, 0);
  });

  it('students with no attendance history still appear, with no rate', async () => {
    await mark('2026-01-05', ['present']);
    const row = await studentRow(4);
    assert.equal(row.marked, 0);
    assert.equal(row.eligible, 0);
    assert.equal(row.atRisk, false);
  });

  it('flags students at risk with the PB-16 rule', async () => {
    for (const day of ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']) {
      // eslint-disable-next-line no-await-in-loop
      await mark(day, ['absent', 'present']);
    }
    const risky = await studentRow(0);
    assert.equal(risky.atRisk, true);
    assert.deepEqual(risky.riskReasons, ['absences', 'rate']);
    assert.equal((await studentRow(1)).atRisk, false);
  });

  it('AC-5: filters apply to rows and summary alike', async () => {
    await mark('2026-01-05', ['present', 'absent', 'present', 'present', 'present']);
    await mark('2026-01-12', ['present', 'present', 'present', 'present', 'present']);

    const all = await request(app()).get('/api/reports/sessions').set(auth(admin));
    assert.equal(all.body.summary.sessions, 2);
    assert.equal(all.body.summary.absent, 1);

    const ranged = await request(app()).get('/api/reports/sessions?from=2026-01-10&to=2026-01-31').set(auth(admin));
    assert.equal(ranged.body.data.length, 1);
    assert.equal(ranged.body.summary.sessions, 1);
    assert.equal(ranged.body.summary.absent, 0);
    assert.equal(ranged.body.summary.rate, 100);

    const withAbsence = await request(app()).get('/api/reports/sessions?status=absent').set(auth(admin));
    assert.equal(withAbsence.body.data.length, 1);
    assert.equal(withAbsence.body.summary.marked, withAbsence.body.data.reduce((n, r) => n + r.marked, 0));

    const records = await request(app()).get('/api/reports/records?status=absent').set(auth(admin));
    assert.equal(records.body.data.length, 1);
    assert.equal(records.body.summary.records, 1);
    assert.equal(records.body.data[0].status, 'absent');

    const byStudent = await request(app()).get(`/api/reports/records?student=STU-2`).set(auth(admin));
    assert.ok(byStudent.body.data.every((r) => r.studentNumber === 'STU-2'));
    assert.equal(byStudent.body.data.length, 2);
  });

  it('AC-6: faculty cannot view classes outside their assignment', async () => {
    const { User, Faculty, Class } = require('../models');
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const otherUser = await User.create({ name: 'Other Teacher', email: 'other@test.edu', passwordHash, role: 'faculty' });
    const otherFaculty = await Faculty.create({ user: otherUser._id, department: 'Computer Science', employeeId: 'EMP-2' });
    const otherClass = await Class.create({
      name: 'Other',
      code: 'CS-202',
      department: 'Computer Science',
      semester: 'Fall 2026',
      schedule: { day: 'Tuesday', startTime: '09:00', endTime: '10:00' },
      faculty: otherFaculty._id,
      students: [fixture.students[0]._id],
    });

    const forbidden = await request(app()).get(`/api/reports/sessions?classId=${otherClass._id}`).set(auth(faculty));
    assert.equal(forbidden.status, 403);

    await mark('2026-01-05', ['present']);
    const own = await request(app()).get('/api/reports/students').set(auth(faculty));
    assert.ok(own.body.data.every((r) => r.code === 'CS-101'));

    const student = await loginAs('student1@test.edu');
    assert.equal((await request(app()).get('/api/reports/sessions').set(auth(student))).status, 403);
  });

  it('labels archived classes in historical reports', async () => {
    await mark('2026-01-05', ['present']);
    await request(app()).delete(`/api/classes/${fixture.classDoc._id}`).set(auth(admin));
    const res = await request(app()).get('/api/reports/sessions').set(auth(admin));
    assert.equal(res.body.data[0].archived, true);
  });

  it('exports the filtered rows as CSV, defusing spreadsheet formulas', async () => {
    const { User } = require('../models');
    await User.updateOne({ email: 'student1@test.edu' }, { name: '=HYPERLINK("http://evil")' });
    await mark('2026-01-05', ['absent', 'present']);

    const res = await request(app()).get('/api/reports/students?format=csv').set(auth(faculty));
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.headers['content-disposition'], /attachment; filename="attendance-students-/);
    assert.match(res.text, /Student ID,Student name,Class code/);
    assert.match(res.text, /"'=HYPERLINK\(""http:\/\/evil""\)"/);
    assert.doesNotMatch(res.text, /,=HYPERLINK/);

    const log = await request(app()).get('/api/audit?action=export.report').set(auth(admin));
    assert.equal(log.body.data.length, 1);
  });
});
