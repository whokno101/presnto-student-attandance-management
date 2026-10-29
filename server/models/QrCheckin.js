const mongoose = require('mongoose');

/**
 * A QR check-in window for one class session (PB-20). The secret never leaves
 * the server: tokens shown on screen are HMACs of (session, 15-second window),
 * so a code expires on its own and cannot be forged.
 */
const qrCheckinSchema = new mongoose.Schema(
  {
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    date: { type: Date, required: true },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    secret: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

qrCheckinSchema.index({ class: 1, date: 1, active: 1 });

module.exports = mongoose.model('QrCheckin', qrCheckinSchema);
