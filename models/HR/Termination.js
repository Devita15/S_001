const mongoose = require('mongoose');

const terminationSchema = new mongoose.Schema({
  terminationId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  employeeID: {
    type: String,
    required: true,
    trim: true
  },
  initiatorType: {
    type: String,
    required: true,
    enum: ['HR', 'EMPLOYEE'],
    default: 'HR'
  },
  terminationType: {
    type: String,
    required: true,
    enum: ['termination', 'resignation', 'retirement']
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  lastWorkingDay: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['pending_review', 'approved', 'rejected', 'cancelled', 'pending'],
    default: 'pending_review'
  },
  reviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  feedback: {
    submitted: {
      type: Boolean,
      default: false
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    submittedAt: Date,
    exitInterview: {
      reasonForLeaving: String,
      experienceWithCompany: {
        type: String,
        enum: ['excellent', 'good', 'average', 'poor']
      },
      wouldRecommend: Boolean,
      feedbackDetails: String,
      suggestionsForImprovement: String,
      rehireEligible: {
        type: Boolean,
        default: true
      }
    }
  },
  approvalDetails: {
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee'
    },
    approvedAt: Date,
    comments: String
  },
  documents: {
    experienceLetter: {
      generated: { type: Boolean, default: false },
      path: String,
      generatedAt: Date
    },
    relievingLetter: {
      generated: { type: Boolean, default: false },
      path: String,
      generatedAt: Date
    }
  },
  settlementDetails: {
    payrollNotified: { type: Boolean, default: false },
    notifiedAt: Date,
    finalSettlementAmount: Number,
    settlementDate: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Generate termination ID before saving
terminationSchema.pre('save', async function(next) {
  if (!this.terminationId) {
    const count = await mongoose.model('Termination').countDocuments();
    const year = new Date().getFullYear();
    this.terminationId = `TERM-${year}-${(count + 1).toString().padStart(4, '0')}`;
  }
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Termination', terminationSchema);