const mongoose = require('mongoose');

const facultySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A faculty profile must be linked to a user'],
      unique: true, // one profile per user
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
      maxlength: [80, 'Department cannot exceed 80 characters'],
    },
    employeeId: {
      type: String,
      required: [true, 'Employee ID is required'],
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9-]{3,20}$/, 'Employee ID may contain letters, numbers and dashes only'],
    },
    classesAssigned: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
      },
    ],
  },
  { timestamps: true }
);

facultySchema.index({ department: 1 });
// Speeds up "all faculty of a class" lookups from the class side.
facultySchema.index({ classesAssigned: 1 });

module.exports = mongoose.model('Faculty', facultySchema);
