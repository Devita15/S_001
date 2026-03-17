// models/EmployeeOnboarding.js
const mongoose = require('mongoose');

const employeeOnboardingSchema = new mongoose.Schema({
  onboardingId: {
    type: String,
    unique: true,
    sparse: true  // This allows multiple null values
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  joiningDate: {
    type: Date
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  reportingManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  workLocation: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'HOLD', 'CANCELLED'],
    default: 'PENDING'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  completedAt: Date,
  notes: String
}, {
  timestamps: true
});

employeeOnboardingSchema.pre('save', async function(next) {
  if (!this.onboardingId) {
    // Generate a unique onboarding ID
    const count = await mongoose.model('EmployeeOnboarding').countDocuments();
    this.onboardingId = `ONB${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

module.exports = mongoose.model('EmployeeOnboarding', employeeOnboardingSchema);