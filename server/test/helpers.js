/**
 * Shared test harness: an in-memory MongoDB, the Express app, and a tiny
 * fixture builder. Tests run with `npm test` (node:test + supertest).
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PASSWORD = 'Password@123';

let mongo;

const startDb = async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('attendance-test'));
};

const stopDb = async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
};

const resetDb = async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

/** Required lazily so env overrides set by a test file apply first. */
const app = () => require('../server').app;

const loginAs = async (email) => {
  const res = await request(app()).post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return res.body.token;
};

/** A class that meets every day, for suites that mark attendance on "today". */
const EVERY_DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({ day, startTime: '09:00', endTime: '10:00' }));

/** One admin, one faculty member teaching one class, and `studentCount` enrolled students. */
const seedBasic = async ({ studentCount = 2, schedule = { day: 'Monday', startTime: '09:00', endTime: '10:00' } } = {}) => {
  const { User, Faculty, Student, Class } = require('../models');
  const passwordHash = await bcrypt.hash(PASSWORD, 4);

  await User.create({ name: 'Ada Admin', email: 'admin@test.edu', passwordHash, role: 'admin' });

  const facultyUser = await User.create({ name: 'Fay Faculty', email: 'faculty@test.edu', passwordHash, role: 'faculty' });
  const faculty = await Faculty.create({ user: facultyUser._id, department: 'Computer Science', employeeId: 'EMP-1' });

  const students = [];
  for (let i = 1; i <= studentCount; i += 1) {
    const user = await User.create({ name: `Stu Dent${i}`, email: `student${i}@test.edu`, passwordHash, role: 'student' });
    students.push(await Student.create({ user: user._id, department: 'Computer Science', studentId: `STU-${i}` }));
  }

  const classDoc = await Class.create({
    name: 'Algorithms',
    code: 'CS-101',
    department: 'Computer Science',
    semester: 'Fall 2026',
    schedule,
    faculty: faculty._id,
    students: students.map((s) => s._id),
  });
  await Student.updateMany({ _id: { $in: students.map((s) => s._id) } }, { $set: { enrolledClasses: [classDoc._id] } });

  return { faculty, students, classDoc };
};

module.exports = { PASSWORD, EVERY_DAY, startDb, stopDb, resetDb, app, request, loginAs, seedBasic };
