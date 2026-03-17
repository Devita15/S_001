// models/AttendanceRaw.js - COMPLETE FIX
const mongoose = require('mongoose');

const attendanceRawSchema = new mongoose.Schema({
  EmployeeID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  PunchTime: {
    type: Date,
    required: true
  },
  PunchDate: {
    type: Date,
    required: true
  },
  PunchType: {
    type: String,
    enum: ['IN', 'OUT', 'UNKNOWN'],
    default: 'UNKNOWN'
  },
  DeviceID: {
    type: String,
    required: true,
    trim: true
  },
  DeviceType: {
    type: String,
    required: true,
    enum: ['biometric', 'rfid', 'mobile', 'manual', 'web'],
    default: 'biometric'
  },
  Location: {
    type: String,
    trim: true
  },
  IPAddress: {
    type: String,
    trim: true
  },
  Status: {
    type: String,
    enum: ['valid', 'duplicate', 'invalid', 'processed'],
    default: 'valid'
  },
  Remarks: {
    type: String,
    trim: true,
    maxlength: 200
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

// FIXED: Pre-save middleware - MUST use function() not arrow function
attendanceRawSchema.pre('save', function(next) {
  console.log('Pre-save middleware running for AttendanceRaw');
  console.log('PunchTime:', this.PunchTime);
  console.log('EmployeeID:', this.EmployeeID);
  
  // Set UpdatedAt
  this.UpdatedAt = Date.now();
  
  // ALWAYS set PunchDate from PunchTime
  if (this.PunchTime) {
    const punchDate = new Date(this.PunchTime);
    punchDate.setHours(0, 0, 0, 0); // Set to midnight
    this.PunchDate = punchDate;
    console.log('Set PunchDate to:', this.PunchDate);
  } else {
    // Fallback to current date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.PunchDate = today;
    console.log('Fallback PunchDate to:', this.PunchDate);
  }
  
  next();
});

// Compound indexes
attendanceRawSchema.index({ EmployeeID: 1, PunchDate: 1 });
attendanceRawSchema.index({ PunchDate: 1, Status: 1 });
attendanceRawSchema.index({ DeviceID: 1, PunchTime: 1 });

module.exports = mongoose.model('AttendanceRaw', attendanceRawSchema);