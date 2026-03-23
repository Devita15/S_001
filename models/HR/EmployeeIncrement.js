const mongoose = require('mongoose');

const employeeIncrementSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },
  incrementYear: {
    type: Number,
    required: true
  },
  cycleName: {
    type: String,
    required: true
  },
  policyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IncrementPolicy',
    required: true
  },
  
  // Behavior calculation
  behaviorScore: {
    type: Number,
    required: true,
    min: 0,
    max: 5
  },
  behaviorCategory: {
    type: String,
    enum: ['Excellent', 'Good', 'Average', 'Below Average', 'Poor'],
    required: true
  },
  behaviorSummary: {
    totalFeedbacks: Number,
    positiveCount: Number,
    negativeCount: Number,
    neutralCount: Number,
    escalatedCount: Number,
    categoryAverages: Map
  },
  
  // Previous salary snapshot
  previousSalary: {
    BasicSalary: Number,
    HRA: Number,
    ConveyanceAllowance: Number,
    MedicalAllowance: Number,
    SpecialAllowance: Number,
    HourlyRate: Number,
    TotalFixedSalary: Number
  },
  
  // Increment calculation
  incrementPercent: {
    type: Number,
    required: true,
    min: 0
  },
  incrementAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // New salary
  newSalary: {
    BasicSalary: Number,
    HRA: Number,
    ConveyanceAllowance: Number,
    MedicalAllowance: Number,
    SpecialAllowance: Number,
    HourlyRate: Number,
    TotalFixedSalary: Number
  },
  
  // Piece rate update (if applicable)
  pieceRateUpdates: [{
    productType: String,
    operation: String,
    oldRate: Number,
    newRate: Number,
    uom: String
  }],
  
  // Promotion (if applicable)
  promotion: {
    isPromoted: {
      type: Boolean,
      default: false
    },
    oldDesignation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation'
    },
    newDesignation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Designation'
    },
    promotionDate: Date
  },
  
  // Effective date
  effectiveFrom: {
    type: Date,
    required: true
  },
  
  // Approval workflow
  status: {
    type: String,
    enum: ['DRAFT', 'HR_REVIEW', 'DEPARTMENT_APPROVED', 'FINANCE_APPROVED', 'APPLIED', 'REJECTED'],
    default: 'DRAFT'
  },
  
  // Audit trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  hrReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  hrReviewedAt: Date,
  departmentApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  departmentApprovedAt: Date,
  financeApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  financeApprovedAt: Date,
  appliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  appliedAt: Date,
  
  // Remarks
  remarks: String,
  hrRemarks: String,
  departmentRemarks: String,
  financeRemarks: String,
  
  // Locking
  isLocked: {
    type: Boolean,
    default: false
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Compound index
employeeIncrementSchema.index(
  { employee: 1, incrementYear: 1 },
  { unique: true }
);

employeeIncrementSchema.index({ status: 1 });
employeeIncrementSchema.index({ effectiveFrom: 1 });

module.exports = mongoose.model('EmployeeIncrement', employeeIncrementSchema);