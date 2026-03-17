// models/EmployeeShift.js
const mongoose = require('mongoose');

const employeeShiftSchema = new mongoose.Schema({
  EmployeeID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  ShiftID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shift',
    required: true
  },
  EffectiveFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  EffectiveTo: {
    type: Date
  },
  IsCurrent: {
    type: Boolean,
    default: true
  },
  CreatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

// Index for quick lookup
employeeShiftSchema.index({ EmployeeID: 1, IsCurrent: 1 });
employeeShiftSchema.index({ EffectiveFrom: 1, EffectiveTo: 1 });

employeeShiftSchema.pre('save', function(next) {
  this.UpdatedAt = Date.now();
  next();
});

module.exports = mongoose.model('EmployeeShift', employeeShiftSchema);