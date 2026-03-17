const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  candidateId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  alternativePhone: String,
  dateOfBirth: Date,
  gender: {
    type: String,
    enum: ['M', 'F', 'O']
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    pincode: String
  },
  education: [{
    degree: String,
    institution: String,
    yearOfPassing: Number,
    percentage: Number,
    specialization: String
  }],
  experience: [{
    company: String,
    position: String,
    fromDate: Date,
    toDate: Date,
    current: Boolean,
    description: String
  }],
  skills: [String],
  resume: {
    filename: String,
    fileUrl: String,
    uploadedAt: Date,
    parsedData: mongoose.Schema.Types.Mixed
  },
  source: {
    type: String,
    enum: ['naukri', 'linkedin', 'indeed', 'walkin', 'reference', 'careerPage', 'other'], // Added 'upload' here
    required: true
  },
  sourceUrl: String,
  referredBy: String,
  status: {
    type: String,
    enum: ['new', 'contacted', 'shortlisted', 'interviewed', 'selected', 'rejected', 'onHold', 'joined'],
    default: 'new'
  },
  tags: [String],
  notes: [{
    text: String,
    createdBy: mongoose.Schema.Types.ObjectId,
    createdByName: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate candidate ID before saving
candidateSchema.pre('save', async function(next) {
  try {
    if (this.isNew && !this.candidateId) {
      const year = new Date().getFullYear();
      const lastCandidate = await mongoose.model('Candidate')
        .findOne({ candidateId: new RegExp(`CAN-${year}-`, 'i') })
        .sort({ candidateId: -1 });
      
      let nextNumber = 1;
      if (lastCandidate && lastCandidate.candidateId) {
        const parts = lastCandidate.candidateId.split('-');
        if (parts.length === 3) {
          const lastNumber = parseInt(parts[2]);
          if (!isNaN(lastNumber)) {
            nextNumber = lastNumber + 1;
          }
        }
      }
      
      this.candidateId = `CAN-${year}-${nextNumber.toString().padStart(5, '0')}`;
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Virtual for full name
candidateSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('Candidate', candidateSchema);