const mongoose = require('mongoose');

const backgroundVerificationSchema = new mongoose.Schema({
  bgvId: {
    type: String,
   // required: true,
    unique: true,
    trim: true
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidate',
    required: true
  },
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Offer'
  },
  vendor: {
    type: String,
    enum: ['authbridge', 'firstadvantage', 'hireright', 'other'],
    default: 'authbridge'
  },
  vendorRequestId: String,
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'failed', 'disputed'],
    default: 'pending'
  },
  checks: [{
    type: {
      type: String,
      enum: [
        'identity', 'address', 'education', 'employment',
        'criminal', 'reference', 'drug_test', 'credit_check'
      ]
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'cleared', 'discrepancy', 'failed']
    },
    result: mongoose.Schema.Types.Mixed,
    completedAt: Date,
    reportUrl: String
  }],
  documents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  }],
  requestData: mongoose.Schema.Types.Mixed,
  responseData: mongoose.Schema.Types.Mixed,
  reportUrl: String,
  reportGeneratedAt: Date,
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  completedAt: Date,
  remarks: String,
  webhookUrl: String,
  webhookEvents: [{
    event: String,
    receivedAt: Date,
    data: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Generate BGV ID before saving
backgroundVerificationSchema.pre('save', async function(next) {
  if (this.isNew && !this.bgvId) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('BackgroundVerification').countDocuments();
    this.bgvId = `BGV-${year}-${(count + 1).toString().padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('BackgroundVerification', backgroundVerificationSchema);