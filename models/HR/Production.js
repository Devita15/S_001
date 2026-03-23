const mongoose = require('mongoose');

const productionSchema = new mongoose.Schema({
  EmployeeID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },
  Date: {
    type: Date,
    required: true,
    default: Date.now
  },
  ShiftID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shift'
  },
  
    rateMasterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PieceRateMaster',
    index: true
  },
  
  // Keep RatePerUnit as snapshot of rate at time of production
  RatePerUnit: {
    type: Number,
    required: true,
    min: 0
  },
  ProductName: {
    type: String,
    required: true,
    trim: true
  },
  Operation: {
    type: String,
    required: true,
    trim: true
  },
  DailyEarning: {
    type: Number,
    default: 0,
    min: 0
  },
  // Quantity tracking
  TotalUnits: {
    type: Number,
    required: true,
    min: 0
  },
  GoodUnits: {
    type: Number,
    required: true,
    min: 0
  },
  RejectedUnits: {
    type: Number,
    default: 0,
    min: 0
  },
  ReworkUnits: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Rates and calculations
  RatePerUnit: {
    type: Number,
    required: true,
    min: 0
  },
  TotalAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  QualityBonus: {
    type: Number,
    default: 0,
    min: 0
  },
  EfficiencyBonus: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Quality metrics
  QualityPercentage: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  },
  EfficiencyPercentage: {
    type: Number,
    default: 100,
    min: 0,
    max: 200
  },
  
  // Time tracking
  StartTime: Date,
  EndTime: Date,
  TotalHours: {
    type: Number,
    default: 0
  },
  
  // Approval workflow
  Status: {
    type: String,
    enum: ['Pending', 'Verified', 'Approved', 'Rejected', 'Paid'],
    default: 'Pending'
  },
  VerifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  ApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  VerificationTime: Date,
  ApprovalTime: Date,
  
  // Integration with payroll
  SalaryProcessed: {
    type: Boolean,
    default: false
  },
  SalaryID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Salary'
  },
  SalaryPeriod: {
    month: Number,
    year: Number
  },
  
  // Additional info
  MachineID: String,
  BatchNumber: String,
  OrderNumber: String,
  Remarks: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // Audit trail
  CreatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  UpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
productionSchema.index({ EmployeeID: 1, Date: 1 });
productionSchema.index({ Date: 1, Status: 1 });
productionSchema.index({ ProductCode: 1, Status: 1 });

// Virtuals
productionSchema.virtual('employeeName').get(function() {
  if (this.EmployeeID && this.EmployeeID.FirstName) {
    return `${this.EmployeeID.FirstName} ${this.EmployeeID.LastName}`;
  }
  return '';
});

productionSchema.virtual('rejectionRate').get(function() {
  return this.TotalUnits > 0 ? (this.RejectedUnits / this.TotalUnits) * 100 : 0;
});

productionSchema.virtual('netUnits').get(function() {
  return this.GoodUnits - this.ReworkUnits;
});

productionSchema.virtual('earnings').get(function() {
  return (this.netUnits * this.RatePerUnit) + this.QualityBonus + this.EfficiencyBonus;
});

// Middleware for calculations
productionSchema.pre('save', function(next) {
  // Calculate total amount
  this.TotalAmount = (this.GoodUnits * this.RatePerUnit) + this.QualityBonus + this.EfficiencyBonus;
  
  // Calculate daily earning (same as TotalAmount for production record)
  this.DailyEarning = this.TotalAmount;
  
  // Calculate quality percentage
  if (this.TotalUnits > 0) {
    this.QualityPercentage = (this.GoodUnits / this.TotalUnits) * 100;
  }
  
  // Calculate total hours if start and end times are provided
  if (this.StartTime && this.EndTime) {
    const hours = (this.EndTime - this.StartTime) / (1000 * 60 * 60);
    this.TotalHours = Math.round(hours * 100) / 100;
  }
  
  next();
});

module.exports = mongoose.model('Production', productionSchema);