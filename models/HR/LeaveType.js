const mongoose = require('mongoose');

const leaveTypeSchema = new mongoose.Schema({
  Name: {
    type: String,
    required: [true, 'Leave type name is required'],
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  MaxDaysPerYear: {
    type: Number,
    required: true,
    min: 1,
    max: 365
  },
  Description: {
    type: String,
    trim: true,
    maxlength: 500
  },
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

// Pre-save middleware to update UpdatedAt
leaveTypeSchema.pre('save', function(next) {
  this.UpdatedAt = Date.now();
  next();
});

module.exports = mongoose.model('LeaveType', leaveTypeSchema);