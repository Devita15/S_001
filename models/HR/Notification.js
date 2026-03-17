const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'requisition_submitted',
      'requisition_approved',
      'requisition_rejected',
      'offer_sent',
      'offer_accepted',
      'offer_rejected',
      'job_published',
      'application_received',
      'interview_scheduled',
      'interview_reminder',
      'feedback_submitted',
      'candidate_selected',
      'candidate_rejected',
      'comment_added',  
      'status_changed',
      'approval_reminder'
    ],
    required: true
  },
  title: String,
  message: String,
  data: {
    requisitionId: mongoose.Schema.Types.ObjectId,
    requisitionNumber: String,
    jobId: mongoose.Schema.Types.ObjectId,
    jobTitle: String,
    applicationId: mongoose.Schema.Types.ObjectId,
    candidateId: mongoose.Schema.Types.ObjectId,
    candidateName: String,
    interviewId: mongoose.Schema.Types.ObjectId,
    actionBy: String,
    link: String
  },
  isRead: {
    type: Boolean,
    default: false
  },
  isEmailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: Date,
  readAt: Date
}, {
  timestamps: true
});

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);