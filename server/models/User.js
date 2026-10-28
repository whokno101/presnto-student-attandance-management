const mongoose = require('mongoose');

const ROLES = ['admin', 'faculty', 'student'];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // never returned unless explicitly requested
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: ROLES,
        message: `Role must be one of: ${ROLES.join(', ')}`,
      },
      default: 'student',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Composite index supporting role-filtered listing used by admin screens.
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ name: 'text' });

// Never leak the password hash through JSON serialization/API responses.
userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

// Virtual flag used by auth middleware to short-circuit disabled accounts.
userSchema.virtual('isDisabled').get(function () {
  return !this.isActive;
});

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
