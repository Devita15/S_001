const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  vendor_id: {
    type: String,
    required: [true, 'Vendor ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  vendor_code: {
    type: String,
    required: [true, 'Vendor code is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  vendor_name: {
    type: String,
    required: [true, 'Vendor name is required'],
    trim: true
  },
  vendor_type: {
    type: String,
    required: [true, 'Vendor type is required'],
    enum: ['RM', 'Process', 'Both'],
    default: 'Both'
  },
  address: {
    type: String,
    required: [true, 'Address is required']
  },
  gstin: {
    type: String,
    required: [true, 'GSTIN is required'],
    trim: true,
    uppercase: true
  },
  state: {
    type: String,
    required: [true, 'State is required']
  },
  state_code: {
    type: Number,
    required: [true, 'State code is required']
  },
  contact_person: {
    type: String,
    required: [true, 'Contact person is required']
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
module.exports = mongoose.model('Vendor', vendorSchema);