/**
 * Regression tests for bugs fixed on the sprint-2 branch.
 */
// A zone far ahead of UTC: its "today" is a future date in UTC for most of the
// day, which is exactly what used to be rejected.
process.env.INSTITUTION_TIME_ZONE = 'Pacific/Kiritimati';

const { describe, it, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { startDb, stopDb, resetDb, app, request, loginAs, seedBasic, EVERY_DAY } = require('./helpers');
const { todayInInstitution } = require('../utils/dates');

const ymd = (date) => date.toISOString().slice(0, 10);

describe('regressions', () => {
  let admin;
  let fixture;

  before(startDb);
  after(stopDb);

  beforeEach(async () => {
    await resetDb();
    fixture = await seedBasic({ schedule: EVERY_DAY });
    admin = await loginAs('admin@test.edu');
  });

  describe('validation messages (Zod 4)', () => {
    it('reports field-specific messages for missing fields, not Zod defaults', async () => {
      const res = await request(app()).post('/api/students').set('Authorization', `Bearer ${admin}`).send({});

      assert.equal(res.status, 400);
      const byField = Object.fromEntries(res.body.error.details.map((d) => [d.field, d.message]));
      assert.equal(byField.name, 'Full name is required');
      assert.equal(byField.email, 'Email is required');
      assert.equal(byField.password, 'Password is required');
      assert.doesNotMatch(res.body.error.message, /Invalid input/);
    });

    it('explains an invalid class day', async () => {
      const res = await request(app())
        .post('/api/classes')
        .set('Authorization', `Bearer ${admin}`)
        .send({ name: 'Xyz', code: 'XYZ-1', department: 'Computer Science', semester: 'Fall 2026', day: 'Funday', startTime: '09:00', endTime: '10:00' });

      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some((d) => d.field === 'day' && d.message === 'Select a valid day'));
    });
  });

  describe('marking only on class days', () => {
    // 2026-10-26 is a Monday, 2026-10-27 a Tuesday.
    const mark = (date) =>
      request(app())
        .post('/api/attendance/mark')
        .set('Authorization', `Bearer ${admin}`)
        .send({ classId: String(fixture.classDoc._id), date, records: [{ studentId: String(fixture.students[0]._id), status: 'present' }] });

    beforeEach(async () => {
      const { Class } = require('../models');
      await Class.updateOne({ _id: fixture.classDoc._id }, { $set: { schedule: [{ day: 'Monday', startTime: '09:00', endTime: '10:00' }] } });
    });

    it('rejects a day the class does not meet', async () => {
      const res = await mark('2026-10-27');
      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /has no class on 2026-10-27/);
      assert.equal((await mark('2026-10-26')).status, 200);
    });

    it('accepts a one-off scheduled session and lists it among the class days', async () => {
      const ClassSession = require('../models/ClassSession');
      await ClassSession.create({ class: fixture.classDoc._id, room: 'A-1', date: new Date('2026-10-27T00:00:00.000Z'), startTime: '09:00', endTime: '10:00', startMinutes: 540, endMinutes: 600 });
      assert.equal((await mark('2026-10-27')).status, 200);

      const days = await request(app()).get(`/api/attendance/class/${fixture.classDoc._id}/days`).set('Authorization', `Bearer ${admin}`);
      assert.equal(days.status, 200);
      assert.deepEqual(days.body.data, { weekdays: ['Monday'], dates: ['2026-10-27'] });
    });
  });

  describe('multi-day class schedule', () => {
    const base = { name: 'Networks', code: 'NET-101', department: 'Computer Science', semester: 'Fall 2026' };
    const post = (body) => request(app()).post('/api/classes').set('Authorization', `Bearer ${admin}`).send(body);

    it('saves a separate start and end time for each day, in day order', async () => {
      const res = await post({
        ...base,
        schedule: [
          { day: 'Wednesday', startTime: '13:00', endTime: '14:30' },
          { day: 'Monday', startTime: '09:00', endTime: '10:30' },
        ],
      });

      assert.equal(res.status, 201);
      assert.deepEqual(res.body.data.schedule, [
        { day: 'Monday', startTime: '09:00', endTime: '10:30' },
        { day: 'Wednesday', startTime: '13:00', endTime: '14:30' },
      ]);
    });

    it('rejects a repeated day, a day with end before start, and an empty list', async () => {
      const twice = await post({ ...base, schedule: [{ day: 'Monday', startTime: '09:00', endTime: '10:00' }, { day: 'Monday', startTime: '11:00', endTime: '12:00' }] });
      assert.equal(twice.status, 400);

      const backwards = await post({ ...base, schedule: [{ day: 'Monday', startTime: '09:00', endTime: '10:00' }, { day: 'Friday', startTime: '11:00', endTime: '10:00' }] });
      assert.equal(backwards.status, 400);
      assert.ok(backwards.body.error.details.some((d) => d.field === 'schedule.1.endTime'));

      assert.equal((await post({ ...base, schedule: [] })).status, 400);
    });
  });

  describe('attendance dates', () => {
    // 12:00 UTC on Oct 29 is already 02:00 on Oct 30 in Kiritimati (UTC+14),
    // so the institution's today is a future date in UTC.
    before(() => mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-29T12:00:00.000Z') }));
    after(() => mock.timers.reset());

    it('pins a clock where the institution date is ahead of UTC', () => {
      assert.equal(ymd(todayInInstitution()), '2026-10-30');
    });

    const mark = (date) =>
      request(app())
        .post('/api/attendance/mark')
        .set('Authorization', `Bearer ${admin}`)
        .send({ classId: String(fixture.classDoc._id), date, records: [{ studentId: String(fixture.students[0]._id), status: 'present' }] });

    it('rejects a date that does not exist instead of rolling it over', async () => {
      const res = await mark('2026-02-31');
      assert.equal(res.status, 400);
      assert.match(res.body.error.message, /exists on the calendar/);
    });

    it('rejects a non-existent date in the class sheet query too', async () => {
      const res = await request(app())
        .get(`/api/attendance/class/${fixture.classDoc._id}?date=2026-02-31`)
        .set('Authorization', `Bearer ${admin}`);
      assert.equal(res.status, 400);
    });

    it("accepts today in the institution's time zone", async () => {
      const res = await mark(ymd(todayInInstitution()));
      assert.equal(res.status, 200, JSON.stringify(res.body));
    });

    it("rejects the day after the institution's today", async () => {
      const tomorrow = new Date(todayInInstitution().getTime() + 24 * 60 * 60 * 1000);
      const res = await mark(ymd(tomorrow));
      assert.equal(res.status, 400);
    });

    it('defaults the class sheet to the institution today', async () => {
      const res = await request(app())
        .get(`/api/attendance/class/${fixture.classDoc._id}`)
        .set('Authorization', `Bearer ${admin}`);
      assert.equal(res.status, 200);
      assert.equal(ymd(new Date(res.body.data.date)), ymd(todayInInstitution()));
    });
  });

  describe('query strings', () => {
    it('never turns query parameters into objects (no MongoDB operator injection)', async () => {
      // The default "extended" parser made ?department[$ne]=x into { department: { $ne: 'x' } }.
      const qs = require('node:querystring');
      const parse = app().get('query parser fn');
      const parsed = parse('department[$ne]=x&outcome[$gt]=&a=1');
      assert.ok(Object.values(parsed).every((v) => typeof v === 'string'), JSON.stringify(parsed));
      assert.deepEqual(parsed, qs.parse('department[$ne]=x&outcome[$gt]=&a=1'));

      // ...so the bracketed key is just an unknown parameter and is ignored.
      const res = await request(app()).get('/api/classes?department[$ne]=x').set('Authorization', `Bearer ${admin}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1);
    });

    it('sends baseline security headers', async () => {
      const res = await request(app()).get('/health');
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'DENY');
      assert.equal(res.headers['x-powered-by'], undefined);
    });
  });

  describe('attendance overview', () => {
    it('lists classes with no attendance and does not count unmarked students as at risk', async () => {
      const { Class } = require('../models');
      await Class.create({
        name: 'Unmarked Class',
        code: 'CS-999',
        department: 'Computer Science',
        semester: 'Fall 2026',
        schedule: { day: 'Tuesday', startTime: '09:00', endTime: '10:00' },
      });

      const res = await request(app()).get('/api/attendance/overview').set('Authorization', `Bearer ${admin}`);

      assert.equal(res.status, 200);
      const codes = res.body.data.byClass.map((c) => c.code);
      assert.deepEqual(codes, ['CS-101', 'CS-999']);
      assert.equal(res.body.data.byClass[1].marked, 0);

      assert.equal(res.body.data.bands.red, 0);
      assert.equal(res.body.data.bands.noData, 2);
    });

    it('still counts a student who was marked absent as at risk', async () => {
      await request(app())
        .post('/api/attendance/mark')
        .set('Authorization', `Bearer ${admin}`)
        .send({ classId: String(fixture.classDoc._id), date: '2026-01-05', records: [{ studentId: String(fixture.students[0]._id), status: 'absent' }] });

      const res = await request(app()).get('/api/attendance/overview').set('Authorization', `Bearer ${admin}`);

      assert.equal(res.body.data.bands.red, 1);
      assert.equal(res.body.data.bands.noData, 1);
    });
  });
});
