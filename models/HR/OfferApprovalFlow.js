const mongoose = require('mongoose');

const offerApprovalFlowSchema = new mongoose.Schema({
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Offer',
    required: true
  },
  workflowType: {
    type: String,
    enum: ['standard', 'high_value', 'executive'],
    default: 'standard'
  },
  steps: [{
    stepNumber: Number,
    approverRole: {
      type: String,
      enum: ['Hiring Manager', 'Finance Head', 'CEO', 'HR']
    },
    approverId: mongoose.Schema.Types.ObjectId,
    approverName: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'skipped'],
      default: 'pending'
    },
    actionDate: Date,
    comments: String,
    signature: String,
    notifiedAt: Date,
    remindedAt: [Date]
  }],
  currentStep: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'rejected'],
    default: 'in_progress'
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  initiatedByName: String,
  completedAt: Date,
  expiryDate: Date
}, {
  timestamps: true
});

module.exports = mongoose.model('OfferApprovalFlow', offerApprovalFlowSchema);