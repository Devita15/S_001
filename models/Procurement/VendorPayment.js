// models/VendorPayment.js
const mongoose = require('mongoose');

const paymentAllocationSchema = new mongoose.Schema({
  purchase_invoice_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseInvoice',
    required: true
  },
  invoice_number: {
    type: String,
    required: true
  },
  invoice_date: {
    type: Date,
    required: true
  },
  invoice_amount: {
    type: Number,
    required: true,
    min: 0
  },
  allocated_amount: {
    type: Number,
    required: true,
    min: 0
  },
  tds_adjusted: {
    type: Number,
    default: 0,
    min: 0
  },
  balance_after_allocation: {
    type: Number,
    default: 0,
    min: 0
  },
  allocated_at: {
    type: Date,
    default: Date.now
  },
  allocated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { _id: true });

const vendorPaymentSchema = new mongoose.Schema({
  // ==== PAYMENT IDENTITY ============
  vendor_payment_id: {
    type: String,
    sparse: true,
    unique: true,
    index: true
  },
  vendor_payment_number: {
    type: String,
    sparse: true,
    unique: true,
    index: true
  },
  payment_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // ==== VENDOR DETAILS ============
  vendor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  vendor_name: {
    type: String,
    required: true
  },
  vendor_gstin: {
    type: String
  },
  vendor_pan: {
    type: String
  },
  vendor_bank_details: {
    bank_name: String,
    account_no: String,
    ifsc: String,
    account_name: String
  },
  
  // ==== PAYMENT DETAILS ============
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  payment_mode: {
    type: String,
    enum: ['NEFT', 'RTGS', 'IMPS', 'Cheque', 'DD', 'Cash', 'UPI', 'MSME Portal', 'LC', 'Bank Transfer'],
    required: true
  },
  reference_no: {
    type: String,  // UTR for NEFT/RTGS, Cheque number, UPI transaction ID
    required: true
  },
  reference_date: {
    type: Date  // Date on cheque, date of transaction
  },
  
  // ==== BANK DETAILS ============
  from_bank_account: {
    bank_name: String,
    account_no: String,
    ifsc: String,
    account_type: {
      type: String,
      enum: ['Current', 'Savings', 'Cash Credit', 'Overdraft']
    }
  },
  bank_charges: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // ==== TDS DETAILS ============
  tds_applicable: {
    type: Boolean,
    default: false
  },
  tds_section: {
    type: String,
    enum: ['194C', '194Q', '194J', '194I', '194H', null]
  },
  tds_rate: {
    type: Number,
    min: 0,
    default: 0
  },
  tds_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  tds_certificate_required: {
    type: Boolean,
    default: false
  },
  tds_certificate_received: {
    type: Boolean,
    default: false
  },
  tds_certificate_no: {
    type: String
  },
  tds_certificate_date: {
    type: Date
  },
  tds_certificate_path: {
    type: String
  },
  
  // ==== NET AMOUNT ============
  net_paid: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // ==== INVOICES BEING PAID ============
  purchase_invoice_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseInvoice'
  }],
  allocations: [paymentAllocationSchema],
  
  // ==== PAYMENT STATUS ============
  status: {
    type: String,
    enum: ['Pending', 'Initiated', 'Paid', 'Bounced', 'Cancelled', 'Failed'],
    default: 'Pending'
  },
  
  // ==== BOUNCE / FAILURE DETAILS ============
  bounce_reason: {
    type: String,
    enum: ['Insufficient Funds', 'Account Closed', 'Invalid Account', 'Technical Issue', 'Other', null]
  },
  bounce_remarks: {
    type: String
  },
  bounce_date: {
    type: Date
  },
  bounce_charges: {
    type: Number,
    default: 0
  },
  reversal_date: {
    type: Date
  },
  reversal_reference: {
    type: String
  },
  
  // ==== APPROVAL ============
  requires_approval: {
    type: Boolean,
    default: function() {
      return this.amount > 50000; // Default threshold ₹50,000
    }
  },
  approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approved_at: {
    type: Date
  },
  approval_remarks: {
    type: String
  },
  
  // ==== RECEIPT DOCUMENT ============
  payment_receipt_path: {
    type: String  // Generated payment receipt PDF
  },
  bank_statement_path: {
    type: String  // Uploaded bank statement proof
  },
  
  // ==== REMARKS ============
  remarks: {
    type: String
  },
  internal_notes: {
    type: String
  },
  
  // ==== GL POSTING ============
  gl_posting_done: {
    type: Boolean,
    default: false
  },
  gl_posting_date: {
    type: Date
  },
  gl_journal_entry_id: {
    type: String
  },
  
  // ==== AUDIT ============
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
  },
  verified_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verified_at: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Generate payment number before saving
vendorPaymentSchema.pre('save', async function(next) {
  if (!this.vendor_payment_number) {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const count = await this.constructor.countDocuments() + 1;
    this.vendor_payment_number = `VP-${year}${month}-${count.toString().padStart(4, '0')}`;
  }
  
  if (!this.vendor_payment_id) {
    this.vendor_payment_id = this.vendor_payment_number;
  }
  
  // Calculate net paid
  this.net_paid = this.amount - (this.tds_amount + this.bank_charges);
  
  next();
});

// Indexes
vendorPaymentSchema.index({ vendor_payment_number: 1 });
vendorPaymentSchema.index({ vendor_id: 1, payment_date: -1 });
vendorPaymentSchema.index({ status: 1 });
vendorPaymentSchema.index({ reference_no: 1 });
vendorPaymentSchema.index({ payment_date: 1 });

module.exports = mongoose.model('VendorPayment', vendorPaymentSchema);