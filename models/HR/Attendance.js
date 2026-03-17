const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  EmployeeID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  Date: {
    type: Date,
    required: true,
    default: Date.now
  },
  Status: {
    type: String,
    required: true,
    enum: ['Present', 'Absent', 'Leave', 'HalfDay', 'WorkFromHome'],
    default: 'Absent'
  },
  CheckInTime: {
    type: Date
  },
  CheckOutTime: {
    type: Date
  },
  Remarks: {
    type: String,
    trim: true,
    maxlength: 500
  },
  CreatedAt: {
    type: Date,
    default: Date.now
  },
  UpdatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' }
});

// Pre-save middleware to update UpdatedAt
attendanceSchema.pre('save', function(next) {
  this.UpdatedAt = Date.now();
  next();
});

// Compound index to ensure one attendance record per employee per day
attendanceSchema.index({ EmployeeID: 1, Date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);