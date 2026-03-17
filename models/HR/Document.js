const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  documentId: {
    type: String,
    //required: true,
    unique: true,
    trim: true
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate'
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Offer'
  },
  type: {
    type: String,
    enum: [
      'resume', 'offer_letter', 'appointment_letter', 'ctc_breakdown',
      'aadhar', 'pan', 'passport', 'voter_id', 'driving_license',
      'educational_certificate', 'experience_certificate', 'salary_slip',
      'bank_statement', 'photograph', 'other'
    ],
    required: true
  },
  filename: String,
  originalFilename: String,
  fileUrl: String,
  fileSize: Number,
  mimeType: String,
  version: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['generated', 'sent', 'accepted', 'pending', 'verified', 'rejected', 'expired'],
    default: 'generated'
  },
  verificationDetails: {
    verifiedBy: mongoose.Schema.Types.ObjectId,
    verifiedByName: String,
    verifiedAt: Date,
    comments: String,
    rejectionReason: String
  },
  metadata: {
    uploadedFrom: String,
    ipAddress: String,
    userAgent: String
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  signingToken: {
    type: String,
    sparse: true,
    unique: true
  },
  tokenExpiry: {
    type: Date
  },
  signedAt: {
    type: Date
  },
  signature: {
    type: String
  },
  signedCopyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  },
  generatedAt: {
    type: Date
  },
  sentAt: {
    type: Date
  },
  acceptedAt: {
    type: Date
  },
  accessToken: String,
  accessTokenExpiry: Date,
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Generate document ID before saving
documentSchema.pre('save', async function(next) {
  if (this.isNew && !this.documentId) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('Document').countDocuments();
    this.documentId = `DOC-${year}-${(count + 1).toString().padStart(6, '0')}`;
  }
  next();
});

// Indexes
documentSchema.index({ documentId: 1 });
documentSchema.index({ candidateId: 1 });
documentSchema.index({ employeeId: 1 });
documentSchema.index({ offerId: 1 });
documentSchema.index({ status: 1 });
documentSchema.index({ accessToken: 1 });

module.exports = mongoose.model('Document', documentSchema);