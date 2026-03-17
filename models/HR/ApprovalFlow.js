const mongoose = require('mongoose');

const approvalFlowSchema = new mongoose.Schema({
  requisitionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Requisition',
    required: true
  },
  steps: [{
    stepNumber: Number,
    approverRole: String,
    approverId: mongoose.Schema.Types.ObjectId,
    approverName: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'skipped'],
      default: 'pending'
    },
    actionDate: Date,
    comments: String,
    signature: String
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
  completedAt: Date
}, {
  timestamps: true
});

module.exports = mongoose.model('ApprovalFlow', approvalFlowSchema);