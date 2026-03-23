// models/PPEIssuance.js
const mongoose = require('mongoose');

const ppeIssuanceSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'Employee is required']
  },
  ppe: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PPEMaster',
    required: [true, 'PPE is required']
  },
  issueDate: {
    type: Date,
    required: [true, 'Issue date is required'],
    default: Date.now
  },
  expiryDate: {
    type: Date,
    required: [true, 'Expiry date is required']
  },
  condition: {
    type: String,
    required: [true, 'Condition is required'],
    enum: ['New', 'Good', 'Fair', 'Poor', 'Damaged'],
    default: 'Good'
  },
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'Issuer is required']
  },
  status: {
    type: String,
    enum: ['Active', 'Expired', 'Returned', 'Damaged', 'Lost'],
    default: 'Active'
  },
  returnDate: Date,
  returnCondition: String,
  remarks: String,
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

// Index for better query performance
ppeIssuanceSchema.index({ employee: 1, ppe: 1, status: 1 });
ppeIssuanceSchema.index({ expiryDate: 1, status: 1 });

module.exports = mongoose.model('PPEIssuance', ppeIssuanceSchema);