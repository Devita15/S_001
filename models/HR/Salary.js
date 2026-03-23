// models/Salary.js
const mongoose = require('mongoose');

const salarySchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },

  // Payroll period
  payrollPeriod: {
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12
    },
    year: {
      type: Number,
      required: true
    }
  },

  // DYNAMIC EARNINGS
  earnings: {
    type: Map,
    of: Number,
    default: () => new Map([
      ['basic', 0],
      ['hra', 0],
      ['conveyance', 0],
      ['medical', 0],
      ['special', 0],
      ['da', 0],
      ['arrears', 0],
      ['overtime', 0],
      ['performanceBonus', 0],
      ['attendanceBonus', 0],
      ['shiftAllowance', 0],
      ['productionIncentive', 0],
      ['otherAllowances', 0]
    ])
  },

  // NEW: REIMBURSEMENTS SECTION
  reimbursements: {
    type: Map,
    of: Number,
    default: () => new Map([
      ['travel', 0],           // Travel reimbursement
      ['food', 0],             // Food coupons/meal card
      ['telephone', 0],        // Telephone/Internet
      ['fuel', 0],             // Fuel reimbursement
      ['medicalReimbursement', 0], // Medical bills
      ['education', 0],        // Children education
      ['lta', 0],              // Leave Travel Allowance
      ['uniform', 0],          // Uniform allowance
      ['newspaper', 0],        // Newspaper/Books
      ['other', 0]             // Other reimbursements
    ])
  },

  // DYNAMIC DEDUCTIONS
  deductions: {
    type: Map,
    of: Number,
    default: () => new Map([
      ['pf', 0],
      ['esi', 0],
      ['professionalTax', 0],
      ['tds', 0],
      ['loanRecovery', 0],
      ['advanceRecovery', 0],
      ['labourWelfare', 0],
      ['otherDeductions', 0]
    ])
  },

  // Calculation rules
  calculationRules: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map([
      ['hraPercentage', 0],
      ['pfPercentage', 12],
      ['esiPercentage', 0.75],
      ['overtimeMultiplier', 1.5]
    ])
  },

  // Attendance details for manual entry
  workingDays: {
    type: Number,
    default: 26,
    min: 0,
    max: 31
  },
  paidDays: {
    type: Number,
    default: 26,
    min: 0,
    max: 31
  },
  leaveDays: {
    type: Number,
    default: 0,
    min: 0
  },
  lopDays: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Overtime details
  overtimeHours: {
    type: Number,
    default: 0,
    min: 0
  },
  overtimeRate: {
    type: Number,
    default: 0,
    min: 0
  },

  // Additional payments
  performanceBonus: {
    type: Number,
    default: 0,
    min: 0
  },
  incentives: {
    type: Number,
    default: 0,
    min: 0
  },

  // Advance deductions
  advanceDeductions: {
    type: Number,
    default: 0,
    min: 0
  },

  // Totals
  grossSalary: {
    type: Number,
    default: 0,
    min: 0
  },
  totalReimbursements: {
    type: Number,
    default: 0,
    min: 0
  },
  totalDeductions: {
    type: Number,
    default: 0,
    min: 0
  },
  netPay: {
    type: Number,
    default: 0
  },

  // Payment status
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PROCESSED', 'APPROVED', 'PAID', 'CANCELLED'],
    default: 'PENDING'
  },

  // Payment details
  paymentDate: Date,
  paymentMode: {
    type: String,
    enum: ['BANK_TRANSFER', 'CHEQUE', 'CASH'],
    default: 'BANK_TRANSFER'
  },
  transactionId: String,
  chequeNumber: String,
  bankReference: String,

  // Employment type snapshot (from employee at time of creation)
  employmentType: {
    type: String,
    enum: ['Monthly', 'Weekly', 'Daily', 'Hourly', 'PieceRate'],
    required: true
  },

  // Audit fields
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifiedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Metadata
  isLocked: {
    type: Boolean,
    default: false
  },
  version: {
    type: Number,
    default: 1
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: 1000
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Convert Maps to plain objects for JSON response
      if (ret.earnings instanceof Map) {
        ret.earnings = Object.fromEntries(ret.earnings);
      }
      if (ret.reimbursements instanceof Map) {
        ret.reimbursements = Object.fromEntries(ret.reimbursements);
      }
      if (ret.deductions instanceof Map) {
        ret.deductions = Object.fromEntries(ret.deductions);
      }
      if (ret.calculationRules instanceof Map) {
        ret.calculationRules = Object.fromEntries(ret.calculationRules);
      }
      return ret;
    }
  }
});

// Compound index to ensure one salary per employee per month
salarySchema.index(
  { employee: 1, 'payrollPeriod.month': 1, 'payrollPeriod.year': 1 },
  { unique: true }
);

// Other indexes for performance
salarySchema.index({ paymentStatus: 1 });
salarySchema.index({ 'payrollPeriod.year': 1, 'payrollPeriod.month': 1 });
salarySchema.index({ createdAt: -1 });
salarySchema.index({ employmentType: 1 });

// models/Salary.js - Fixed pre-save middleware

