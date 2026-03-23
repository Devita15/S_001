const mongoose = require('mongoose');

const dependentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  relationship: {
    type: String,
    enum: ['spouse', 'son', 'daughter', 'father', 'mother', 'self'],
    required: true
  },
  gender: {
    type: String,
    enum: ['M', 'F', 'O']
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  age: Number,
  occupation: String,
  isActive: {
    type: Boolean,
    default: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

const coverageDetailsSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  members: [dependentSchema]
}, { _id: false });

const nomineeDetailSchema = new mongoose.Schema({
  name: String,
  relationship: String,
  contactNumber: String,
  percentage: Number,
  address: String
}, { _id: false });

const communicationDetailsSchema = new mongoose.Schema({
  email: String,
  phone: String,
  alternatePhone: String,
  address: String
}, { _id: false });

const notificationsSentSchema = new mongoose.Schema({
  enrollmentEmail: { type: Boolean, default: false },
  welcomeSms: { type: Boolean, default: false },
  renewalReminder: { type: Boolean, default: false }
}, { _id: false });

const mediclaimEnrollmentSchema = new mongoose.Schema({
  enrollmentId: {
    type: String,
    unique: true
    // Remove required: true since it's auto-generated
  },
  employeeId: {
    type: String,
    ref: 'Employee',
    required: true
  },
  policyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MediclaimPolicy',
    required: true
  },
  
  // Insurance Details
  insuranceId: {
    type: String,
    unique: true
    // Remove required: true since it's auto-generated
  },
  
  // Coverage Details - Use the sub-schema
  coverageDetails: {
    type: coverageDetailsSchema,
    required: true
  },
  
  // Premium
  premiumPaid: {
    type: Boolean,
    default: false
  },
  premiumAmount: Number,
  paymentDate: Date,
  
  // Nominee
  nomineeDetails: [nomineeDetailSchema],
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'active', 'expired', 'cancelled'],
    default: 'pending'
  },
  
  // Communication
  communicationDetails: communicationDetailsSchema,
  
  // Claims
  claims: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MediclaimClaim'
  }],
  
  // Tracking
  enrollmentDate: {
    type: Date,
    default: Date.now
  },
  enrolledBy: String,
  
  // Notifications
  notificationsSent: {
    type: notificationsSentSchema,
    default: {}
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Compound indexes
mediclaimEnrollmentSchema.index({ employeeId: 1, policyId: 1 }, { unique: true });
mediclaimEnrollmentSchema.index({ insuranceId: 1 });
mediclaimEnrollmentSchema.index({ status: 1 });
mediclaimEnrollmentSchema.index({ 'coverageDetails.endDate': 1 });

// Pre-save middleware to generate enrollment ID and insurance ID
mediclaimEnrollmentSchema.pre('save', async function(next) {
  try {
    // Generate enrollmentId if not present
    if (!this.enrollmentId) {
      const count = await mongoose.model('MediclaimEnrollment').countDocuments();
      const year = new Date().getFullYear();
      this.enrollmentId = `ENR-${year}-${(count + 1).toString().padStart(4, '0')}`;
    }
    
    // Generate insuranceId if not present
    if (!this.insuranceId && this.coverageDetails && this.coverageDetails.startDate) {
      const year = this.coverageDetails.startDate.getFullYear().toString().slice(-2);
      const nextYear = this.coverageDetails.endDate.getFullYear().toString().slice(-2);
      // Use employeeId but sanitize for insurance ID
      const empId = this.employeeId.toString().replace(/[^a-zA-Z0-9]/g, '').slice(-6);
      this.insuranceId = `INS-${empId}-${year}${nextYear}`;
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check if family member limit is exceeded
mediclaimEnrollmentSchema.methods.checkFamilyLimit = function(maxChildren = 2) {
  if (!this.coverageDetails || !this.coverageDetails.members) return true;
  
  const children = this.coverageDetails.members.filter(m => 
    ['son', 'daughter'].includes(m.relationship)
  );
  return children.length <= maxChildren;
};

module.exports = mongoose.model('MediclaimEnrollment', mediclaimEnrollmentSchema);