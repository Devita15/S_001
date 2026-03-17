const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  company_id: {
    type: String,
    required: [true, 'Company ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  company_name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true
  },
  gstin: {
    type: String,
    required: [true, 'GSTIN is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  pan: {
    type: String,
    required: [true, 'PAN is required'],
    trim: true,
    uppercase: true
  },
  address: {
    type: String,
    required: [true, 'Address is required']
  },
  state: {
    type: String,
    required: [true, 'State is required']
  },
  state_code: {
    type: Number,
    required: [true, 'State code is required']
  },
  phone: {
    type: String,
    required: [true, 'Phone is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true
  },
  bank_details: {
    bank_name: String,
    account_no: String,
    ifsc: String,
    branch: String
  },
  logo_path: {
    type: String,
    default: ''
  },
  is_active: {
    type: Boolean,
    default: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Company', companySchema);