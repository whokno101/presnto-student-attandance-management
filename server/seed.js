/**
 * Seeds a realistic dataset for local development and demos.
 *
 *  - 1 admin, 10 faculty, 100 students — every account shares one bcrypt hash
 *  - 10 Fall 2026 classes; each faculty member owns exactly one
 *  - every student is enrolled in exactly 3 classes (30 per class)
 *  - 12 weeks of attendance for every enrolled student, including today when
 *    today is one of the class's teaching days
 *  - every student gets a personal attendance tendency so the rate spread looks
 *    natural (~60% green, ~25% amber, ~15% red)
 *
 * Usage:  node seed.js            (wipe + seed)
 *         node seed.js --no-reset (seed without dropping collections)
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { disconnectDB } = require('./config/db');
const { todayInInstitution, zonedTime, ymd } = require('./utils/dates');
const { User, Faculty, Student, Class, Attendance } = require('./models');

const SALT_ROUNDS = 12;
const DEFAULT_PASSWORD = 'Password@123';
const RESET = !process.argv.includes('--no-reset');

const ADMIN_EMAIL = 'admin@university.edu';
const FACULTY_COUNT = 10;
const STUDENT_COUNT = 100;
const SEMESTER = 'Fall 2026';
const TEACHING_DEPARTMENTS = ['Computer Science', 'Software Engineering', 'Information Security'];
const TEACHING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
/** How many past weekly occurrences to generate per class (never future ones). */
const WEEKS_HISTORY = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

const ADMIN = { name: 'Alice Admin', email: ADMIN_EMAIL, role: 'admin' };

/** This class's session one week ago is left unsubmitted (Activity Log demo). */
const MISSING_SUBMISSION_CLASS = 'CS-305';

const FACULTY_NAMES = [
  { first: 'Elena', last: 'Marchetti' },
  { first: 'Samuel', last: 'Okonkwo' },
  { first: 'Priya', last: 'Raghunathan' },
  { first: 'Henrik', last: 'Lindqvist' },
  { first: 'Noor', last: 'El-Amin' },
  { first: 'Tomas', last: 'Herrera' },
  { first: 'Aiko', last: 'Tanaka' },
  { first: 'Grace', last: 'Mwangi' },
  { first: 'Dmitri', last: 'Volkov' },
  { first: 'Fatima', last: 'Nasser' },
];

const FIRST_NAMES = [
  'Aisha', 'Bruno', 'Chloe', 'Diego', 'Elena', 'Farid', 'Gloria', 'Hugo',
  'Isla', 'Jonas', 'Keiko', 'Liam', 'Maya', 'Nathan', 'Omar', 'Pooja',
  'Quinn', 'Rafael', 'Sofia', 'Theo', 'Uma', 'Viktor', 'Wren', 'Yusuf', 'Zara',
];

const LAST_NAMES = [
  'Abbott', 'Bianchi', 'Castellanos', 'Duarte', 'Eze', 'Fontaine', 'Gallagher',
  'Haddad', 'Ivanov', 'Jensen', 'Karimi', 'Lindberg', 'Moreau', 'Nakamura',
  'Osei', 'Petrova', 'Quinlan', 'Rossi', 'Sandoval', 'Thorne', 'Ueda',
  'Villalobos', 'Wozniak', 'Yamamoto', 'Zielinski',
];

/** 10 courses with stable, unique codes across the three departments. */
const CLASS_TEMPLATES = [
  { code: 'CS-201', name: 'Data Structures & Algorithms', department: 'Computer Science' },
  { code: 'CS-305', name: 'Database Systems', department: 'Computer Science' },
  { code: 'CS-360', name: 'Operating Systems', department: 'Computer Science' },
  { code: 'CS-410', name: 'Distributed Systems', department: 'Computer Science' },
  { code: 'SE-210', name: 'Software Design Principles', department: 'Software Engineering' },
  { code: 'SE-310', name: 'Software Project Management', department: 'Software Engineering' },
  { code: 'SE-330', name: 'Software Testing & Quality Assurance', department: 'Software Engineering' },
  { code: 'IS-250', name: 'Information Security Fundamentals', department: 'Information Security' },
  { code: 'IS-320', name: 'Network Security', department: 'Information Security' },
  { code: 'IS-410', name: 'Applied Cryptography', department: 'Information Security' },
];

