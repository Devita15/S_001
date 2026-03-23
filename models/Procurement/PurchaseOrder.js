// models/Procurement/PurchaseOrder.js
const mongoose = require('mongoose');

const poItemSchema = new mongoose.Schema({
  item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  part_no: {
    type: String,
    required: true,
    uppercase: true
  },
  description: {
    type: String,
    required: true
  },
  hsn_code: {
    type: String,
    required: true
  },
  ordered_qty: {
    type: Number,
    required: true,
    min: 1
  },
  received_qty: {
    type: Number,
    default: 0,
    min: 0
  },
  pending_qty: {
    type: Number,
    default: 0,
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
    default: 0,
    min: 0
  },
  gst_percent: {
    type: Number,
    required: true,
    min: 0
  },
  gst_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  total_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  required_date: {
    type: Date
  },
  item_status: {
    type: String,
    enum: ['Pending', 'Partially Received', 'Fully Received', 'Cancelled'],
    default: 'Pending'
  },
  remarks: {
    type: String
  }
}, { _id: true });

const purchaseOrderSchema = new mongoose.Schema({
  po_number: {
    type: String,
    unique: true,
    sparse: true,  // ← REMOVE required: true, add sparse for unique constraint
    index: true
    // required: true  ← REMOVE THIS LINE
  },
  po_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  po_type: {
    type: String,
    enum: ['Regular', 'Subcontract', 'Import', 'Capital', 'Service', 'Blanket'],
    required: true
  },
  
  // Source references
  pr_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseRequisition'
  },
  rfq_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RFQ'
  },
  
  // Vendor details
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
  vendor_state: {
    type: String,
    required: true
  },
  vendor_state_code: {
    type: Number,
    required: true
  },
  
  // Company details
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
  
  // Delivery details
  delivery_address: {
    line1: String,
    line2: String,
    city: String,
    district: String,
    state: String,
    state_code: Number,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  delivery_date: {
    type: Date,
    required: true
  },
  delivery_mode: {
    type: String,
    enum: ['Road', 'Air', 'Sea', 'Rail', 'Courier', 'Hand Delivery']
  },
  freight_terms: {
    type: String,
    enum: ['FOR Destination', 'Ex-Works', 'CIF', 'FOB', 'Freight Paid', 'Freight To Pay']
  },
  
  // Items
  items: [poItemSchema],
  
  // Totals
  subtotal: {
    type: Number,
    default: 0,
    min: 0
  },
  discount_total: {
    type: Number,
    default: 0,
    min: 0
  },
  taxable_total: {
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
  gst_total: {
    type: Number,
    default: 0,
    min: 0
  },
  grand_total: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // GST type (auto-determined)
  gst_type: {
    type: String,
    enum: ['CGST/SGST', 'IGST']
    // required: true  ← REMOVE THIS LINE
  },
  
  // Vendor acknowledgement
  vendor_acknowledgement: {
    type: Boolean,
    default: false
  },
  ack_date: {
    type: Date
  },
  
  // Tracking
  grn_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GRN'
  }],
  invoiced_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  paid_amount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Approved', 'Sent', 'Acknowledged', 'Partially Received', 'Fully Received', 'Invoiced', 'Closed', 'Cancelled'],
    default: 'Draft'
  },
  cancellation_reason: {
    type: String
  },
  
  // Approval
  approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approved_at: {
    type: Date
  },
  
  // Terms
  payment_terms: {
    type: String
  },
  terms_conditions: [{
    title: String,
    description: String
  }],
  internal_remarks: {
    type: String
  },
  
  // Audit
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

// Generate PO number before saving
purchaseOrderSchema.pre('save', async function(next) {
  // Only generate if po_number doesn't exist
  if (!this.po_number) {
    try {
      const year = new Date().getFullYear();
      const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
      
      // Find the latest PO to get the correct sequence
      const lastPO = await this.constructor.findOne({}, {}, { sort: { createdAt: -1 } });
      let sequence = 1;
      
      if (lastPO && lastPO.po_number) {
        const parts = lastPO.po_number.split('-');
        const lastNumber = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastNumber)) {
          sequence = lastNumber + 1;
        }
      }
      
      this.po_number = `PO-${year}${month}-${sequence.toString().padStart(4, '0')}`;
      console.log('✅ Generated PO number:', this.po_number);
    } catch (err) {
      console.error('Error generating PO number:', err);
      // Fallback with timestamp
      this.po_number = `PO-${Date.now()}`;
    }
  }
  
  // Determine GST type (if not already set)
  if (!this.gst_type && this.company_state_code && this.vendor_state_code) {
    if (this.company_state_code === this.vendor_state_code) {
      this.gst_type = 'CGST/SGST';
    } else {
      this.gst_type = 'IGST';
    }
    console.log('✅ Determined GST type:', this.gst_type);
  }
  
  next();
});

// Calculate totals before saving
purchaseOrderSchema.pre('save', function(next) {
  let subtotal = 0;
  let discount_total = 0;
  let cgst_total = 0;
  let sgst_total = 0;
  let igst_total = 0;
  
  this.items.forEach(item => {
    // Calculate discount
    item.discount_amount = (item.unit_price * item.ordered_qty * item.discount_percent) / 100;
    
    // Calculate taxable amount
    item.taxable_amount = (item.unit_price * item.ordered_qty) - item.discount_amount;
    
    // Calculate GST based on gst_type
    if (this.gst_type === 'CGST/SGST') {
      item.gst_amount = (item.taxable_amount * item.gst_percent) / 100;
      cgst_total += item.gst_amount / 2;
      sgst_total += item.gst_amount / 2;
    } else {
      item.gst_amount = (item.taxable_amount * item.gst_percent) / 100;
      igst_total += item.gst_amount;
    }
    
    // Calculate total
    item.total_amount = item.taxable_amount + item.gst_amount;
    
    // Update pending quantity
    item.pending_qty = item.ordered_qty - item.received_qty;
    if (item.pending_qty <= 0) {
      item.item_status = 'Fully Received';
    } else if (item.received_qty > 0) {
      item.item_status = 'Partially Received';
    }
    
    subtotal += item.taxable_amount;
    discount_total += item.discount_amount;
  });
  
  this.subtotal = subtotal;
  this.discount_total = discount_total;
  this.taxable_total = subtotal;
  this.cgst_total = cgst_total;
  this.sgst_total = sgst_total;
  this.igst_total = igst_total;
  this.gst_total = cgst_total + sgst_total + igst_total;
  this.grand_total = this.taxable_total + this.gst_total;
  
  next();
});

// Indexes
purchaseOrderSchema.index({ po_number: 1 }, { unique: true, sparse: true });
purchaseOrderSchema.index({ vendor_id: 1, status: 1 });
purchaseOrderSchema.index({ delivery_date: 1 });
purchaseOrderSchema.index({ status: 1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);