const mongoose = require('mongoose');

const jobOpeningSchema = new mongoose.Schema({
  jobId: {
    type: String,
   // required: true,
    unique: true,
    trim: true
  },
  requisitionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Requisition',
    required: true
  },
  requisitionNumber: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Job description is required'],
    trim: true
  },
  companyIntro: {
    type: String,
    trim: true
  },
  requirements: [String],
  responsibilities: [String],
  location: {
    type: String,
    default: function() {
      return this._location || '';
    }
  },
  department: {
    type: String,
    default: function() {
      return this._department || '';
    }
  },
  employmentType: {
    type: String,
    enum: ['Permanent', 'Contract', 'Temporary', 'Internship'],
    required: true
  },
  experienceRequired: {
    min: Number,
    max: Number
  },
  salaryRange: {
    min: Number,
    max: Number,
    currency: {
      type: String,
      default: 'INR'
    }
  },
  skills: [String],
  education: [String],
  status: {
    type: String,
    enum: ['open', 'published', 'closed', 'cancelled'],
    default: 'open'
  },
  publishTo: [{
    platform: {
      type: String,
      enum: ['naukri', 'linkedin', 'indeed', 'careerPage']
    },
    status: {
      type: String,
      enum: ['pending', 'published', 'failed', 'expired'],
      default: 'pending'
    },
    jobUrl: String,
    postedAt: Date,
    expiresAt: Date,
    error: String,
    retryCount: {
      type: Number,
      default: 0
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByName: String,
  publishedAt: Date,
  closedAt: Date,
  totalApplications: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate job ID before saving - FIXED VERSION
jobOpeningSchema.pre('save', async function(next) {
  try {
    // Only generate if this is a new document and jobId is not set
    if (this.isNew && !this.jobId) {
      const year = new Date().getFullYear();
      
      // Find the latest job to get the next number
      const lastJob = await mongoose.model('JobOpening')
        .findOne({ jobId: new RegExp(`JOB-${year}-`, 'i') })
        .sort({ jobId: -1 });
      
      let nextNumber = 1;
      if (lastJob && lastJob.jobId) {
        const parts = lastJob.jobId.split('-');
        if (parts.length === 3) {
          const lastNumber = parseInt(parts[2]);
          if (!isNaN(lastNumber)) {
            nextNumber = lastNumber + 1;
          }
        }
      }
      
      this.jobId = `JOB-${year}-${nextNumber.toString().padStart(4, '0')}`;
      console.log(`✅ Generated jobId: ${this.jobId}`);
    }
    next();
  } catch (error) {
    console.error('❌ Error generating jobId:', error);
    next(error);
  }
});

// Set location and department from requisition if not provided
jobOpeningSchema.pre('save', async function(next) {
  if (this.isNew && this.requisitionId && (!this.location || !this.department)) {
    try {
      const Requisition = mongoose.model('Requisition');
      const requisition = await Requisition.findById(this.requisitionId);
      if (requisition) {
        if (!this.location) this.location = requisition.location;
        if (!this.department) this.department = requisition.department;
        if (!this.requisitionNumber) this.requisitionNumber = requisition.requisitionId;
        if (!this.title) this.title = requisition.positionTitle;
        if (!this.employmentType) this.employmentType = requisition.employmentType;
        if (!this.skills || this.skills.length === 0) this.skills = requisition.skills;
        if (!this.salaryRange) {
          this.salaryRange = {
            min: requisition.budgetMin,
            max: requisition.budgetMax,
            currency: 'INR'
          };
        }
        if (!this.experienceRequired) {
          this.experienceRequired = {
            min: requisition.experienceYears,
            max: requisition.experienceYears + 2
          };
        }
      }
    } catch (error) {
      console.error('Error fetching requisition:', error);
    }
  }
  next();
});

// Indexes
jobOpeningSchema.index({ jobId: 1 });
jobOpeningSchema.index({ requisitionId: 1 });
jobOpeningSchema.index({ status: 1 });
jobOpeningSchema.index({ createdAt: -1 });

module.exports = mongoose.model('JobOpening', jobOpeningSchema);