// models/EmployeeTrainingRecord.js
const mongoose = require('mongoose');

const employeeTrainingRecordSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'Employee is required']
  },
  training: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SafetyTraining',
    required: [true, 'Training is required']
  },
  trainingDate: {
    type: Date,
    required: [true, 'Training date is required'],
    default: Date.now
  },
  expiryDate: {
    type: Date,
    required: [true, 'Expiry date is required']
  },
  trainer: {
    type: String,
    required: [true, 'Trainer name is required'],
    trim: true
  },
  certificateNumber: String,
  certificateFile: String,
  score: {
    type: Number,
    min: 0,
    max: 100
  },
  status: {
    type: String,
    enum: ['Completed', 'Pending', 'Failed', 'Expired'],
    default: 'Completed'
  },
  remarks: String,
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

// Indexes
employeeTrainingRecordSchema.index({ employee: 1, training: 1 });
employeeTrainingRecordSchema.index({ expiryDate: 1, status: 1 });
employeeTrainingRecordSchema.index({ trainingDate: 1 });

module.exports = mongoose.model('EmployeeTrainingRecord', employeeTrainingRecordSchema);