const mongoose = require('mongoose');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One scheduled occurrence of a class (PB-22): a room and an instructor booked
 * for a time slot on a calendar day. Overlaps are prevented by the schedule
 * service (PB-23), which re-checks under a lock at save time.
 *
 * `date` is UTC midnight of the institution calendar day (same convention as
 * Attendance.date); times are wall-clock HH:mm in the institution's zone.
 */
const classSessionSchema = new mongoose.Schema(
  {
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty', default: null },
    room: { type: String, required: [true, 'Room is required'], trim: true, uppercase: true, maxlength: 30 },
    date: { type: Date, required: true },
    startTime: { type: String, required: true, match: TIME_RE },
    endTime: { type: String, required: true, match: TIME_RE },
    startMinutes: { type: Number, required: true, min: 0, max: 1439 },
    endMinutes: { type: Number, required: true, min: 1, max: 1440 },
    status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled' },
    cancelledReason: { type: String, default: null },
    batchId: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

classSessionSchema.index({ date: 1, room: 1, status: 1 });
classSessionSchema.index({ date: 1, faculty: 1, status: 1 });
classSessionSchema.index({ class: 1, date: 1 });

module.exports = mongoose.model('ClassSession', classSessionSchema);
