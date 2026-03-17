const mongoose = require('mongoose');

const statutoryDetailsSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    unique: true
  },
  pan: {
    type: String,
    uppercase: true,
    trim: true,
    match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format']
  },
  aadhar: {
    type: String,
    trim: true,
    match: [/^\d{12}$/, 'Aadhar must be 12 digits']
  },
  uan: {
    type: String,
    trim: true
  },
  pfNumber: {
    type: String,
    trim: true
  },
  pfJoiningDate: Date,
  pfStatus: {
    type: String,
    enum: ['active', 'inactive', 'transferred']
  },
  esicNumber: {
    type: String,
    trim: true
  },
  esicJoiningDate: Date,
  esicStatus: {
    type: String,
    enum: ['active', 'inactive']
  },
  professionalTax: {
    applicable: { type: Boolean, default: true },
    exemption: { type: Boolean, default: false },
    exemptionCertificate: String
  },
  labourWelfareFund: {
    applicable: { type: Boolean, default: false },
    amount: Number
  },
  gratuity: {
    applicable: { type: Boolean, default: true },
    joiningDate: Date,
    eligibilityDate: Date
  },
  bankDetails: {
    accountNumber: String,
    accountHolderName: String,
    bankName: String,
    branch: String,
    ifscCode: String,
    accountType: {
      type: String,
      enum: ['Savings', 'Current']
    }
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifiedAt: Date,
  documents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('StatutoryDetails', statutoryDetailsSchema);