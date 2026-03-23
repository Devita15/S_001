// models/Inventory/StockTransaction.js
const mongoose = require('mongoose');

const stockTransactionSchema = new mongoose.Schema({
  transaction_number: {
    type: String,
    sparse: true,
    unique: true,
    index: true
  },
  transaction_type: {
    type: String,
    required: true,
    enum: [
      'GRN Receipt',      // Stock IN from purchase
      'Sales Issue',      // Stock OUT for sales
      'Production Issue', // Stock OUT for production
      'Production Receipt', // Stock IN from production
      'Return to Vendor', // Stock OUT for returns
      'Vendor Return',    // Stock IN from vendor returns
      'Transfer In',      // Stock IN from transfer
      'Transfer Out',     // Stock OUT for transfer
      'Adjustment Add',   // Stock IN for adjustment
      'Adjustment Remove', // Stock OUT for adjustment
      'Scrap',            // Stock OUT for scrap
      'Sample Issue'      // Stock OUT for samples
    ]
  },
  transaction_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Reference documents
  grn_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GRN'
  },
  po_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder'
  },
  sales_order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesOrder'
  },
  work_order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkOrder'
  },
  transfer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StockTransfer'
  },
  
  // Item details
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
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true
  },
  
  // Batch/Serial tracking
  batch_no: {
    type: String,
    trim: true
  },
  heat_no: {
    type: String,
    trim: true
  },
  serial_numbers: [{
    type: String
  }],
  
  // Storage location
  from_location: {
    warehouse_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse'
    },
    bin_code: {
      type: String
    }
  },
  to_location: {
    warehouse_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse'
    },
    bin_code: {
      type: String
    }
  },
  
  // Valuation
  unit_cost: {
    type: Number,
    default: 0
  },
  total_cost: {
    type: Number,
    default: 0
  },
  
  // Reference document
  reference_doc: {
    type: String,
    trim: true
  },
  reference_doc_number: {
    type: String
  },
  
  // Remarks
  remarks: {
    type: String
  },
  
  // Status
  status: {
    type: String,
    enum: ['Pending', 'Posted', 'Cancelled'],
    default: 'Posted'
  },
  
  // Audit
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  posted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  posted_at: {
    type: Date
  }
}, {
  timestamps: true
});

// Generate transaction number before saving
stockTransactionSchema.pre('save', async function(next) {
  if (!this.transaction_number) {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const count = await this.constructor.countDocuments() + 1;
    this.transaction_number = `ST-${year}${month}-${count.toString().padStart(4, '0')}`;
  }
  next();
});

// Indexes
stockTransactionSchema.index({ transaction_number: 1 });
stockTransactionSchema.index({ transaction_type: 1, transaction_date: -1 });
stockTransactionSchema.index({ item_id: 1, batch_no: 1 });
stockTransactionSchema.index({ grn_id: 1 });
stockTransactionSchema.index({ po_id: 1 });

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);