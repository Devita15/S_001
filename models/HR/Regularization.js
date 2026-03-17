// models/Regularization.js
const mongoose = require('mongoose');

const regularizationSchema = new mongoose.Schema({
  EmployeeID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  Date: {
    type: Date,
    required: true
  },
  RequestType: {
    type: String,
    required: true,
    enum: ['missed-punch', 'correct-time', 'work-from-home', 'on-duty']
  },
  RequestedIn: {
    type: Date
  },
  RequestedOut: {
    type: Date
  },
  Reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  SupportingDocument: {
    type: String // URL to document
  },
  Status: {
    type: String,
    required: true,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
    default: 'Pending'
  },
  ApproverID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  ApprovedAt: {
    type: Date
  },
  ApprovalRemarks: {
    type: String,
    trim: true,
    maxlength: 500
  },
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

regularizationSchema.pre('save', function(next) {
  this.UpdatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Regularization', regularizationSchema);