salarySchema.pre('save', function(next) {
  // Calculate earnings total
  let earningsTotal = 0;
  
  // FIRST: Calculate current earnings total from Map
  if (this.earnings) {
    this.earnings.forEach(value => {
      earningsTotal += (value || 0);
    });
  }
  
  // ========== FIX OVERTIME ==========
  // Always recalculate overtime based on hours and rate
  if (this.overtimeHours && this.overtimeRate && this.overtimeHours > 0 && this.overtimeRate > 0) {
    const overtimeAmount = this.overtimeHours * this.overtimeRate;
    
    // Check if overtime already exists in earnings
    const existingOvertime = this.earnings.get('overtime') || 0;
    
    // Remove existing overtime from total if present
    if (existingOvertime > 0) {
      earningsTotal -= existingOvertime;
    }
    
    // Set new overtime amount
    this.earnings.set('overtime', overtimeAmount);
    
    // Add new overtime to total
    earningsTotal += overtimeAmount;
    
    console.log(`Overtime calculated: ${this.overtimeHours}h × ${this.overtimeRate} = ${overtimeAmount}`);
  } else {
    // If no overtime hours, ensure overtime is set to 0
    this.earnings.set('overtime', 0);
  }
  
  // ========== FIX PERFORMANCE BONUS ==========
    const earningsBonusValue = this.earnings.get('performanceBonus') || 0;

    // Check if top-level performanceBonus is provided AND has a value
    if (this.performanceBonus !== undefined && this.performanceBonus !== null && this.performanceBonus > 0) {
      // Top-level field takes precedence
      const existingBonus = earningsBonusValue;
      if (existingBonus > 0) {
        earningsTotal -= existingBonus;
      }
      this.earnings.set('performanceBonus', this.performanceBonus);
      earningsTotal += this.performanceBonus;
    } 
    // Otherwise, preserve whatever was in the earnings map
    else if (earningsBonusValue > 0) {
      // Value already in earningsTotal from initial calculation
      // Just ensure it's set correctly (it already is)
      this.earnings.set('performanceBonus', earningsBonusValue);
    }
    // If both are 0/undefined, set to 0
    else {
      this.earnings.set('performanceBonus', 0);
    }
  
  
  // ========== FIX INCENTIVES ==========
// Get the value from earnings map (what was sent in payload)
const earningsIncentivesValue = this.earnings.get('incentives') || 0;

// Check if top-level incentives is provided AND has a value
if (this.incentives !== undefined && this.incentives !== null && this.incentives > 0) {
  // Top-level field takes precedence
  const existingIncentives = earningsIncentivesValue;
  if (existingIncentives > 0) {
    earningsTotal -= existingIncentives;
  }
  this.earnings.set('incentives', this.incentives);
  earningsTotal += this.incentives;
} 
// Otherwise, preserve whatever was in the earnings map
else if (earningsIncentivesValue > 0) {
  // Value already in earningsTotal from initial calculation
  // Just ensure it's set correctly (it already is)
  this.earnings.set('incentives', earningsIncentivesValue);
}
// If both are 0/undefined, set to 0
else {
  this.earnings.set('incentives', 0);
}
  
  
  // Calculate reimbursements total
  let reimbursementsTotal = 0;
  if (this.reimbursements) {
    this.reimbursements.forEach(value => {
      reimbursementsTotal += (value || 0);
    });
  }
  
  // Calculate deductions total
  let deductionsTotal = 0;
  if (this.deductions) {
    this.deductions.forEach(value => {
      deductionsTotal += (value || 0);
    });
  }
  
  // Add advance deductions
  if (this.advanceDeductions) {
    deductionsTotal += this.advanceDeductions;
  }
  
  // Set the totals
  this.grossSalary = earningsTotal;
  this.totalReimbursements = reimbursementsTotal;
  this.totalDeductions = deductionsTotal;
  
  // Net Pay = Gross Salary + Reimbursements - Total Deductions
  this.netPay = (this.grossSalary + this.totalReimbursements) - this.totalDeductions;
  
  // Ensure netPay is not negative
  if (this.netPay < 0) this.netPay = 0;
  
  next();
});

// Virtuals for display
salarySchema.virtual('employeeName').get(function() {
  return this.employee ? `${this.employee.FirstName} ${this.employee.LastName}` : '';
});

salarySchema.virtual('monthName').get(function() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[this.payrollPeriod.month - 1];
});

salarySchema.virtual('periodDisplay').get(function() {
  return `${this.monthName} ${this.payrollPeriod.year}`;
});

// Methods
salarySchema.methods.lock = function(userId) {
  this.isLocked = true;
  this.updatedBy = userId;
  return this.save();
};

salarySchema.methods.unlock = function(userId) {
  this.isLocked = false;
  this.updatedBy = userId;
  return this.save();
};

salarySchema.methods.approve = function(userId) {
  this.paymentStatus = 'APPROVED';
  this.approvedBy = userId;
  this.approvedAt = new Date();
  return this.save();
};

salarySchema.methods.markAsPaid = function(paymentDetails, userId) {
  this.paymentStatus = 'PAID';
  this.paymentDate = paymentDetails.paymentDate || new Date();
  this.paymentMode = paymentDetails.paymentMode;
  this.transactionId = paymentDetails.transactionId;
  this.chequeNumber = paymentDetails.chequeNumber;
  this.bankReference = paymentDetails.bankReference;
  this.updatedBy = userId;
  return this.save();
};

module.exports = mongoose.model('Salary', salarySchema);