/** Monday–Friday, two slots per day, end always after start. */
const SCHEDULE_SLOTS = [
  { day: 'Monday', startTime: '08:30', endTime: '10:00' },
  { day: 'Monday', startTime: '13:00', endTime: '14:30' },
  { day: 'Tuesday', startTime: '09:30', endTime: '11:00' },
  { day: 'Tuesday', startTime: '15:00', endTime: '16:30' },
  { day: 'Wednesday', startTime: '08:00', endTime: '09:30' },
  { day: 'Wednesday', startTime: '11:30', endTime: '13:00' },
  { day: 'Thursday', startTime: '10:00', endTime: '11:30' },
  { day: 'Thursday', startTime: '14:00', endTime: '15:30' },
  { day: 'Friday', startTime: '09:00', endTime: '10:30' },
  { day: 'Friday', startTime: '16:00', endTime: '17:30' },
];

/**
 * Share of students per tendency band: mostly present / borderline / at risk.
 * The exact counts (60 / 25 / 15) are derived from this table.
 */
const TENDENCY_BANDS = [
  { band: 'high', share: 0.6, range: [0.915, 0.975] }, // all >= 90%
  { band: 'mid', share: 0.25, range: [0.76, 0.885] }, // 75-89%
  { band: 'low', share: 0.15, range: [0.62, 0.72] }, // < 75%
];

const utcDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// Deterministic pseudo-random so every reseed produces identical data.
const makeRng = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

/** Fisher-Yates with an injected rng — deterministic across runs. */
const shuffle = (items, rng) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** `today` as a weekday name, e.g. 'Monday' — resolved at seed time. */
const todayWeekday = () => {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[todayInInstitution().getUTCDay()];
};

/**
 * Teaching days stay inside Monday–Friday. The round-robin base already gives
 * every weekday two slots; this guard re-points the busiest day if a future edit
 * to SCHEDULE_SLOTS ever leaves today short, so the dashboard's "Today's
 * Attendance" tile always has data to show.
 */
const ensureTodayHasClasses = (slots, weekday, minimum = 2) => {
  if (!TEACHING_DAYS.includes(weekday)) return slots;

  const days = slots.map((slot) => slot.day);
  let deficit = minimum - days.filter((day) => day === weekday).length;

  while (deficit > 0) {
    const others = TEACHING_DAYS.filter((day) => day !== weekday);
    const busiest = others.reduce(
      (best, day) => (days.filter((d) => d === day).length > days.filter((d) => d === best).length ? day : best)
    );
    days[days.indexOf(busiest)] = weekday;
    deficit -= 1;
  }

  return slots.map((slot, index) => ({ ...slot, day: days[index] }));
};

/**
 * The last `WEEKS_HISTORY` occurrences of `day`, newest first.
 * Today is included when it *is* the teaching day; nothing is ever in the future.
 */
const classDates = (day) => {
  const target = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(day);
  const today = todayInInstitution();
  const backToDay = (today.getUTCDay() - target + 7) % 7;
  const mostRecent = today.getTime() - backToDay * DAY_MS;

  return Array.from({ length: WEEKS_HISTORY }, (_, week) => utcDay(new Date(mostRecent - week * 7 * DAY_MS)));
};

/** Builds `count` unique "First Last" names without repeating a combination. */
const buildStudentNames = (rng, count) => {
  const pairs = [];
  FIRST_NAMES.forEach((first) => {
    LAST_NAMES.forEach((last) => pairs.push(`${first} ${last}`));
  });

  return shuffle(pairs, rng).slice(0, count);
};

/** One band label per student, shuffled so the roster is not sorted by rate. */
const buildTendencies = (rng, count) => {
  const bands = TENDENCY_BANDS.flatMap(({ band, share }) =>
    Array.from({ length: Math.round(share * count) }, () => band)
  );

  return shuffle(bands, rng);
};

const rateOf = (attended, marked) => (marked ? Math.round((attended / marked) * 1000) / 10 : 0);

const pad = (value, width) => String(value).padEnd(width);
const leftPad = (value, width) => String(value).padStart(width);

