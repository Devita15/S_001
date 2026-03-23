// models/Quality/NCR.js
const mongoose = require('mongoose');

const ncrActionSchema = new mongoose.Schema({
  action_type: {
    type: String,
    enum: ['Corrective Action', 'Preventive Action', 'Immediate Action'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  due_date: {
    type: Date
  },
  completed_at: {
    type: Date
  },
  completed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Overdue'],
    default: 'Pending'
  },
  remarks: {
    type: String
  }
}, { _id: true });

const ncrSchema = new mongoose.Schema({
  ncr_number: {
    type: String,
    sparse : true,
    unique: true,
    index: true
  },
  ncr_date: {
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
  work_order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkOrder'
  },
  
  // Vendor/Customer details
  vendor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  
  // Item details
  item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  part_no: {
    type: String,
    required: true
  },
  rejected_qty: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true
  },
  
  // Non-conformance details
  ncr_type: {
    type: String,
    enum: ['Incoming Material', 'In-Process', 'Finished Goods', 'Customer Complaint', 'Process Deviation'],
    required: true
  },
  severity: {
    type: String,
    enum: ['Critical', 'Major', 'Minor', 'Observation'],
    default: 'Major'
  },
  defect_description: {
    type: String,
    required: true
  },
  defect_location: {
    type: String
  },
  defect_code: {
    type: String
  },
  root_cause: {
    type: String
  },
  root_cause_analysis: {
    type: String
  },
  
  // Disposition
  disposition: {
    type: String,
    enum: ['Use As Is', 'Rework', 'Scrap', 'Return to Vendor', 'Credit Note', 'Replacement'],
    required: true
  },
  disposition_notes: {
    type: String
  },
  disposition_approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  disposition_date: {
    type: Date
  },
  
  // Financial impact
  estimated_loss: {
    type: Number,
    default: 0
  },
  actual_loss: {
    type: Number,
    default: 0
  },
  recovery_amount: {
    type: Number,
    default: 0
  },
  
  // Actions
  immediate_actions: [ncrActionSchema],
  corrective_actions: [ncrActionSchema],
  preventive_actions: [ncrActionSchema],
  
  // Status
  status: {
    type: String,
    enum: ['Open', 'Under Investigation', 'Action Pending', 'Closed', 'Rejected', 'Escalated'],
    default: 'Open'
  },
  
  // Closure
  closure_remarks: {
    type: String
  },
  closed_at: {
    type: Date
  },
  closed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Attachments
  attachments: [{
    filename: String,
    path: String,
    type: {
      type: String,
      enum: ['Photo', 'Report', 'Certificate', 'Other']
    }
  }],
  
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

// Generate NCR number before saving
ncrSchema.pre('save', async function(next) {
  if (!this.ncr_number) {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const count = await this.constructor.countDocuments() + 1;
    this.ncr_number = `NCR-${year}${month}-${count.toString().padStart(4, '0')}`;
  }
  next();
});

// Indexes
ncrSchema.index({ ncr_number: 1 });
ncrSchema.index({ status: 1, severity: 1 });
ncrSchema.index({ vendor_id: 1, ncr_date: -1 });
ncrSchema.index({ grn_id: 1 });
ncrSchema.index({ po_id: 1 });

module.exports = mongoose.model('NCR', ncrSchema);