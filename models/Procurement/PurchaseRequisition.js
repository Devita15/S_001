// models/PurchaseRequisition.js
const mongoose = require('mongoose');

const prItemSchema = new mongoose.Schema({
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
  required_qty: {
    type: Number,
    required: true,
    min: 1
  },
  unit: {
    type: String,
    enum: ['Nos', 'Kg', 'Meter', 'Set', 'Piece', 'Sheet', 'Roll'],
    required: true
  },
  estimated_price: {
    type: Number,
    min: 0,
    default: 0
  },
  required_date: {
    type: Date,
    required: true
  },
  remarks: {
    type: String,
    trim: true
  },
  po_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder'
  }],
  status: {
    type: String,
    enum: ['Pending', 'Partially Ordered', 'Fully Ordered', 'Cancelled'],
    default: 'Pending'
  }
}, { _id: true });

const purchaseRequisitionSchema = new mongoose.Schema({
  pr_number: {
    type: String,
    unique: true,
    sparse: true  // Allow temporary null during save
  },
  pr_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  pr_type: {
    type: String,
    enum: ['Material', 'Service', 'Capital', 'Subcontract'],
    required: true
  },
  source: {
    type: String,
    enum: ['MRP Auto', 'Manual', 'Reorder Alert', 'Indent'],
    default: 'Manual'
  },
  mrp_run_id: {
    type: String,
    default: null
  },
  wo_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkOrder'
  },
  
  // Items array
  items: [prItemSchema],
  
  // Department & Requestor
  department: {
    type: String,
    enum: ['Production', 'Quality', 'Maintenance', 'Admin', 'Store', 'Sales'],
    required: true
  },
  requested_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Approval fields
  approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approved_at: {
    type: Date
  },
  rejection_reason: {
    type: String
  },
  
  // Tracking
  po_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder'
  }],
  
  // Status
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Partially Ordered', 'Fully Ordered', 'Closed'],
    default: 'Draft'
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

// ✅ FIXED: Generate PR number before saving
purchaseRequisitionSchema.pre('save', async function(next) {
  try {
    if (!this.pr_number) {
      const year = new Date().getFullYear();
      const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
      
      // Get count of documents with PR numbers from this year/month
      const count = await mongoose.model('PurchaseRequisition').countDocuments({
        pr_number: { $regex: `^PR-${year}${month}` }
      }) + 1;
      
      this.pr_number = `PR-${year}${month}-${count.toString().padStart(4, '0')}`;
      console.log('✅ Generated PR number:', this.pr_number);
    }
    next();
  } catch (error) {
    console.error('❌ Error generating PR number:', error);
    next(error);
  }
});

// Indexes
purchaseRequisitionSchema.index({ pr_number: 1 }, { unique: true, sparse: true });
purchaseRequisitionSchema.index({ status: 1, required_date: 1 });
purchaseRequisitionSchema.index({ requested_by: 1 });

module.exports = mongoose.model('PurchaseRequisition', purchaseRequisitionSchema);