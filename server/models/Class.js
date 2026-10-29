const mongoose = require('mongoose');

// Required eagerly so the sync hooks below never hit "schema hasn't been registered".
require('./Faculty');
require('./Student');
require('./Attendance');

const Faculty = () => mongoose.model('Faculty');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const scheduleSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      required: [true, 'Schedule day is required'],
      enum: {
        values: DAYS,
        message: `Day must be one of: ${DAYS.join(', ')}`,
      },
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      // 24h HH:mm
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must use 24-hour HH:mm format'],
    },
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must use 24-hour HH:mm format'],
    },
  },
  { _id: false }
);

const classSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Class name is required'],
      trim: true,
      maxlength: [120, 'Class name cannot exceed 120 characters'],
    },
    code: {
      type: String,
      required: [true, 'Class code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9-]{3,15}$/, 'Class code may contain letters, numbers and dashes only'],
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    semester: {
      type: String,
      required: [true, 'Semester is required'],
      trim: true,
      match: [/^[A-Za-z0-9 -]{1,20}$/, 'Semester must be 1-20 characters'],
    },
    // Weekly meetings: one entry per day, each with its own start and end.
    schedule: {
      type: [scheduleSchema],
      validate: [
        { validator: (v) => Array.isArray(v) && v.length > 0, message: 'Schedule needs at least one day' },
        { validator: (v) => new Set(v.map((m) => m.day)).size === v.length, message: 'Each day can only be scheduled once' },
      ],
    },
    // Optional: a class can be created before it is staffed, and the admin UI
    // renders such classes with an "Unassigned" badge until assign-faculty runs.
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Faculty',
      default: null,
    },
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
      },
    ],
    // Default room used when scheduling sessions (PB-22); optional.
    room: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [30, 'Room cannot exceed 30 characters'],
      default: '',
    },
    // Soft deletion (PB-14): archived classes leave every active list but keep
    // their roster and attendance history. There is no hard-delete path.
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    capacity: {
      type: Number,
      default: 40,
      min: [1, 'Capacity must be at least 1'],
      max: [500, 'Capacity cannot exceed 500'],
    },
  },
  { timestamps: true }
);

classSchema.index({ department: 1, semester: 1 });
classSchema.index({ faculty: 1 });
classSchema.index({ students: 1 });
classSchema.index({ archivedAt: 1 });

/**
 * Cross-reference hook: keeps Faculty.classesAssigned and Student.enrolledClasses
 * in sync whenever a roster or faculty assignment changes.
 */
const syncReference = async (doc, ProfileModel, profileField, removed = false) => {
  const profileId = doc.faculty;
  if (!profileId) return;
  if (removed) {
    await ProfileModel.findByIdAndUpdate(profileId, { $pull: { [profileField]: doc._id } });
  } else {
    await ProfileModel.findByIdAndUpdate(profileId, { $addToSet: { [profileField]: doc._id } });
  }
};

classSchema.pre('save', async function (next) {
  try {
    if (this.isNew || this.isModified('faculty')) {
      await syncReference(this, Faculty(), 'classesAssigned');
    }
    next();
  } catch (err) {
    next(err);
  }
});

/**
 * Weekly meetings of a class, in day order. Also accepts the legacy single
 * `{ day, startTime, endTime }` object still found on lean reads of old rows.
 */
const meetingsOf = (schedule) => {
  const list = Array.isArray(schedule) ? schedule : schedule?.day ? [schedule] : [];
  return [...list].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
};

/** The meeting held on a weekday name, or null. */
const meetingOn = (schedule, day) => meetingsOf(schedule).find((m) => m.day === day) ?? null;

/** "Monday 09:00-10:30, Wednesday 13:00-14:30" (audit summaries). */
const describeSchedule = (schedule) => meetingsOf(schedule).map((m) => `${m.day} ${m.startTime}-${m.endTime}`).join(', ');

module.exports = mongoose.model('Class', classSchema);
module.exports.DAYS = DAYS;
module.exports.meetingsOf = meetingsOf;
module.exports.meetingOn = meetingOn;
module.exports.describeSchedule = describeSchedule;
