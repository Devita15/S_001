// models/AttendanceProcessed.js
const mongoose = require('mongoose');

const attendanceProcessedSchema = new mongoose.Schema({
  EmployeeID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  Date: {
    type: Date,
    required: true
  },
  ShiftID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shift'
  },
  ScheduledIn: {
    type: String // HH:mm
  },
  ScheduledOut: {
    type: String // HH:mm
  },
  ActualIn: {
    type: Date
  },
  ActualOut: {
    type: Date
  },
  WorkHours: {
    type: Number, // in hours
    default: 0,
    min: 0
  },
  BreakHours: {
    type: Number,
    default: 0,
    min: 0
  },
  NetWorkHours: {
    type: Number, // WorkHours - BreakHours
    default: 0
  },
  LateMinutes: {
    type: Number,
    default: 0,
    min: 0
  },
  EarlyExitMinutes: {
    type: Number,
    default: 0,
    min: 0
  },
  OvertimeHours: {
    type: Number,
    default: 0,
    min: 0
  },
  OvertimeType: {
    type: String,
    enum: ['regular', 'holiday', 'night', 'none'],
    default: 'none'
  },
  Status: {
    type: String,
    enum: ['Present', 'Absent', 'Half-Day', 'Leave', 'Holiday', 'Weekly-Off', 'On-Duty'],
    default: 'Absent'
  },
  AttendanceStatus: {
    type: String,
    enum: ['On-Time', 'Late', 'Early-Exit', 'Late+EarlyExit', 'Perfect'],
    default: 'On-Time'
  },
  LeaveID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Leave'
  },
  HolidayID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Holiday'
  },
  RegularizationStatus: {
    type: String,
    enum: ['None', 'Pending', 'Approved', 'Rejected'],
    default: 'None'
  },
  RegularizationID: {
    type: mongoose.Schema.Types.ObjectId
  },
  Remarks: {
    type: String,
    trim: true,
    maxlength: 500
  },
  IsLocked: {
    type: Boolean,
    default: false // Locked for payroll processing
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

// Compound indexes
attendanceProcessedSchema.index({ EmployeeID: 1, Date: 1 }, { unique: true });
attendanceProcessedSchema.index({ Date: 1, Status: 1 });
attendanceProcessedSchema.index({ EmployeeID: 1, Month: 1, Year: 1 });

attendanceProcessedSchema.pre('save', function(next) {
  this.UpdatedAt = Date.now();
  next();
});

module.exports = mongoose.model('AttendanceProcessed', attendanceProcessedSchema);