const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  CustomerCode: {
    type: String,
    required: [true, 'Customer code is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  CustomerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  BillingAddress: {
    type: String,
    required: [true, 'Billing address is required']
  },
  ShippingAddress: {
    type: String,
    required: [true, 'Shipping address is required']
  },
  GSTIN: {
    type: String,
    required: [true, 'GSTIN is required'],
    unique: true,
    match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Please enter a valid GSTIN']
  },
  State: {
    type: String,
    required: [true, 'State is required']
  },
  StateCode: {
    type: Number,
    required: [true, 'State code is required'],
    min: 1,
    max: 37
  },
  ContactPerson: {
    type: String,
    required: [true, 'Contact person is required']
  },
  Phone: {
    type: String,
    required: [true, 'Phone number is required']
  },
  Email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true
  },
  IsActive: {
    type: Boolean,
    default: true
  },
  CreatedAt: {
    type: Date,
    default: Date.now
  },
  UpdatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' }
});

module.exports = mongoose.model('Customer', customerSchema);