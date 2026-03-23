// models/VendorPerformance.js
const mongoose = require('mongoose');

const vendorPerformanceSchema = new mongoose.Schema({
  // ==== IDENTITY ============
  performance_id: {
    type: String,
    required: true,
    unique: true
  },
  
  // ==== VENDOR ============
  vendor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  vendor_name: {
    type: String,
    required: true
  },
  
  // ==== PERIOD ============
  period: {
    type: String,  // e.g., 'Mar-2025', 'Q1-2025', '2024-25'
    required: true
  },
  period_type: {
    type: String,
    enum: ['Monthly', 'Quarterly', 'Yearly'],
    required: true
  },
  financial_year: {
    type: String
  },
  
  // ==== PURCHASE SUMMARY ============
  total_po_count: {
    type: Number,
    default: 0
  },
  total_po_value: {
    type: Number,
    default: 0
  },
  total_invoice_value: {
    type: Number,
    default: 0
  },
  
  // ==== DELIVERY PERFORMANCE ============
  on_time_delivery_count: {
    type: Number,
    default: 0
  },
  late_delivery_count: {
    type: Number,
    default: 0
  },
  on_time_delivery_percent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  average_delay_days: {
    type: Number,
    default: 0
  },
  
  // ==== QUALITY PERFORMANCE ============
  total_received_qty: {
    type: Number,
    default: 0
  },
  total_accepted_qty: {
    type: Number,
    default: 0
  },
  total_rejected_qty: {
    type: Number,
    default: 0
  },
  rejection_percent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  ncr_count: {
    type: Number,
    default: 0
  },
  critical_ncr_count: {
    type: Number,
    default: 0
  },
  major_ncr_count: {
    type: Number,
    default: 0
  },
  minor_ncr_count: {
    type: Number,
    default: 0
  },
  
  // ==== PRICE PERFORMANCE ============
  total_rfq_count: {
    type: Number,
    default: 0
  },
  l1_count: {
    type: Number,
    default: 0
  },
  l1_percent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  average_price_index: {
    type: Number,  // Compared to market average (100 = market avg)
    default: 100
  },
  
  // ==== COMPOSITE RATINGS ============
  delivery_rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  quality_rating: {
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
  
  // ==== DETAILS ============
  po_details: [{
    po_number: String,
    po_date: Date,
    po_value: Number,
    delivery_date: Date,
    actual_delivery_date: Date,
    on_time: Boolean,
    delay_days: Number
  }],
  
  ncr_details: [{
    ncr_number: String,
    ncr_date: Date,
    severity: String,
    rejection_qty: Number,
    value: Number
  }],
  
  // ==== REMARKS ============
  remarks: {
    type: String
  },
  improvement_areas: [String],
  strengths: [String],
  
  // ==== AUDIT ============
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

// Generate performance ID
vendorPerformanceSchema.pre('save', async function(next) {
  if (!this.performance_id) {
    this.performance_id = `VPF-${this.vendor_id.toString().slice(-6)}-${this.period.replace(/[^a-zA-Z0-9]/g, '')}`;
  }
  
  // Calculate ratings
  this.delivery_rating = (this.on_time_delivery_percent / 100) * 5;
  this.quality_rating = 5 - (this.rejection_percent / 100) * 5;
  if (this.quality_rating < 0) this.quality_rating = 0;
  
  this.price_rating = (this.l1_percent / 100) * 5;
  
  // Overall rating (weighted average)
  this.overall_rating = (
    this.delivery_rating * 0.3 +
    this.quality_rating * 0.5 +
    this.price_rating * 0.2
  ).toFixed(1);
  
  next();
});

// Indexes
vendorPerformanceSchema.index({ vendor_id: 1, period: 1 }, { unique: true });
vendorPerformanceSchema.index({ overall_rating: -1 });
vendorPerformanceSchema.index({ period_type: 1 });

module.exports = mongoose.model('VendorPerformance', vendorPerformanceSchema);