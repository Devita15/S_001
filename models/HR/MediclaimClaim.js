const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema({
  claimId: {
    type: String,
    unique: true
    // Remove required: true - it's auto-generated
  },
  enrollmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MediclaimEnrollment',
    required: true
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
  
  // Patient Details
  patientDetails: {
    name: String,
    relationship: String,
    age: Number,
    gender: String
  },
  
  // Claim Details
  claimType: {
    type: String,
    enum: ['cashless', 'reimbursement'],
    required: true
  },
  hospitalName: {
    type: String,
    required: true
  },
  hospitalAddress: String,
  admissionDate: Date,
  dischargeDate: Date,
  diagnosis: String,
  treatment: String,
  
  // Financial Details
  claimedAmount: {
    type: Number,
    required: true
  },
  approvedAmount: Number,
  disallowedAmount: Number,
  disallowedReason: String,
  
  // Documents
  documents: [{
    name: String,
    url: String,
    uploadedAt: Date
  }],
  
  // Status Tracking
  status: {
    type: String,
    enum: ['submitted', 'under_review', 'approved', 'rejected', 'settled'],
    default: 'submitted'
  },
  statusHistory: [{
    status: String,
    updatedBy: String,
    updatedAt: Date,
    comments: String
  }],
  
  // Approval Workflow
  assignedTo: String,
  reviewedBy: String,
  reviewDate: Date,
  approvedBy: String,
  approvalDate: Date,
  
  // Payment
  paymentDetails: {
    mode: String,
    amount: Number,
    date: Date,
    transactionId: String,
    paidTo: String
  },
  
  // Metadata
  submittedBy: String,
  submittedDate: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to generate claimId
claimSchema.pre('save', async function(next) {
  try {
    if (!this.claimId) {
      const count = await mongoose.model('MediclaimClaim').countDocuments();
      const year = new Date().getFullYear();
      this.claimId = `CLM-${year}-${(count + 1).toString().padStart(6, '0')}`;
      console.log('Generated claimId:', this.claimId); // Debug log
    }
    
    // Add to status history if status changed
    if (this.isModified('status')) {
      this.statusHistory.push({
        status: this.status,
        updatedAt: new Date(),
        updatedBy: this.reviewedBy || 'system'
      });
    }
    
    next();
  } catch (error) {
    console.error('Error in pre-save middleware:', error);
    next(error);
  }
});

module.exports = mongoose.model('MediclaimClaim', claimSchema);