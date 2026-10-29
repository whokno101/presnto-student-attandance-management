const mongoose = require('mongoose');

const TYPES = ['risk', 'excuse_submitted', 'excuse_decided', 'system'];

/**
 * In-app notification (PB-16 risk alerts, PB-19 excuse workflow). Kept as
 * history: reading one sets `readAt`, nothing is deleted.
 */
const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    // What to do about it (PB-16 "recommended next step").
    nextStep: { type: String, default: null, maxlength: 300 },
    link: { type: String, default: null },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    reasons: [{ type: String }],
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.TYPES = TYPES;
