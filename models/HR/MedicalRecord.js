// models/MedicalRecord.js
const mongoose = require('mongoose');

const medicalRecordSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'Employee is required']
  },
  checkupDate: {
    type: Date,
    required: [true, 'Checkup date is required'],
    default: Date.now
  },
  checkupType: {
    type: String,
    required: [true, 'Checkup type is required'],
    enum: ['Pre-Employment', 'Annual', 'Periodic', 'Post-Accident', 'Return to Work', 'Special'],
    default: 'Annual'
  },
  doctorName: {
    type: String,
    required: [true, 'Doctor name is required'],
    trim: true
  },
  clinicName: String,
  
  // Vital Signs
  bloodPressure: String,
  heartRate: Number,
  temperature: Number,
  respiratoryRate: Number,
  height: Number,
  weight: Number,
  bmi: Number,
  
  // Medical Examination
  visionLeft: String,
  visionRight: String,
  hearingTest: String,
  respiratoryTest: String,
  musculoskeletal: String,
  neurological: String,
  
  // Lab Results
  bloodGroup: String,
  hemoglobin: Number,
  sugarFasting: Number,
  sugarPostPrandial: Number,
  cholesterol: Number,

  fitnessStatus: {
    type: String,
    required: [true, 'Fitness status is required'],
    enum: ['Fit', 'Fit with Restrictions', 'Unfit', 'Temporarily Unfit'],
    default: 'Fit'
  },
  restrictions: [{
    type: String,
    enum: ['No Heavy Lifting', 'No Standing > 4hrs', 'No Night Shift', 'No Machine Operation', 'Limited Mobility', 'Other']
  }],
  
  recommendations: String,
  remarks: String,
  reportFile: String,
  nextCheckupDate: Date,
  
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
medicalRecordSchema.index({ employee: 1, checkupDate: -1 });
medicalRecordSchema.index({ nextCheckupDate: 1 });
medicalRecordSchema.index({ fitnessStatus: 1 });

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema);