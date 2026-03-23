const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
  interviewId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    required: true
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate',
    required: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobOpening'
  },
  round: {
    type: String,
    enum: ['Telephonic', 'Technical', 'HR', 'Managerial', 'Final'],
    required: true
  },
  interviewers: [{
    interviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: String,
    email: String
  }],
  scheduledAt: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // in minutes
    default: 60
  },
  type: {
    type: String,
    enum: ['in-person', 'video', 'telephonic'],
    required: true
  },
  location: String,
  meetingLink: String,
  status: {
    type: String,
    enum: ['scheduled', 'rescheduled', 'cancelled', 'completed', 'no-show'],
    default: 'scheduled'
  },
  feedback: {
    ratings: {
      technical: { type: Number, min: 1, max: 5 },
      communication: { type: Number, min: 1, max: 5 },
      problemSolving: { type: Number, min: 1, max: 5 },
      culturalFit: { type: Number, min: 1, max: 5 },
      overall: { type: Number, min: 1, max: 5 }
    },
    comments: String,
    strengths: String,
    weaknesses: String,
    decision: {
      type: String,
      enum: ['select', 'reject', 'hold']
    },
    submittedBy: mongoose.Schema.Types.ObjectId,
    submittedAt: Date
  },
  calendarEvents: {
    interviewerEventId: String,
    candidateEventId: String
  },
  reminders: [{
    type: {
      type: String,
      enum: ['email', 'sms']
    },
    sentAt: Date
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate interview ID before saving - FIXED VERSION
interviewSchema.pre('save', async function(next) {
  try {
    // Only generate if this is a new document and interviewId is not set
    if (this.isNew && !this.interviewId) {
      const year = new Date().getFullYear();
      
      // Find the latest interview to get the next number
      const lastInterview = await mongoose.model('Interview')
        .findOne({ interviewId: new RegExp(`INT-${year}-`, 'i') })
        .sort({ interviewId: -1 });
      
      let nextNumber = 1;
      if (lastInterview && lastInterview.interviewId) {
        const parts = lastInterview.interviewId.split('-');
        if (parts.length === 3) {
          const lastNumber = parseInt(parts[2]);
          if (!isNaN(lastNumber)) {
            nextNumber = lastNumber + 1;
          }
        }
      }
      
      this.interviewId = `INT-${year}-${nextNumber.toString().padStart(5, '0')}`;
      console.log(`✅ Generated interviewId: ${this.interviewId}`);
    }
    next();
  } catch (error) {
    console.error('❌ Error generating interviewId:', error);
    next(error);
  }
});

// Set candidateId and jobId from application before saving
interviewSchema.pre('save', async function(next) {
  if (this.isNew && this.applicationId && (!this.candidateId || !this.jobId)) {
    try {
      const Application = mongoose.model('Application');
      const application = await Application.findById(this.applicationId)
        .populate('candidateId')
        .populate('jobId');
      
      if (application) {
        if (!this.candidateId) this.candidateId = application.candidateId._id;
        if (!this.jobId) this.jobId = application.jobId._id;
      }
    } catch (error) {
      console.error('Error fetching application:', error);
    }
  }
  next();
});

// Indexes
interviewSchema.index({ interviewId: 1 });
interviewSchema.index({ applicationId: 1 });
interviewSchema.index({ candidateId: 1 });
interviewSchema.index({ jobId: 1 });
interviewSchema.index({ scheduledAt: 1 });
interviewSchema.index({ status: 1 });
interviewSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Interview', interviewSchema);