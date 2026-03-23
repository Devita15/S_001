const mongoose = require('mongoose');

const incrementSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },

  incrementDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  effectiveFrom: {
    type: Date,
    required: true
  },
  incrementYear: {
    type: Number,
    required: true
  },

  // Performance review reference
  performanceReviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PerformanceReview'
  },

  // Salary before increment
  previousSalary: {
    basic: { type: Number, required: true },
    hra: { type: Number, required: true },
    conveyance: { type: Number, required: true },
    medical: { type: Number, required: true },
    specialAllowance: { type: Number, required: true },
    total: { type: Number, required: true },
    
    // For hourly workers
    hourlyRate: { type: Number },
    
    // For piece-rate workers
    pieceRates: [{
      productType: String,
      operation: String,
      oldRate: Number
    }]
  },

  // Increment details
  incrementType: {
    type: String,
    enum: [
      'ANNUAL_REVIEW',
      'PROMOTION',
      'SKILL_UPGRADE',
      'MERIT',
      'RETENTION',
      'MARKET_CORRECTION',
      'OTHER'
    ],
    required: true
  },

  incrementPercentage: {
    overall: { type: Number, required: true },
    basic: { type: Number },
    hra: { type: Number },
    conveyance: { type: Number },
    medical: { type: Number },
    specialAllowance: { type: Number }
  },

  incrementAmount: {
    monthly: { type: Number, required: true },
    annual: { type: Number, required: true }
  },

  // New salary after increment
  newSalary: {
    basic: { type: Number, required: true },
    hra: { type: Number, required: true },
    conveyance: { type: Number, required: true },
    medical: { type: Number, required: true },
    specialAllowance: { type: Number, required: true },
    total: { type: Number, required: true },
    
    // For hourly workers
    hourlyRate: { type: Number },
    
    // For piece-rate workers
    pieceRates: [{
      productType: String,
      operation: String,
      oldRate: Number,
      newRate: Number,
      incrementPercentage: Number
    }]
  },

  // Performance data snapshot
  performanceSnapshot: {
    totalScore: Number,
    rating: String,
    managerRating: Number,
    attendancePercentage: Number,
    qualityPercentage: Number,
    productionAchievement: Number
  },

  // Factors considered
  factorsConsidered: {
    performanceScore: { type: Number },
    tenureBonus: { type: Number, default: 0 },
    skillBonus: { type: Number, default: 0 },
    attendanceBonus: { type: Number, default: 0 },
    safetyBonus: { type: Number, default: 0 },
    specialAdjustment: { type: Number, default: 0 }
  },

  // Approval workflow
  workflow: {
    status: {
      type: String,
      enum: [
        'DRAFT',
        'PENDING_MANAGER',
        'MANAGER_APPROVED',
        'PENDING_HR',
        'HR_APPROVED',
        'PENDING_FINANCE',
        'FINANCE_APPROVED',
        'PENDING_DIRECTOR',
        'DIRECTOR_APPROVED',
        'APPROVED',
        'REJECTED',
        'CANCELLED'
      ],
      default: 'DRAFT'
    },
    
    history: [{
      stage: String,
      action: String,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      performedAt: Date,
      comments: String
    }],
    
    currentApprover: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },

  // Financial impact
  financialImpact: {
    monthlyIncrease: Number,
    annualIncrease: Number,
    newCTC: Number,
    oldCTC: Number,
    departmentBudgetUtilized: Number
  },

  // Documents
  documents: [{
    name: String,
    type: String,
    url: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: Date
  }],

  // Communication
  communication: {
    letterGenerated: { type: Boolean, default: false },
    letterUrl: String,
    emailSent: { type: Boolean, default: false },
    emailSentAt: Date,
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    acknowledgedAt: Date
  },

  // Remarks
  remarks: String,
  hrRemarks: String,
  managerRemarks: String,

  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date
}, {
  timestamps: true
});

// Indexes
incrementSchema.index({ employeeId: 1, incrementYear: 1 }, { unique: true });
incrementSchema.index({ 'workflow.status': 1 });
incrementSchema.index({ effectiveFrom: 1 });
incrementSchema.index({ incrementYear: 1, 'workflow.status': 1 });

// Pre-save middleware
incrementSchema.pre('save', function(next) {
  // Calculate increment amount if not set
  if (!this.incrementAmount || this.incrementAmount.monthly === 0) {
    this.incrementAmount = {
      monthly: this.newSalary.total - this.previousSalary.total,
      annual: (this.newSalary.total - this.previousSalary.total) * 12
    };
  }

  // Calculate financial impact
  this.financialImpact = {
    monthlyIncrease: this.incrementAmount.monthly,
    annualIncrease: this.incrementAmount.annual,
    newCTC: this.newSalary.total * 12,
    oldCTC: this.previousSalary.total * 12
  };

  next();
});

// Virtuals
incrementSchema.virtual('incrementPercentageDisplay').get(function() {
  return `${this.incrementPercentage.overall}%`;
});

incrementSchema.virtual('monthlyIncreaseDisplay').get(function() {
  return `₹${this.incrementAmount.monthly}`;
});

// Methods
incrementSchema.methods.submitForApproval = async function(userId) {
  this.workflow.status = 'PENDING_MANAGER';
  this.workflow.history.push({
    stage: 'submission',
    action: 'SUBMITTED',
    performedBy: userId,
    performedAt: new Date()
  });
  return this.save();
};

incrementSchema.methods.approve = async function(userId, stage, comments) {
  const stageMap = {
    manager: 'MANAGER_APPROVED',
    hr: 'HR_APPROVED',
    finance: 'FINANCE_APPROVED',
    director: 'DIRECTOR_APPROVED'
  };

  this.workflow.status = stageMap[stage] || 'APPROVED';
  this.workflow.history.push({
    stage,
    action: 'APPROVED',
    performedBy: userId,
    performedAt: new Date(),
    comments
  });

  if (this.workflow.status === 'APPROVED') {
    this.approvedBy = userId;
    this.approvedAt = new Date();
  }

  return this.save();
};

incrementSchema.methods.reject = async function(userId, stage, comments) {
  this.workflow.status = 'REJECTED';
  this.workflow.history.push({
    stage,
    action: 'REJECTED',
    performedBy: userId,
    performedAt: new Date(),
    comments
  });
  return this.save();
};

incrementSchema.methods.generateLetter = async function() {
  this.communication.letterGenerated = true;
  this.communication.letterUrl = `/increment-letters/${this._id}.pdf`;
  return this.save();
};

incrementSchema.methods.markAcknowledged = async function(userId) {
  this.communication.acknowledgedBy = userId;
  this.communication.acknowledgedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Increment', incrementSchema);