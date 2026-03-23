// models/Accident.js
const mongoose = require('mongoose');

const accidentSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'Employee is required']
  },
  date: {
    type: Date,
    required: [true, 'Incident date is required'],
    default: Date.now
  },
  time: String,
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  machineId: String,
  machineName: String,
  injuryType: {
    type: String,
    required: [true, 'Injury type is required'],
    enum: ['Cut', 'Burn', 'Fracture', 'Sprain', 'Electric Shock', 'Eye Injury', 'Hearing Loss', 'Respiratory', 'Chemical Exposure', 'Other'],
    default: 'Other'
  },
  bodyPartAffected: String,
  severity: {
    type: String,
    required: [true, 'Severity is required'],
    enum: ['Minor', 'Moderate', 'Major', 'Fatal'],
    default: 'Minor'
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  immediateAction: String,
  rootCause: {
    type: String,
    trim: true
  },
  correctiveAction: String,
  preventiveAction: String,
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'Reporter is required']
  },
  investigationStatus: {
    type: String,
    enum: ['Open', 'Under Investigation', 'Closed', 'Resolved'],
    default: 'Open'
  },
  investigationDate: Date,
  investigationBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  medicalTreatment: String,
  lostDays: Number,
  costIncurred: Number,
  attachments: [String],
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
accidentSchema.index({ employee: 1, date: -1 });
accidentSchema.index({ severity: 1, investigationStatus: 1 });
accidentSchema.index({ location: 1 });

module.exports = mongoose.model('Accident', accidentSchema);