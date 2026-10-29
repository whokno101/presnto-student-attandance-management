const mongoose = require('mongoose');

const OUTCOMES = ['success', 'failure', 'denied'];

/**
 * Append-only activity/audit trail (PB-13, PB-14).
 *
 * Entries are written server-side by the services that perform the action.
 * Every update/delete path through Mongoose throws, so ordinary application
 * code (and therefore the API) can never alter or remove an entry. Passwords,
 * tokens and uploaded file contents are never stored here.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      name: { type: String, default: 'System' },
      role: { type: String, default: 'system' },
    },
    // Dotted verb, e.g. attendance.status_changed, class.archived, import.committed
    action: { type: String, required: true, trim: true },
    outcome: { type: String, enum: OUTCOMES, default: 'success' },
    entityType: { type: String, default: null },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Denormalised for filtering without joins.
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
    classCode: { type: String, default: null },
    department: { type: String, default: null },
    summary: { type: String, required: true, maxlength: 500 },
    changes: [
      {
        _id: false,
        field: String,
        from: mongoose.Schema.Types.Mixed,
        to: mongoose.Schema.Types.Mixed,
      },
    ],
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ 'actor.id': 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ class: 1, createdAt: -1 });
auditLogSchema.index({ department: 1, createdAt: -1 });

const immutable = function immutable(next) {
  next(new Error('Audit log entries are append-only and cannot be modified or deleted'));
};

[
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
].forEach((hook) => auditLogSchema.pre(hook, { document: false, query: true }, immutable));

auditLogSchema.pre('save', function blockEdits(next) {
  if (!this.isNew) return immutable(next);
  return next();
});
auditLogSchema.pre('deleteOne', { document: true, query: false }, immutable);

module.exports = mongoose.model('AuditLog', auditLogSchema);
module.exports.OUTCOMES = OUTCOMES;
