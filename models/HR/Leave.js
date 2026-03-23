const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  EmployeeID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  LeaveTypeID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LeaveType',
    required: true
  },
  StartDate: {
    type: Date,
    required: true
  },
  EndDate: {
    type: Date,
    required: true
  },
  Reason: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  ContactNumber: {
    type: String,
    trim: true,
    maxlength: 15
  },
  AddressDuringLeave: {
    type: String,
    trim: true,
    maxlength: 500
  },
  NumberOfDays: {
    type: Number,
    required: true,
    min: 0
  },
  Status: {
    type: String,
    required: true,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
    default: 'Pending'
  },
  AppliedOn: {
    type: Date,
    default: Date.now
  },
  ProcessedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  ProcessedOn: {
    type: Date
  },
  ProcessRemarks: {
    type: String,
    trim: true,
    maxlength: 500
  },
  CancelledOn: {
    type: Date
  },
  CancelRemarks: {
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
leaveSchema.pre('save', function(next) {
  this.UpdatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Leave', leaveSchema);