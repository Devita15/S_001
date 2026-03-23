const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  offerId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate',
    required: true
  },
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    required: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobOpening',
    required: true
  },
  requisitionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Requisition'
  },
  offerDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['initiated', 'pending_approval', 'sent', 'approved', 'rejected', 'accepted', 'declined', 'expired'],
    default: 'initiated'
  },
  ctcDetails: {
    basic: { type: Number, required: true },
    hra: { type: Number, default: 0 },
    conveyanceAllowance: { type: Number, default: 0 },
    medicalAllowance: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    gratuity: { type: Number, default: 0 },
    employerPf: { type: Number, default: 0 },
    employerEsi: { type: Number, default: 0 },
    otherAllowances: { type: Number, default: 0 },
    gross: { type: Number },
    totalCtc: { type: Number },
    currency: { type: String, default: 'INR' }
  },
  offerDetails: {
    designation: String,
    department: String,
    location: String,
    reportingTo: String,
    employmentType: {
      type: String,
      enum: ['Permanent', 'Contract', 'Temporary', 'Internship']
    },
    probationPeriod: { type: Number, default: 6 },
    noticePeriod: { type: Number, default: 30 },
    joiningDate: Date,
    workingHours: String,
    benefits: [String]
  },
  documents: [{
    type: {
      type: String,
      enum: ['offer_letter', 'appointment_letter', 'ctc_breakdown', 'other']
    },
    fileUrl: String,
    filename: String,
    uploadedAt: Date,
    generatedAt: Date
  }],
  approvalFlow: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OfferApprovalFlow'
  },
  acceptance: {
    acceptedAt: Date,
    ipAddress: String,
    userAgent: String,
    signature: String,
    signatureType: {
      type: String,
      enum: ['digital', 'image', 'text']
    },
    token: String,
    tokenExpiry: Date
  },
  expiryDate: Date,
  reminderSent: {
    type: Boolean,
    default: false
  },
  reminderSentAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByName: String,
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Calculate CTC totals before saving
offerSchema.pre('save', function(next) {
  if (this.ctcDetails) {
    const {
      basic, hra, conveyanceAllowance, medicalAllowance, specialAllowance,
      bonus, gratuity, employerPf, employerEsi, otherAllowances
    } = this.ctcDetails;

    // Calculate gross
    this.ctcDetails.gross = (
      (basic || 0) +
      (hra || 0) +
      (conveyanceAllowance || 0) +
      (medicalAllowance || 0) +
      (specialAllowance || 0) +
      (otherAllowances || 0)
    );

    // Calculate total CTC
    this.ctcDetails.totalCtc = (
      this.ctcDetails.gross +
      (bonus || 0) +
      (gratuity || 0) +
      (employerPf || 0) +
      (employerEsi || 0)
    );
  }
  next();
});

// Indexes
offerSchema.index({ offerId: 1 });
offerSchema.index({ candidateId: 1 });
offerSchema.index({ status: 1 });
offerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Offer', offerSchema);