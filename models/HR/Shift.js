// models/Shift.js
const mongoose = require('mongoose');

const SHIFT_NAMES = {
  MORNING: 'Morning Shift',
  NIGHT: 'Night Shift',
  DAY: 'Day Shift',
  GENERAL: 'General Shift'
};

const SHIFT_CODES = {
  MORNING: 'MORN',
  NIGHT: 'NIGHT',
  DAY: 'DAY',
  GENERAL: 'GEN'
};

const shiftSchema = new mongoose.Schema({
   ShiftName: {
    type: String,
    required: [true, 'Shift name is required'],
    enum: {
      values: Object.values(SHIFT_NAMES),
      message: 'Shift name must be one of: Morning Shift, Night Shift, Day Shift, General Shift'
    },
    trim: true,
    maxlength: 50
  },
  Code: {
    type: String,
    required: [true, 'Shift code is required'],
    enum: {
      values: Object.values(SHIFT_CODES),
      message: 'Shift code must be one of: MORN, NIGHT, DAY, GEN'
    },
    uppercase: true,
    trim: true,
    maxlength: 10
  },
  StartTime: {
    type: String, // Store as HH:mm format
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  EndTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  GracePeriod: {
    type: Number, // minutes
    default: 15,
    min: 0,
    max: 120
  },
  LateThreshold: {
    type: Number, // minutes after grace period
    default: 30,
    min: 0
  },
  EarlyExitThreshold: {
    type: Number, // minutes before shift end
    default: 30,
    min: 0
  },
  BreakDuration: {
    type: Number, // minutes
    default: 60,
    min: 0
  },
  BreakStartTime: {
    type: String,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  OvertimeRules: {
    DailyThreshold: {
      type: Number, // hours
      default: 9
    },
    WeeklyThreshold: {
      type: Number, // hours
      default: 48
    },
    RateMultiplier: {
      type: Number,
      default: 1.5,
      min: 1
    }
  },
  ApplicableDepartments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }],
  IsActive: {
    type: Boolean,
    default: true
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

shiftSchema.pre('save', function(next) {
  this.UpdatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Shift', shiftSchema);