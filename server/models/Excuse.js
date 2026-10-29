const mongoose = require('mongoose');

const CATEGORIES = ['illness', 'family', 'university_activity', 'transport', 'other'];
const STATUSES = ['pending', 'approved', 'rejected'];

/**
 * A student's explanation for one absence (PB-19). Submitting one never
 * changes attendance; only an approval by the class teacher (or an admin)
 * turns the record into Excused.
 *
 * The supporting document is stored with the excuse and served only to the
 * student, the class teacher and administrators.
 */
const excuseSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    date: { type: Date, required: true },
    attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', required: true },
    category: { type: String, enum: CATEGORIES, required: true },
    explanation: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
    document: {
      filename: { type: String, maxlength: 200 },
      mimetype: { type: String },
      size: { type: Number },
      data: { type: Buffer, select: false },
    },
    status: { type: String, enum: STATUSES, default: 'pending' },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    decisionNote: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true }
);

// One open (pending or approved) excuse per student per session; a student may
// resubmit after a rejection.
excuseSchema.index(
  { student: 1, class: 1, date: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'approved'] } } }
);
excuseSchema.index({ class: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Excuse', excuseSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.STATUSES = STATUSES;
