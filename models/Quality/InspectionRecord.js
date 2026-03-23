// models/Quality/InspectionRecord.js
const mongoose = require('mongoose');

const testParameterSchema = new mongoose.Schema({
  parameter_name: {
    type: String,
    required: true
  },
  standard_value: {
    type: String,
    required: true
  },
  measured_value: {
    type: String
  },
  tolerance: {
    type: String
  },
  unit: {
    type: String
  },
  result: {
    type: String,
    enum: ['Pass', 'Fail', 'Pending', 'Not Applicable'],
    default: 'Pending'
  },
  remarks: {
    type: String
  }
}, { _id: true });

const inspectionItemSchema = new mongoose.Schema({
  item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  part_no: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  received_qty: {
    type: Number,
    required: true,
    min: 0
  },
  sample_qty: {
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
  test_parameters: [testParameterSchema],
  photos: [{
    url: String,
    caption: String
  }],
  status: {
    type: String,
    enum: ['Pending', 'Passed', 'Failed', 'Partially Passed'],
    default: 'Pending'
  },
  remarks: {
    type: String
  }
}, { _id: true });

const inspectionRecordSchema = new mongoose.Schema({
  inspection_number: {
    type: String,
    sparse: true,
    unique: true,
    index: true
  },
  inspection_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Reference documents
  grn_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GRN',
    required: true
  },
  po_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true
  },
  vendor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  
  // Items to inspect
  items: [inspectionItemSchema],
  
  // Inspection details
  inspection_type: {
    type: String,
    enum: ['Incoming', 'In-Process', 'Final', 'Pre-Dispatch'],
    default: 'Incoming'
  },
  inspection_method: {
    type: String,
    enum: ['Visual', 'Destructive', 'Non-Destructive', 'Chemical', 'Mechanical', 'Electrical'],
    default: 'Visual'
  },
  sampling_plan: {
    type: String,
    enum: ['100%', 'AQL 1.5', 'AQL 2.5', 'AQL 4.0', 'Random', 'Customer Specified'],
    default: 'AQL 2.5'
  },
  
  // Results
  total_accepted: {
    type: Number,
    default: 0
  },
  total_rejected: {
    type: Number,
    default: 0
  },
  
  // Status
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Passed', 'Failed', 'Partially Passed', 'Under Review'],
    default: 'Pending'
  },
  
  // Completion
  completed_at: {
    type: Date
  },
  completed_by: {
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
  
  // Remarks
  remarks: {
    type: String
  },
  recommendations: {
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

// Generate inspection number before saving
inspectionRecordSchema.pre('save', async function(next) {
  if (!this.inspection_number) {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const count = await this.constructor.countDocuments() + 1;
    this.inspection_number = `INSP-${year}${month}-${count.toString().padStart(4, '0')}`;
  }
  next();
});

// Update totals before saving
inspectionRecordSchema.pre('save', function(next) {
  let totalAccepted = 0;
  let totalRejected = 0;
  
  this.items.forEach(item => {
    totalAccepted += item.accepted_qty;
    totalRejected += item.rejected_qty;
  });
  
  this.total_accepted = totalAccepted;
  this.total_rejected = totalRejected;
  next();
});

// Indexes
inspectionRecordSchema.index({ inspection_number: 1 });
inspectionRecordSchema.index({ grn_id: 1 });
inspectionRecordSchema.index({ po_id: 1, status: 1 });
inspectionRecordSchema.index({ vendor_id: 1, inspection_date: -1 });

module.exports = mongoose.model('InspectionRecord', inspectionRecordSchema);