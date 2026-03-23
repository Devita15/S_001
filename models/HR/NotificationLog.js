const mongoose = require('mongoose');

const notificationLogSchema = new mongoose.Schema({
  notificationId: {
    type: String,
    required: true,
    unique: true
  },
  
  type: {
    type: String,
    enum: ['email', 'sms', 'whatsapp', 'in_app'],
    required: true
  },
  
  template: {
    type: String,
    enum: ['enrollment', 'claim_update', 'renewal_alert', 'policy_expiry'],
    required: true
  },
  
  recipient: {
    email: String,
    phone: String,
    employeeId: String
  },
  
  subject: String,
  content: String,
  
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'delivered', 'read'],
    default: 'pending'
  },
  
  // For tracking
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  
  // Error tracking
  errorMessage: String,
  retryCount: {
    type: Number,
    default: 0
  },
  
  // Metadata
  createdBy: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('NotificationLog', notificationLogSchema);