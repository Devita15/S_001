const mongoose = require('mongoose');

const companyFinancialSchema = new mongoose.Schema({
  CompanyID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    unique: true
  },
  CreditOnInputMaterialDays: {
    type: Number,
    required: true,
    default: -30
  },
  WIPFGInventoryDays: {
    type: Number,
    required: true,
    default: 30
  },
  CreditGivenToCustomerDays: {
    type: Number,
    required: true,
    default: 45
  },
  CostOfCapital: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    default: 0.1
  },
  OHPPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 10
  },
  ProfitPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 15
  },
  ScrapRecoveryPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 85
  },
  EffectiveScrapRateMultiplier: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    default: 0.85
  },
  InspectionCost: {
    type: Number,
    required: true,
    min: 0,
    default: 0.20
  },
  ToolMaintenanceCost: {
    type: Number,
    required: true,
    min: 0,
    default: 0.20
  },
  PlatingRatePerKG: {
    type: Number,
    required: true,
    min: 0,
    default: 70
  },
  IsActive: {
    type: Boolean,
    default: true
  },
  CreatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  UpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for faster queries
companyFinancialSchema.index({ CompanyID: 1 });
companyFinancialSchema.index({ IsActive: 1 });

module.exports = mongoose.model('CompanyFinancial', companyFinancialSchema);