const seedDatabase = async () => {
  await connectDB();

  if (RESET) {
    console.log('Clearing existing data...');
    await Promise.all(
      [
        'users', 'faculties', 'students', 'classes', 'attendances', 'auditlogs', 'classsessions',
        'notifications', 'riskstates', 'excuses', 'qrcheckins', 'schedulelocks',
      ].map((c) =>
        mongoose.connection.collection(c).deleteMany({})
      )
    );
    // Unique idempotent indexes survive deleteMany, no need to drop them here.
  }

  console.log('Hashing passwords (bcrypt)...');
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

  const rng = makeRng(20261026);

  /* ---------------------------------------------------------------- *
   * 1. Users + profiles
   * ---------------------------------------------------------------- */
  console.log('Creating users...');
  const facultyNames = FACULTY_NAMES.slice(0, FACULTY_COUNT);
  const studentNames = buildStudentNames(rng, STUDENT_COUNT);

  const userDocs = await User.insertMany([
    ADMIN,
    ...facultyNames.map((f, i) => ({
      name: `${f.first} ${f.last}`,
      email: `faculty${i + 1}@university.edu`,
      role: 'faculty',
    })),
    ...studentNames.map((name, i) => ({
      name,
      email: `student${i + 1}@university.edu`,
      role: 'student',
    })),
  ].map((u) => ({ ...u, passwordHash })));

  const userByEmail = new Map(userDocs.map((u) => [u.email, u]));

  console.log('Creating faculty profiles...');
  const facultyDocs = await Faculty.insertMany(
    facultyNames.map((f, i) => ({
      user: userByEmail.get(`faculty${i + 1}@university.edu`)._id,
      department: TEACHING_DEPARTMENTS[i % TEACHING_DEPARTMENTS.length],
      employeeId: `EMP-${1001 + i}`,
      classesAssigned: [],
    }))
  );

  console.log('Creating student profiles...');
  const studentDocs = await Student.insertMany(
    studentNames.map((name, i) => ({
      user: userByEmail.get(`student${i + 1}@university.edu`)._id,
      department: TEACHING_DEPARTMENTS[i % TEACHING_DEPARTMENTS.length],
      studentId: `STU-${2001 + i}`,
      enrolledClasses: [],
    }))
  );

  const studentByIndex = new Map(studentDocs.map((doc, index) => [index, doc]));
  const studentIndexById = new Map(studentDocs.map((doc, index) => [String(doc._id), index]));

  /* ---------------------------------------------------------------- *
   * 2. Classes — one owner each, teaching days balanced across the week
   * ---------------------------------------------------------------- */
  const weekday = todayWeekday();
  const slots = ensureTodayHasClasses(SCHEDULE_SLOTS, weekday);
  console.log(`Creating classes (today is ${weekday})...`);

  const createdClasses = [];
  for (let i = 0; i < CLASS_TEMPLATES.length; i += 1) {
    const template = CLASS_TEMPLATES[i];
    const owner = facultyDocs[i];
    const { day, startTime, endTime } = slots[i];

    // The pre('save') hook pushes this class into Faculty.classesAssigned.
    const classDoc = await Class.create({
      name: template.name,
      code: template.code,
      department: template.department,
      semester: SEMESTER,
      schedule: { day, startTime, endTime },
      faculty: owner._id,
      students: [],
    });

    createdClasses.push(classDoc);
  }

  // The classes have been running for the whole seeded history.
  await Class.collection.updateMany(
    { _id: { $in: createdClasses.map((c) => c._id) } },
    { $set: { createdAt: new Date(todayInInstitution().getTime() - WEEKS_HISTORY * 7 * DAY_MS) } }
  );

  /* ---------------------------------------------------------------- *
   * 3. Enrollment — 3 distinct classes per student, 30 students per class
   * ---------------------------------------------------------------- */
  console.log('Enrolling students...');
  // Cyclic offsets (0, 3, 7) keep the three choices distinct while giving every
  // class exactly 3 groups of 10 students => 30 per class, capacity is 40.
  const enrollmentPlan = Array.from({ length: STUDENT_COUNT }, (_, index) => {
    const offset = index % CLASS_TEMPLATES.length;
    return [offset, (offset + 3) % CLASS_TEMPLATES.length, (offset + 7) % CLASS_TEMPLATES.length];
  });

  await Promise.all(
    createdClasses.map((classDoc, classIndex) => {
      const roster = [];
      enrollmentPlan.forEach((choices, studentIndex) => {
        if (choices.includes(classIndex)) roster.push(studentDocs[studentIndex]._id);
      });

      classDoc.students = roster;
      return classDoc.save();
    })
  );

  await Promise.all(
    createdClasses.map((classDoc) =>
      Student.updateMany({ _id: { $in: classDoc.students } }, { $addToSet: { enrolledClasses: classDoc._id } })
    )
  );

  /* ---------------------------------------------------------------- *
   * 4. Attendance — 12 weekly sessions per class, personal tendency per student
   * ---------------------------------------------------------------- */
  console.log('Generating attendance records...');

  // One list per student: 3 classes x 12 dates = 36 sessions.
  const sessionsByStudent = Array.from({ length: STUDENT_COUNT }, () => []);
  createdClasses.forEach((classDoc) => {
    // One class leaves last week's session unsubmitted so the Activity Log
    // shows a "missing" submission next to on-time and late ones.
    const dates = classDates(classDoc.schedule.day).filter(
      (date, index) => !(classDoc.code === MISSING_SUBMISSION_CLASS && index === 1)
    );
    classDoc.students.forEach((studentId) => {
      sessionsByStudent[studentIndexById.get(String(studentId))].push({ classId: classDoc._id, date: dates });
    });
  });

  const tendencies = buildTendencies(rng, STUDENT_COUNT);
  const bandRange = new Map(TENDENCY_BANDS.map((b) => [b.band, b.range]));
  const attendanceRecords = [];

  sessionsByStudent.forEach((entries, studentIndex) => {
    const sessions = entries.flatMap(({ classId, date }) => date.map((d) => ({ classId, date: d })));
    const [floor, ceiling] = bandRange.get(tendencies[studentIndex]);

    // Attended count drives the final rate, so the band the student lands in is
    // guaranteed rather than left to sampling noise.
    const targetRate = floor + rng() * (ceiling - floor);
    const attendedCount = Math.round(targetRate * sessions.length);
    const lateChance = 0.04 + rng() * 0.12;
    const missedSessions = new Set(shuffle(sessions.map((_, i) => i), rng).slice(0, sessions.length - attendedCount));

    sessions.forEach((session, index) => {
      const base = {
        class: session.classId,
        student: studentByIndex.get(studentIndex)._id,
        date: session.date,
      };

      attendanceRecords.push({
        ...base,
        status: missedSessions.has(index) ? 'absent' : rng() < lateChance ? 'late' : 'present',
      });
    });
  });

  // Every record is marked by the teacher who owns the class.
  const markedByByClass = new Map(
    createdClasses.map((classDoc) => {
      const owner = facultyDocs.find((f) => String(f._id) === String(classDoc.faculty));
      return [String(classDoc._id), owner.user];
    })
  );

  attendanceRecords.forEach((record) => {
    record.markedBy = markedByByClass.get(String(record.class)) ?? null;
  });

  // Deduplicate defensively against the unique (class, student, date) index.
  const seen = new Set();
  const uniqueRecords = attendanceRecords.filter((r) => {
    const key = `${r.class}|${r.student}|${r.date.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Submission time per class session: usually during class (on time), ~12%
  // the next day or later (late). Written raw so the timestamps are kept.
  const classById = new Map(createdClasses.map((c) => [String(c._id), c]));
  const submittedAtByKey = new Map();
  uniqueRecords.forEach((record) => {
    const key = `${record.class}|${record.date.toISOString()}`;
    if (!submittedAtByKey.has(key)) {
      const classDoc = classById.get(String(record.class));
      const end = zonedTime(record.date, classDoc.schedule.endTime);
      const offsetHours = rng() < 0.12 ? 2 + rng() * 40 : -(5 + rng() * 40) / 60;
      const at = new Date(Math.min(end.getTime() + offsetHours * 3600 * 1000, Date.now()));
      submittedAtByKey.set(key, at);
    }
    const at = submittedAtByKey.get(key);
    record.createdAt = at;
    record.updatedAt = at;
    record.source = 'manual';
  });

  await Attendance.collection.insertMany(uniqueRecords, { ordered: false });

  // Matching "attendance submitted" entries so the Activity Log has history.
  const userById = new Map(userDocs.map((u) => [String(u._id), u]));
  const auditEntries = [...submittedAtByKey.entries()].map(([key, at]) => {
    const [classId, iso] = key.split('|');
    const classDoc = classById.get(classId);
    const date = new Date(iso);
    const rows = uniqueRecords.filter((r) => String(r.class) === classId && r.date.getTime() === date.getTime());
    const count = (status) => rows.filter((r) => r.status === status).length;
    const actorUser = userById.get(String(markedByByClass.get(classId)));
    const deadline = zonedTime(date, classDoc.schedule.endTime);
    return {
      actor: { id: actorUser._id, name: actorUser.name, role: 'faculty' },
      action: 'attendance.submitted',
      outcome: 'success',
      entityType: 'Class',
      entityId: classDoc._id,
      class: classDoc._id,
      classCode: classDoc.code,
      department: classDoc.department,
      summary: `Submitted attendance for ${classDoc.code} on ${ymd(date)}: ${count('present')} present, ${count('late')} late, ${count('absent')} absent (${rows.length} changed)`,
      changes: [],
      meta: { date: ymd(date), source: 'manual', changed: rows.length, timeliness: at <= deadline ? 'on_time' : 'late', deadline },
      createdAt: at,
    };
  });
  await mongoose.connection.collection('auditlogs').insertMany(auditEntries);

  /* ---------------------------------------------------------------- *
   * 5. Summary — read back from MongoDB so the numbers reflect the database
   * ---------------------------------------------------------------- */
  const attendedExpr = { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } };

  const [overallRow, perClassRows, perStudentRows, facultyCheck] = await Promise.all([
    Attendance.aggregate([{ $group: { _id: null, marked: { $sum: 1 }, attended: attendedExpr } }]).then((r) => r[0]),
    Attendance.aggregate([
      { $group: { _id: '$class', marked: { $sum: 1 }, attended: attendedExpr } },
      { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'cls' } },
      { $unwind: { path: '$cls', preserveNullAndEmptyArrays: true } },
      { $sort: { 'cls.code': 1 } },
    ]),
    Attendance.aggregate([{ $group: { _id: '$student', marked: { $sum: 1 }, attended: attendedExpr } }]),
    Faculty.find().select('classesAssigned').lean(),
  ]);

  const enrollmentTotal = createdClasses.reduce((sum, c) => sum + c.students.length, 0);
  const overall = {
    marked: overallRow?.marked ?? 0,
    attended: overallRow?.attended ?? 0,
    rate: rateOf(overallRow?.attended ?? 0, overallRow?.marked ?? 0),
  };

  const bands = { green: 0, amber: 0, red: 0 };
  perStudentRows.forEach((row) => {
    const rate = rateOf(row.attended, row.marked);
    if (rate >= 90) bands.green += 1;
    else if (rate >= 75) bands.amber += 1;
    else bands.red += 1;
  });

  const classesToday = createdClasses.filter((c) => c.schedule.day === weekday);

  console.log('\n--- Seed complete ---');
  console.log(`Users:        ${userDocs.length} (admin 1, faculty ${facultyDocs.length}, students ${studentDocs.length})`);
  console.log(`Faculty:      ${facultyDocs.length} — ${facultyCheck.filter((f) => (f.classesAssigned || []).length === 1).length} own exactly 1 class`);
  console.log(`Students:     ${studentDocs.length}`);
  console.log(`Classes:      ${createdClasses.length} (${SEMESTER})`);
  console.log(`Enrollments:  ${enrollmentTotal} (${STUDENT_COUNT} students x 3 classes, 30 per class)`);
  console.log(`Attendance:   ${uniqueRecords.length} records (${WEEKS_HISTORY} weeks x ${perClassRows.length ? createdClasses[0].students.length : 0} students/class)`);
  console.log(`Today (${weekday}): ${classesToday.map((c) => c.code).join(', ') || 'no class scheduled'}`);

  console.log('\nOverall attendance rate');
  console.log(`  ${overall.rate}%  (${overall.attended} attended of ${overall.marked} marked)`);

  console.log('\nRate per class');
  perClassRows.forEach((row) => {
    const enrolled = row.cls?.students?.length ?? 0;
    const rate = rateOf(row.attended, row.marked);
    console.log(
      `  ${pad(row.cls?.code ?? '—', 8)} ${pad((row.cls?.name ?? '—').slice(0, 40), 42)} ${pad(enrolled, 4)} std  ${leftPad(`${rate}%`, 7)}`
    );
  });

  console.log('\nStudents by attendance band');
  console.log(`  Green (>= 90%):  ${bands.green}`);
  console.log(`  Amber (75-89%):  ${bands.amber}`);
  console.log(`  Red   (< 75%):   ${bands.red}`);

  console.log('\nLogin with any seeded email. Password: ' + DEFAULT_PASSWORD);
  console.log('  admin@university.edu     (admin)');
  console.log('  faculty1@university.edu  (faculty)');
  console.log('  student1@university.edu  (student)');

  await disconnectDB();
  process.exit(0);
};

seedDatabase().catch(async (err) => {
  console.error('Seed failed:', err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
