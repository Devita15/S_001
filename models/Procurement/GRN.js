// models/Procurement/GRN.js
const mongoose = require('mongoose');

const grnItemSchema = new mongoose.Schema({
  po_item_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
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
  received_qty: {
    type: Number,
    required: true,
    min: 0
  },
  accepted_qty: {
    type: Number,
    default: 0,
    min: 0
  },
  rejected_qty: {
    type: Number,
    default: 0,
    min: 0
  },
  rejection_reason: {
    type: String
  },
  unit: {
    type: String,
    required: true
  },
  batch_no: {
    type: String,
    trim: true
  },
  heat_no: {
    type: String,
    trim: true
  },
  mill_cert_path: {
    type: String
  },
  expiry_date: {
    type: Date
  },
  storage_location: {
    type: String,
    trim: true,
    default: ''
  },
  item_status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Rejected', 'Partially Accepted'],
    default: 'Pending'
  }
}, { _id: true });

const grnSchema = new mongoose.Schema({
  grn_number: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  grn_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // PO reference
  po_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true
  },
  po_number: {
    type: String,
    required: true
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
  vendor_invoice_no: {
    type: String
  },
  vendor_invoice_date: {
    type: Date
  },
  
  // Transport details
  vehicle_no: {
    type: String
  },
  lr_number: {
    type: String
  },
  lr_date: {
    type: Date
  },
  transporter_name: {
    type: String
  },
  
  // Receiving details
  receiving_store: {
    type: String,
    required: true
  },
  received_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receipt_time: {
    type: Date,
    default: Date.now
  },
  
  // Items
  items: [grnItemSchema],
  
  // QC tracking
  qc_required: {
    type: Boolean,
    default: true
  },
  qc_status: {
    type: String,
    enum: ['Not Required', 'Pending', 'In Progress', 'Passed', 'Failed', 'Partially Passed'],
    default: 'Pending'
  },
  qc_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InspectionRecord'
  },
  qc_completed_at: {
    type: Date
  },
  qc_completed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Totals
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
  
  // Status
  status: {
    type: String,
    enum: ['Created', 'Under Inspection', 'Accepted', 'Rejected', 'Partially Accepted', 'Stock Updated'],
    default: 'Created'
  },
  
  // NCR reference (if rejected)
  ncr_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NCR'
  },
  
  // Stock transaction references
  stock_transaction_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StockTransaction'
  }],
  
  // Remarks
  remarks: {
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

// Generate GRN number before saving
grnSchema.pre('save', async function(next) {
  if (!this.grn_number) {
    try {
      const year = new Date().getFullYear();
      const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
      
      const lastGRN = await this.constructor.findOne({}, {}, { sort: { createdAt: -1 } });
      let sequence = 1;
      
      if (lastGRN && lastGRN.grn_number) {
        const parts = lastGRN.grn_number.split('-');
        const lastNumber = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastNumber)) {
          sequence = lastNumber + 1;
        }
      }
      
      this.grn_number = `GRN-${year}${month}-${sequence.toString().padStart(4, '0')}`;
      console.log('✅ Generated GRN number:', this.grn_number);
    } catch (err) {
      console.error('Error generating GRN number:', err);
      this.grn_number = `GRN-${Date.now()}`;
    }
  }
  next();
});

// Update totals before saving
grnSchema.pre('save', function(next) {
  let totalReceived = 0;
  let totalAccepted = 0;
  let totalRejected = 0;
  
  this.items.forEach(item => {
    totalReceived += item.received_qty;
    totalAccepted += item.accepted_qty;
    totalRejected += item.rejected_qty;
    
    if (item.rejected_qty === item.received_qty) {
      item.item_status = 'Rejected';
    } else if (item.accepted_qty === item.received_qty) {
      item.item_status = 'Accepted';
    } else if (item.accepted_qty > 0) {
      item.item_status = 'Partially Accepted';
    }
  });
  
  this.total_received_qty = totalReceived;
  this.total_accepted_qty = totalAccepted;
  this.total_rejected_qty = totalRejected;
  
  if (this.qc_status === 'Passed') {
    this.status = 'Accepted';
  } else if (this.qc_status === 'Failed') {
    this.status = 'Rejected';
  } else if (this.qc_status === 'Partially Passed') {
    this.status = 'Partially Accepted';
  }
  
  next();
});

// Indexes
grnSchema.index({ grn_number: 1 }, { unique: true, sparse: true });
grnSchema.index({ po_id: 1, status: 1 });
grnSchema.index({ vendor_id: 1, grn_date: -1 });
grnSchema.index({ qc_status: 1 });

module.exports = mongoose.model('GRN', grnSchema);