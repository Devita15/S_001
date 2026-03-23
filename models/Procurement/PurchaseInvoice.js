// models/PurchaseInvoice.js
const mongoose = require('mongoose');

const purchaseInvoiceItemSchema = new mongoose.Schema({
  po_item_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  grn_item_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  part_no: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  hsn_code: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    enum: ['Nos', 'Kg', 'Meter', 'Set', 'Piece', 'Sheet', 'Roll'],
    required: true
  },
  unit_price: {
    type: Number,
    required: true,
    min: 0
  },
  po_unit_price: {
    type: Number,
    min: 0
  },
  discount_percent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  discount_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  taxable_amount: {
    type: Number,
    required: true,
    min: 0
  },
  gst_percent: {
    type: Number,
    required: true,
    min: 0
  },
  cgst_percent: {
    type: Number,
    default: 0,
    min: 0
  },
  sgst_percent: {
    type: Number,
    default: 0,
    min: 0
  },
  igst_percent: {
    type: Number,
    default: 0,
    min: 0
  },
  cgst_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  sgst_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  igst_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  total_gst_amount: {
    type: Number,
    required: true,
    min: 0
  },
  total_amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Three-way match fields
  match_status: {
    type: String,
    enum: ['Matched', 'Price Mismatch', 'Exception','Quantity Mismatch', 'Not Checked'],
    default: 'Not Checked'
  },
  match_notes: {
    type: String
  },
  
  // GRN reference
  grn_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GRN'
  },
  grn_number: {
    type: String
  }
}, { _id: true });

const allocationEntrySchema = new mongoose.Schema({
  invoice_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseInvoice'
  },
  invoice_number: String,
  allocated_amount: {
    type: Number,
    required: true,
    min: 0
  },
  allocated_at: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const purchaseInvoiceSchema = new mongoose.Schema({
  // ==== INVOICE IDENTITY ============
  purchase_invoice_id: {
    type: String,
    sparse: true,
    unique: true,
    index: true
  },
  purchase_invoice_number: {
    type: String,
   sparse: true,
    unique: true,
    index: true
  },
  invoice_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  financial_year: {
    type: String
  },
  
  // ==== VENDOR INVOICE DETAILS ============
  vendor_invoice_no: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  vendor_invoice_date: {
    type: Date,
    required: true
  },
  vendor_invoice_copy_path: {
    type: String  // Scanned copy of vendor invoice
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
    type: String,
    required: true
  },
  vendor_pan: {
    type: String
  },
  vendor_state: {
    type: String
  },
  vendor_state_code: {
    type: Number
  },
  vendor_address: {
    type: String
  },
  
  // ==== SOURCE DOCUMENTS ============
  po_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true
  },
  po_number: {
    type: String,
    required: true
  },
  grn_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GRN'
  }],
  grn_numbers: [String],
  
  // ==== COMPANY DETAILS ============
  company_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  company_name: {
    type: String,
    required: true
  },
  company_gstin: {
    type: String,
    required: true
  },
  company_state_code: {
    type: Number,
    required: true
  },
  
  // ==== INVOICE ITEMS ============
  items: [purchaseInvoiceItemSchema],
  
  // ==== TOTALS ============
  taxable_total: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  discount_total: {
    type: Number,
    default: 0,
    min: 0
  },
  cgst_total: {
    type: Number,
    default: 0,
    min: 0
  },
  sgst_total: {
    type: Number,
    default: 0,
    min: 0
  },
  igst_total: {
    type: Number,
    default: 0,
    min: 0
  },
  total_tax: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  grand_total: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  
  // ==== GST TYPE ============
  gst_type: {
    type: String,
    enum: ['CGST/SGST', 'IGST'],
    required: true
  },
  
  // ==== TDS FIELDS ============
  tds_applicable: {
    type: Boolean,
    default: false
  },
  tds_section: {
    type: String,
    enum: ['194C', '194Q', '194J', '194I', '194H', null],
    default: null
  },
  tds_rate: {
    type: Number,
    min: 0,
    default: 0
  },
  tds_amount: {
    type: Number,
    min: 0,
    default: 0
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
  
  // ==== PAYMENT FIELDS ============
  net_payable: {
    type: Number,
    default: 0,
    min: 0
  },
  due_date: {
    type: Date,
    required: true
  },
  paid_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  balance_due: {
    type: Number,
    default: 0,
    min: 0
  },
  payment_status: {
    type: String,
    enum: ['Unpaid', 'Partially Paid', 'Fully Paid', 'Overdue', 'On Hold'],
    default: 'Unpaid'
  },
  
  // ==== ITC (INPUT TAX CREDIT) FIELDS ============
  itc_eligible: {
    type: Boolean,
    default: true
  },
  itc_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  itc_claimed_in: {
    type: String,  // GSTR-3B period, e.g., 'Mar-2025'
    default: null
  },
  itc_claimed_at: {
    type: Date
  },
  
  // ==== THREE-WAY MATCH STATUS ============
  matching_status: {
    type: String,
    enum: ['Not Started', '2-way Matched', '3-way Matched', 'Exception', 'Hold'],
    default: 'Not Started'
  },
  matching_completed_at: {
    type: Date
  },
  matching_completed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // ==== PAYMENT REFERENCES ============
  payment_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VendorPayment'
  }],
  allocations: [allocationEntrySchema],
  
  // ==== STATUS ============
  status: {
    type: String,
    enum: ['Pending', 'Under Verification', 'Approved', 'Rejected', 'Posted', 'Cancelled'],
    default: 'Pending'
  },
  approval_remarks: {
    type: String
  },
  rejection_reason: {
    type: String
  },
  cancellation_reason: {
    type: String
  },
  cancelled_at: {
    type: Date
  },
  cancelled_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
  
  // ==== DOCUMENTS ============
  invoice_pdf_path: {
    type: String
  },
  
  // ==== REMARKS ============
  internal_remarks: {
    type: String
  },
  notes: {
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
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Generate invoice number before saving
purchaseInvoiceSchema.pre('save', async function(next) {
  if (!this.purchase_invoice_number) {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const count = await this.constructor.countDocuments() + 1;
    this.purchase_invoice_number = `PI-${year}${month}-${count.toString().padStart(4, '0')}`;
  }
  
  if (!this.purchase_invoice_id) {
    this.purchase_invoice_id = this.purchase_invoice_number;
  }
  
  // Set financial year (India: Apr-Mar)
  const invoiceDate = this.invoice_date || new Date();
  const year = invoiceDate.getFullYear();
  const month = invoiceDate.getMonth() + 1;
  
  if (month >= 4) {
    this.financial_year = `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    this.financial_year = `${year - 1}-${year.toString().slice(-2)}`;
  }
  
  // Calculate totals
  let taxableTotal = 0;
  let discountTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;
  
  this.items.forEach(item => {
    taxableTotal += item.taxable_amount;
    discountTotal += item.discount_amount || 0;
    cgstTotal += item.cgst_amount || 0;
    sgstTotal += item.sgst_amount || 0;
    igstTotal += item.igst_amount || 0;
  });
  
  this.taxable_total = taxableTotal;
  this.discount_total = discountTotal;
  this.cgst_total = cgstTotal;
  this.sgst_total = sgstTotal;
  this.igst_total = igstTotal;
  this.total_tax = cgstTotal + sgstTotal + igstTotal;
  this.grand_total = this.taxable_total + this.total_tax;
  
  // Calculate net payable and balance
  this.net_payable = this.grand_total - this.tds_amount;
  this.balance_due = this.grand_total - this.paid_amount;
  
  // Update payment status
  if (this.balance_due <= 0) {
    this.payment_status = 'Fully Paid';
  } else if (this.paid_amount > 0) {
    this.payment_status = 'Partially Paid';
  }
  
  next();
});

// Method to perform three-way match
purchaseInvoiceSchema.methods.performThreeWayMatch = async function() {
  const PurchaseOrder = mongoose.model('PurchaseOrder');
  const GRN = mongoose.model('GRN');
  
  const po = await PurchaseOrder.findById(this.po_id);
  const grns = await GRN.find({ _id: { $in: this.grn_ids } });
  
  let allMatched = true;
  let matchMessages = [];
  
  // For each item in invoice
  for (const item of this.items) {
    // Find corresponding PO item
    const poItem = po.items.find(i => i._id.toString() === item.po_item_id.toString());
    
    if (!poItem) {
      item.match_status = 'Quantity Mismatch';
      item.match_notes = 'PO item not found';
      allMatched = false;
      continue;
    }
    
    // Check price match
    const priceDiff = Math.abs(item.unit_price - poItem.unit_price);
    if (priceDiff > 0.01) { // Allow 1 paisa difference due to rounding
      item.match_status = 'Price Mismatch';
      item.match_notes = `PO price: ${poItem.unit_price}, Invoice price: ${item.unit_price}`;
      allMatched = false;
      continue;
    }
    
    // Check quantity against GRN
    let totalGRNQty = 0;
    for (const grn of grns) {
      const grnItem = grn.items.find(i => i.po_item_id.toString() === item.po_item_id.toString());
      if (grnItem) {
        totalGRNQty += grnItem.accepted_qty;
      }
    }
    
    if (Math.abs(item.quantity - totalGRNQty) > 0.01) {
      item.match_status = 'Quantity Mismatch';
      item.match_notes = `GRN accepted: ${totalGRNQty}, Invoice qty: ${item.quantity}`;
      allMatched = false;
      continue;
    }
    
    // All checks passed
    item.match_status = 'Matched';
    item.po_unit_price = poItem.unit_price;
  }
  
  this.matching_status = allMatched ? '3-way Matched' : 'Exception';
  this.matching_completed_at = new Date();
  
  return {
    matched: allMatched,
    messages: matchMessages
  };
};

// Indexes
purchaseInvoiceSchema.index({ purchase_invoice_number: 1 });
purchaseInvoiceSchema.index({ vendor_invoice_no: 1, vendor_id: 1 }, { unique: true });
purchaseInvoiceSchema.index({ vendor_id: 1, invoice_date: -1 });
purchaseInvoiceSchema.index({ status: 1, payment_status: 1 });
purchaseInvoiceSchema.index({ due_date: 1 });
purchaseInvoiceSchema.index({ po_id: 1 });
purchaseInvoiceSchema.index({ financial_year: 1 });

module.exports = mongoose.model('PurchaseInvoice', purchaseInvoiceSchema);