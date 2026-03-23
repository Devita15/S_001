const mongoose = require('mongoose');

const regularizationSchema = new mongoose.Schema({
  EmployeeID: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  Date: { type: Date, required: true },
  RequestType: { type: String, required: true, enum: ['missed-punch', 'correct-time', 'work-from-home', 'on-duty'] },
  RequestedIn: { type: Date },
  RequestedOut: { type: Date },
  Reason: { type: String, required: true },
  SupportingDocument: { type: String },
  Status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'], default: 'Pending' },
  ApproverID: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  ApprovedAt: { type: Date },
  ApprovalRemarks: { type: String }
}, { timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' } });

module.exports = mongoose.model('Regularization', regularizationSchema);