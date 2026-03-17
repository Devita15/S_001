const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'SUBMIT', 'APPROVE', 'REJECT', 'PUBLISH', 'SCHEDULE', 'FEEDBACK', 'VIEW']
  },
  entityType: {
    type: String,
    required: true,
    enum: ['Requisition', 'User', 'Employee', 'Offer', 'Role', 'Department', 'Designation', 'JobOpening', 'Candidate', 'Application', 'Interview', 'EmployeeBehavior']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    //required: true,
    refPath: 'entityType'
  },
  entityName: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: String,
  userRole: String,
  changes: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);