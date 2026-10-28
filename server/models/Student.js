const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A student profile must be linked to a user'],
      unique: true,
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
      maxlength: [80, 'Department cannot exceed 80 characters'],
    },
    studentId: {
      type: String,
      required: [true, 'Student ID is required'],
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9-]{3,20}$/, 'Student ID may contain letters, numbers and dashes only'],
    },
    enrolledClasses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
      },
    ],
  },
  { timestamps: true }
);

studentSchema.index({ department: 1 });
studentSchema.index({ enrolledClasses: 1 });

module.exports = mongoose.model('Student', studentSchema);
