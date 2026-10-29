const { z } = require('zod');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* ------------------------------------------------------------------ *
 * Shared primitives — messages are written for direct display in the UI.
 * ------------------------------------------------------------------ */

const name = z
  .string({ error: 'Full name is required' })
  .trim()
  .min(2, 'Full name must be at least 2 characters')
  .max(80, 'Full name cannot exceed 80 characters');

const email = z
  .string({ error: 'Email is required' })
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .max(120, 'Email cannot exceed 120 characters');

const password = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password cannot exceed 72 characters');

const department = z
  .string({ error: 'Department is required' })
  .trim()
  .min(2, 'Department is required')
  .max(80, 'Department cannot exceed 80 characters');

const studentId = z
  .string({ error: 'Student ID is required' })
  .trim()
  .regex(/^[A-Za-z0-9-]{3,20}$/, 'Student ID must be 3-20 letters, numbers or dashes');

const employeeId = z
  .string({ error: 'Employee ID is required' })
  .trim()
  .regex(/^[A-Za-z0-9-]{3,20}$/, 'Employee ID must be 3-20 letters, numbers or dashes');

const isActive = z.boolean({ error: 'Status must be true or false' });

const timeString = z
  .string({ error: 'Time is required' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm format');

const nonEmptyUpdate = (shape) =>
  z
    .object(shape)
    .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update' });

/* ------------------------------------------------------------------ *
 * Students
 * ------------------------------------------------------------------ */

const studentCreateSchema = z.object({
  name,
  email,
  password,
  studentId,
  department,
});

const studentUpdateSchema = nonEmptyUpdate({
  name: name.optional(),
  email: email.optional(),
  password: password.optional(),
  studentId: studentId.optional(),
  department: department.optional(),
  isActive: isActive.optional(),
});

/* ------------------------------------------------------------------ *
 * Faculty
 * ------------------------------------------------------------------ */

const facultyCreateSchema = z.object({
  name,
  email,
  password,
  employeeId,
  department,
});

const facultyUpdateSchema = nonEmptyUpdate({
  name: name.optional(),
  email: email.optional(),
  password: password.optional(),
  employeeId: employeeId.optional(),
  department: department.optional(),
  isActive: isActive.optional(),
});

/* ------------------------------------------------------------------ *
 * Classes
 * ------------------------------------------------------------------ */

const classBaseSchema = z.object({
  name: z
    .string({ error: 'Class name is required' })
    .trim()
    .min(3, 'Class name must be at least 3 characters')
    .max(120, 'Class name cannot exceed 120 characters'),
  code: z
    .string({ error: 'Class code is required' })
    .trim()
    .regex(/^[A-Za-z0-9-]{3,15}$/, 'Class code must be 3-15 letters, numbers or dashes'),
  department,
  semester: z
    .string({ error: 'Semester is required' })
    .trim()
    .min(1, 'Semester is required')
    .max(20, 'Semester cannot exceed 20 characters'),
  day: z.enum(DAYS, {
    error: (issue) => (issue.input === undefined ? 'Day is required' : 'Select a valid day'),
  }),
  startTime: timeString,
  endTime: timeString,
  facultyId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid faculty identifier')
    .optional()
    .nullable(),
  room: z.string().trim().max(30, 'Room cannot exceed 30 characters').optional(),
});

const withTimeOrder = (schema) =>
  schema.refine((value) => !value.startTime || !value.endTime || value.endTime > value.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

const classCreateSchema = withTimeOrder(classBaseSchema);

const classUpdateSchema = withTimeOrder(
  nonEmptyUpdate({
    name: classBaseSchema.shape.name.optional(),
    code: classBaseSchema.shape.code.optional(),
    department: department.optional(),
    semester: classBaseSchema.shape.semester.optional(),
    day: classBaseSchema.shape.day.optional(),
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    facultyId: classBaseSchema.shape.facultyId,
    room: classBaseSchema.shape.room,
  })
);

/* ------------------------------------------------------------------ *
 * Enrollment / assignment
 * ------------------------------------------------------------------ */

const objectId = z
  .string({ error: 'Select a valid record' })
  .regex(/^[0-9a-fA-F]{24}$/, 'Select a valid record');

/** `studentId` is optional for students (their own record is used) and
 *  required for admins enrolling someone else — enforced in the route. */
const enrollmentSchema = z.object({
  studentId: objectId.optional(),
});

const assignFacultySchema = z.object({
  facultyId: objectId.nullable(),
});

/* ------------------------------------------------------------------ *
 * Attendance
 * ------------------------------------------------------------------ */

/**
 * `YYYY-MM-DD` only — the model normalises it to UTC midnight. The refine
 * rejects dates that do not exist (2026-02-31), which `new Date()` would
 * otherwise silently roll over into the next month.
 */
const dateOnly = z
  .string({ error: 'Date is required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Enter a date that exists on the calendar');

const attendanceMarkSchema = z.object({
  classId: objectId,
  date: dateOnly,
  records: z
    .array(
      z.object({
        studentId: objectId,
        status: z.enum(['present', 'absent', 'late'], {
          message: 'Status must be present, absent or late',
        }),
      })
    )
    .min(1, 'Select at least one student')
    .max(300, 'Mark at most 300 students at once'),
});

module.exports = {
  DAYS,
  studentCreateSchema,
  studentUpdateSchema,
  facultyCreateSchema,
  facultyUpdateSchema,
  classCreateSchema,
  classUpdateSchema,
  enrollmentSchema,
  assignFacultySchema,
  attendanceMarkSchema,
};
