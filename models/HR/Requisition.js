const mongoose = require('mongoose');

const requisitionSchema = new mongoose.Schema({
  requisitionId: {
    type: String,
   // required: true,
    unique: true,
    trim: true
  },
  department: {
    type: String,
    required: [true, 'Department is required'],
    trim: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true
  },
  positionTitle: {
    type: String,
    required: [true, 'Position title is required'],
    trim: true
  },
  noOfPositions: {
    type: Number,
    required: [true, 'Number of positions is required'],
    min: [1, 'At least 1 position required']
  },
  employmentType: {
    type: String,
    required: true,
    enum: ['Permanent', 'Contract', 'Temporary', 'Internship'],
    default: 'Permanent'
  },
  reasonForHire: {
    type: String,
    required: [true, 'Reason for hire is required'],
    enum: ['New Unit', 'Replacement', 'New Position', 'Project Based', 'Others']
  },
  education: {
    type: String,
    required: [true, 'Education requirement is required'],
    trim: true
  },
  experienceYears: {
    type: Number,
    required: [true, 'Experience years is required'],
    min: 0,
    max: 50
  },
  skills: [{
    type: String,
    trim: true
  }],
  budgetMin: {
    type: Number,
    required: [true, 'Minimum budget is required'],
    min: 0
  },
  budgetMax: {
    type: Number,
    required: [true, 'Maximum budget is required'],
    min: 0,
    validate: {
      validator: function(value) {
        return value >= this.budgetMin;
      },
      message: 'Maximum budget must be greater than or equal to minimum budget'
    }
  },
  grade: {
    type: String,
    required: [true, 'Grade is required'],
    trim: true
  },
  justification: {
    type: String,
    required: [true, 'Justification is required'],
    trim: true,
    maxlength: 2000
  },
  status: {
    type: String,
    required: true,
    enum: [ 'pending_approval', 'approved', 'rejected', 'cancelled', 'in_progress', 'filled'],
    default: 'pending_approval'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByName: {
    type: String,
    required: true
  },
  createdByRole: {
    type: String,
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedByName: String,
  approvalDate: Date,
  approvalSignature: String,
  rejectionReason: String,
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  targetHireDate: Date,
  actualHireDate: Date,
  hiredPositions: {
    type: Number,
    default: 0
  },
  attachments: [{
    filename: String,
    fileUrl: String,
    uploadedBy: mongoose.Schema.Types.ObjectId,
    uploadedAt: Date
  }],
  comments: [{
    text: String,
    userId: mongoose.Schema.Types.ObjectId,
    userName: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Generate requisition ID before saving
requisitionSchema.pre('save', async function(next) {
  if (this.isNew && !this.requisitionId) {
    const year = new Date().getFullYear();
    
    // Find the highest existing requisition number for this year
    const lastRequisition = await mongoose.model('Requisition')
      .findOne({
        requisitionId: new RegExp(`^REQ-${year}-`)
      })
      .sort({ requisitionId: -1 });
    
    let nextNumber = 1;
    if (lastRequisition) {
      // Extract the number from the last requisition ID (e.g., 0010 from REQ-2026-0010)
      const lastNumber = parseInt(lastRequisition.requisitionId.split('-')[2]);
      nextNumber = lastNumber + 1;
    }
    
    this.requisitionId = `REQ-${year}-${nextNumber.toString().padStart(4, '0')}`;
  }
  next();
});

// Indexes
requisitionSchema.index({ requisitionId: 1 });
requisitionSchema.index({ status: 1 });
requisitionSchema.index({ createdBy: 1 });
requisitionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Requisition', requisitionSchema);