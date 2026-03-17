const mongoose = require('mongoose');

const networkHospitalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  city: String,
  address: String,
  phone: String,
  distance: String,
  type: String,
  empaneledDate: Date
}, { _id: false }); // _id: false prevents creating IDs for sub-documents

const policyDocumentSchema = new mongoose.Schema({
  name: String,
  url: String,
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const mediclaimPolicySchema = new mongoose.Schema({
  policyId: {
    type: String,
    required: true,
    unique: true
  },
  policyName: {
    type: String,
    required: [true, 'Policy name is required']
  },
  insurer: {
    type: String,
    required: [true, 'Insurer name is required']
  },
  policyNumber: {
    type: String,
    required: [true, 'Policy number is required'],
    unique: true
  },

  // Coverage Details
  coverageAmount: {
    type: Number,
    required: [true, 'Coverage amount is required']
  },
  coverageType: {
    type: String,
    enum: ['individual', 'family_floater'],
    required: true
  },
  familyCoverage: {
    spouse: { type: Boolean, default: true },
    children: { type: Boolean, default: true },
    maxChildren: { type: Number, default: 2 },
    parents: { type: Boolean, default: false },
    childAgeLimit: { type: Number, default: 25 },
    parentAgeLimit: Number
  },
  
  // Validity
  validityStart: {
    type: Date,
    required: true
  },
  validityEnd: {
    type: Date,
    required: true
  },
  
  // Premium
  premiumDetails: {
    amountPerEmployee: Number,
    totalPremium: Number,
    paymentFrequency: {
      type: String,
      enum: ['monthly', 'quarterly', 'annual'],
      default: 'annual'
    },
    paymentDate: Date,
    paymentMode: String,
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'overdue'],
      default: 'pending'
    }
  },
  
  // Network Hospitals - FIXED: Using sub-schema
  networkHospitals: [networkHospitalSchema],
  
  // Policy Terms
  waitingPeriods: {
    preExistingDiseases: String,
    specificDiseases: {
      type: Map,
      of: String
    }
  },
  
  exclusions: [String],
  
  // Documents - FIXED: Using sub-schema
  policyDocuments: [policyDocumentSchema],
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'active', 'expired', 'cancelled'],
    default: 'active'
  },
  
  // Renewal tracking
  renewalAlertSent: {
    type: Boolean,
    default: false
  },
  renewalAlertDate: Date,
  renewedFrom: String,
  
  // Metadata
  createdBy: {
    type: String,
    required: true
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Indexes for performance
mediclaimPolicySchema.index({ validityEnd: 1 });
mediclaimPolicySchema.index({ status: 1 });
mediclaimPolicySchema.index({ policyNumber: 1 });

module.exports = mongoose.model('MediclaimPolicy', mediclaimPolicySchema);