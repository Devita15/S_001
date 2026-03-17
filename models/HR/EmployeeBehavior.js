// models/EmployeeBehavior.js
const mongoose = require('mongoose');

const employeeBehaviorSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'Employee ID is required']
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Submitted by user ID is required']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Discipline',
      'Teamwork', 
      'Performance',
      'Attitude',
      'Attendance Behavior',
      'Safety Compliance',
      'Production Attitude',
      'Supervisor Feedback',
      'Punctuality',
      'Quality of Work',
      'Initiative',
      'Communication'
    ],
    default: 'Performance'
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required'],
    min: 1,
    max: 5
  },
  type: {
    type: String,
    required: [true, 'Type is required'],
    enum: ['Positive', 'Negative', 'Neutral'],
    default: 'Neutral'
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: 1000
  },
  actionTaken: {
    type: String,
    enum: [
      'None',
      'Verbal Warning',
      'Written Warning', 
      'Counseling',
      'Appreciation',
      'Recognition',
      'Improvement Plan',
      'Suspension',
      'Termination',
      'Coaching',
      'Final Warning'
    ],
    default: 'None'
  },
  status: {
    type: String,
    enum: ['Open', 'Resolved', 'Escalated', 'Closed'],
    default: 'Open'
  },
  reviewDate: {
    type: Date
  },
  resolvedAt: {
    type: Date
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolutionNotes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  attachments: [{
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    filePath: {
      type: String,
      required: true
    },
    fileSize: {
      type: Number,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],
  isConfidential: {
    type: Boolean,
    default: false
  },
  tags: [String],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletionReason: {
    type: String,
    trim: true
  },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Indexes for better query performance
employeeBehaviorSchema.index({ employeeId: 1, createdAt: -1 });
employeeBehaviorSchema.index({ submittedBy: 1 });
employeeBehaviorSchema.index({ status: 1 });
employeeBehaviorSchema.index({ category: 1 });
employeeBehaviorSchema.index({ type: 1 });
employeeBehaviorSchema.index({ rating: 1 });

// Virtual for average rating (for aggregate queries)
employeeBehaviorSchema.virtual('ratingStars').get(function() {
  return '★'.repeat(this.rating) + '☆'.repeat(5 - this.rating);
});

// Pre-save middleware to auto-set type based on rating if not specified
employeeBehaviorSchema.pre('save', function(next) {
  if (!this.type) {
    if (this.rating >= 4) {
      this.type = 'Positive';
    } else if (this.rating <= 2) {
      this.type = 'Negative';
    } else {
      this.type = 'Neutral';
    }
  }
  
  // Auto-escalate if negative with low rating
  if (this.type === 'Negative' && this.rating <= 2 && this.status === 'Open') {
    this.status = 'Escalated';
  }
  
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('EmployeeBehavior', employeeBehaviorSchema);