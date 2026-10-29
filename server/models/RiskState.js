const mongoose = require('mongoose');

/**
 * Last evaluated risk condition per student per class (PB-16). Comparing a new
 * evaluation with this record is what makes alerts fire on a threshold
 * *crossing* rather than on every save or page load.
 */
const riskStateSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    atRisk: { type: Boolean, default: false },
    reasons: [{ type: String, enum: ['absences', 'rate'] }],
    absent: { type: Number, default: 0 },
    excused: { type: Number, default: 0 },
    eligible: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    // When the current at-risk episode started / was last notified.
    since: { type: Date, default: null },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

riskStateSchema.index({ student: 1, class: 1 }, { unique: true });
riskStateSchema.index({ class: 1, atRisk: 1 });

module.exports = mongoose.model('RiskState', riskStateSchema);
