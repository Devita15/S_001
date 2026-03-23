// models/Vendor.js
const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  // ==== EXISTING FIELDS (from your schema) ============
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
    enum: ['Raw Material', 'Consumable', 'Subcontractor', 'Capital Goods', 'Service', 'Utilities', 'Other'],
    default: 'Raw Material'
  },
  supply_category: [{
    type: String,
    trim: true
  }],
  address: {
    type: String,
    required: [true, 'Address is required']
  },
  gstin: {
    type: String,
    required: [true, 'GSTIN is required'],
    trim: true,
    uppercase: true,
    match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/, 'Please enter a valid GSTIN']
  },
  pan: {
    type: String,
    trim: true,
    uppercase: true,
    match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Please enter a valid PAN']
  },
  state: {
    type: String,
    required: [true, 'State is required']
  },
  state_code: {
    type: Number,
    required: [true, 'State code is required'],
    min: 1,
    max: 37
  },
  
  // ==== MSME FIELDS ============
  msme_number: {
    type: String,
    trim: true,
    sparse: true
  },
  msme_category: {
    type: String,
    enum: ['Micro', 'Small', 'Medium', 'Not MSME', null],
    default: null
  },
  
  // ==== CONTACT DETAILS ============
  contact_person: {
    type: String,
    required: [true, 'Contact person is required']
  },
  phone: {
    type: String,
    required: [true, 'Phone is required']
  },
  alternate_phone: {
    type: String
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true
  },
  website: {
    type: String,
    trim: true
  },
  
  // ==== FINANCIAL & CREDIT FIELDS ============
  payment_terms: {
    type: String,
    enum: ['Advance', 'On Delivery', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90', 'LC', 'Custom'],
    default: 'Net 30'
  },
  credit_days: {
    type: Number,
    default: 30,
    min: 0
  },
  currency: {
    type: String,
    enum: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'JPY'],
    default: 'INR'
  },
  bank_details: {
    bank_name: String,
    account_no: String,
    ifsc: String,
    branch: String,
    account_name: String,
    account_type: {
      type: String,
      enum: ['Current', 'Savings', 'Cash Credit', 'Overdraft']
    }
  },
  
  // ==== APPROVED VENDOR LIST (AVL) FIELDS ============
  avl_approved: {
    type: Boolean,
    default: false
  },
  avl_items: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item'
  }],
  avl_approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  avl_approved_at: {
    type: Date
  },
  avl_review_date: {
    type: Date
  },
  
  // ==== PERFORMANCE RATING FIELDS ============
  quality_rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  delivery_rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  price_rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  overall_rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  blacklisted: {
    type: Boolean,
    default: false
  },
  blacklist_reason: {
    type: String
  },
  blacklisted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  blacklisted_at: {
    type: Date
  },
  
  // ==== STATUS FIELDS ============
  is_active: {
    type: Boolean,
    default: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for search
vendorSchema.index({ vendor_name: 'text', vendor_code: 'text', gstin: 1 });
vendorSchema.index({ avl_approved: 1, is_active: 1 });
vendorSchema.index({ vendor_type: 1 });
vendorSchema.index({ state_code: 1 });

module.exports = mongoose.model('Vendor', vendorSchema);