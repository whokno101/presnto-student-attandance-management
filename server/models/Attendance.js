const mongoose = require('mongoose');

const STATUSES = ['present', 'late', 'absent', 'excused'];

/**
 * Dates are normalized to UTC midnight before saving so that the composite
 * (class, student, date) unique index behaves predictably regardless of the
 * local timezone of the machine that marked the record.
 */
const startOfUtcDay = (date) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const attendanceSchema = new mongoose.Schema(
  {
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Attendance must reference a class'],
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Attendance must reference a student'],
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    status: {
      type: String,
      required: [true, 'Status is required'],
      enum: {
        values: STATUSES,
        message: `Status must be one of: ${STATUSES.join(', ')}`,
      },
      default: 'absent',
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Attendance must record who marked it'],
    },
    // Which path recorded the current outcome (PB-17 import, PB-19 excuse, PB-20 QR).
    source: {
      type: String,
      enum: ['manual', 'import', 'qr', 'excuse'],
      default: 'manual',
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [200, 'Remarks cannot exceed 200 characters'],
    },
  },
  { timestamps: true }
);

// One entry per student per class per day (re-marking updates via upsert).
attendanceSchema.index({ class: 1, student: 1, date: 1 }, { unique: true });
// Fast aggregate lookups: "attendance % of a student", "roster for a day".
attendanceSchema.index({ student: 1, date: 1 });
attendanceSchema.index({ class: 1, date: 1 });
attendanceSchema.index({ markedBy: 1 });

attendanceSchema.pre('save', function (next) {
  if (this.isModified('date')) {
    this.date = startOfUtcDay(this.date);
  }
  next();
});

attendanceSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() || {};
  if (update.date || (update.$set && update.$set.date)) {
    const raw = update.date || update.$set.date;
    const normalized = startOfUtcDay(raw);
    if (update.date) update.date = normalized;
    if (update.$set && update.$set.date) update.$set.date = normalized;
  }
  next();
});

attendanceSchema.statics.normalizeDate = startOfUtcDay;

module.exports = mongoose.model('Attendance', attendanceSchema);
module.exports.STATUSES = STATUSES;
