const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  applicationId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobOpening',
    required: true
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate',
    required: true
  },
  appliedDate: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    enum: ['naukri', 'linkedin', 'indeed', 'walkin', 'reference', 'careerPage', 'other'],
    required: true
  },
  status: {
    type: String,
    enum: ['new', 'screening', 'shortlisted', 'interview_scheduled', 'interviewed', 'selected', 'rejected', 'onHold' ,'offered', 'hired', 'withdrawn'],
    default: 'new'
  },
  statusHistory: [{
    status: String,
    changedBy: mongoose.Schema.Types.ObjectId,
    changedByName: String,
    changedAt: {
      type: Date,
      default: Date.now
    },
    notes: String
  }],
  screening: {
    score: Number,
    feedback: String,
    screenedBy: mongoose.Schema.Types.ObjectId,
    screenedAt: Date
  },
  interviews: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interview'
  }],
  offerDetails: {
    offeredSalary: Number,
    offeredDate: Date,
    joiningDate: Date,
    acceptanceDate: Date,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired']
    }
  },
  documents: [{
    type: String,
    fileUrl: String,
    uploadedAt: Date
  }],
  notes: String
}, {
  timestamps: true
});

// Generate application ID before saving
applicationSchema.pre('save', async function(next) {
  try {
    if (this.isNew && !this.applicationId) {
      const year = new Date().getFullYear();
      const lastApp = await mongoose.model('Application')
        .findOne({ applicationId: new RegExp(`APP-${year}-`, 'i') })
        .sort({ applicationId: -1 });
      
      let nextNumber = 1;
      if (lastApp && lastApp.applicationId) {
        const parts = lastApp.applicationId.split('-');
        if (parts.length === 3) {
          const lastNumber = parseInt(parts[2]);
          if (!isNaN(lastNumber)) {
            nextNumber = lastNumber + 1;
          }
        }
      }
      
      this.applicationId = `APP-${year}-${nextNumber.toString().padStart(6, '0')}`;
      console.log(`✅ Generated applicationId: ${this.applicationId}`);
    }
    next();
  } catch (error) {
    console.error('❌ Error generating applicationId:', error);
    next(error);
  }
});


// Add to your applicationSchema
applicationSchema.post('save', async function(doc) {
  try {
    // Only proceed if status is 'hired'
    if (doc.status === 'hired') {
      const Requisition = mongoose.model('Requisition');
      const JobOpening = mongoose.model('JobOpening');
      
      // Get the job to find the requisition
      const job = await JobOpening.findById(doc.jobId);
      if (!job) return;
      
      // Count total hired candidates for this requisition
      const hiredCount = await mongoose.model('Application').countDocuments({
        jobId: { $in: await JobOpening.find({ requisitionId: job.requisitionId }).distinct('_id') },
        status: 'hired'
      });
      
      // Get the requisition
      const requisition = await Requisition.findById(job.requisitionId);
      if (!requisition) return;
      
      // Update hiredPositions count
      requisition.hiredPositions = hiredCount;
      
      // Check if all positions are filled
      if (hiredCount >= requisition.noOfPositions) {
        requisition.status = 'filled';
        requisition.actualHireDate = new Date();
        
        console.log(`✅ Requisition ${requisition.requisitionId} automatically marked as FILLED`);
      }
      
      await requisition.save();
    }
  } catch (error) {
    console.error('Error auto-updating requisition status:', error);
  }
});

module.exports = mongoose.model('Application', applicationSchema);