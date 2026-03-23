// models/Subcontract.js
const mongoose = require('mongoose');

const subcontractItemSchema = new mongoose.Schema({
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
  dispatched_qty: {
    type: Number,
    required: true,
    min: 1
  },
  received_qty: {
    type: Number,
    default: 0,
    min: 0
  },
  rejected_qty: {
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
    enum: ['Nos', 'Kg', 'Meter', 'Set', 'Piece'],
    required: true
  },
  dispatched_weight_kg: {
    type: Number,
    min: 0
  },
  received_weight_kg: {
    type: Number,
    min: 0
  },
  batch_no: {
    type: String
  },
  heat_no: {
    type: String
  }
}, { _id: true });

const processSpecSchema = new mongoose.Schema({
  parameter: String,
  required_value: String,
  actual_value: String,
  unit: String,
  result: {
    type: String,
    enum: ['Pass', 'Fail', 'Not Checked'],
    default: 'Not Checked'
  }
}, { _id: true });

const subcontractSchema = new mongoose.Schema({
  // ==== SUBCONTRACT IDENTITY ============
  subcontract_id: {
    type: String,
    required: true,
    unique: true
  },
  subcontract_number: {
    type: String,
    required: true,
    unique: true
  },
  subcontract_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  subcontract_type: {
    type: String,
    enum: ['Outward', 'Inward'],
    required: true
  },
  
  // ==== WORK ORDER REFERENCE ============
  wo_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkOrder',
    required: true
  },
  wo_number: {
    type: String,
    required: true
  },
  op_sequence: {
    type: Number,
    required: true
  },
  operation_name: {
    type: String,
    required: true
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
  vendor_address: {
    type: String
  },
  
  // ==== PROCESS DETAILS ============
  process_name: {
    type: String,
    required: true
  },
  process_description: {
    type: String
  },
  process_specifications: [processSpecSchema],
  expected_process_spec: {
    type: String
  },
  
  // ==== DISPATCH DETAILS (for Outward) ============
  dispatch_challan_no: {
    type: String
  },
  dispatch_date: {
    type: Date
  },
  dispatched_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  dispatched_qty: {
    type: Number,
    min: 0
  },
  dispatched_weight_kg: {
    type: Number,
    min: 0
  },
  items: [subcontractItemSchema],
  
  // ==== TRANSPORT DETAILS ============
  vehicle_no: {
    type: String
  },
  transporter_name: {
    type: String
  },
  lr_number: {
    type: String
  },
  lr_date: {
    type: Date
  },
  eway_bill_no: {
    type: String
  },
  eway_bill_date: {
    type: Date
  },
  eway_bill_validity: {
    type: Date
  },
  
  // ==== EXPECTED RETURN ============
  expected_return_date: {
    type: Date
  },
  
  // ==== RECEIPT DETAILS (for Inward) ============
  receipt_challan_no: {
    type: String
  },
  actual_return_date: {
    type: Date
  },
  received_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  received_qty: {
    type: Number,
    min: 0,
    default: 0
  },
  received_weight_kg: {
    type: Number,
    min: 0
  },
  
  // ==== VENDOR REJECTION ============
  vendor_rejection_qty: {
    type: Number,
    default: 0,
    min: 0
  },
  vendor_rejection_reason: {
    type: String
  },
  
  // ==== INWARD QC ============
  inward_qc_required: {
    type: Boolean,
    default: true
  },
  inward_qc_status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Passed', 'Failed', 'Partially Passed'],
    default: 'Pending'
  },
  inward_qc_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InspectionRecord'
  },
  inward_qc_completed_at: {
    type: Date
  },
  inward_qc_completed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  inward_accepted_qty: {
    type: Number,
    default: 0,
    min: 0
  },
  inward_rejected_qty: {
    type: Number,
    default: 0,
    min: 0
  },
  inward_rejection_reason: {
    type: String
  },
  
  // ==== PLATING SPECIFIC FIELDS ============
  plating_thickness_min: {
    type: Number,
    min: 0
  },
  plating_thickness_max: {
    type: Number,
    min: 0
  },
  plating_thickness_measured: {
    type: Number,
    min: 0
  },
  adhesion_test_result: {
    type: String,
    enum: ['Pass', 'Fail', 'Not Tested']
  },
  
  // ==== HEAT TREATMENT SPECIFIC ============
  hardness_min: {
    type: Number,
    min: 0
  },
  hardness_max: {
    type: Number,
    min: 0
  },
  hardness_measured: {
    type: Number,
    min: 0
  },
  
  // ==== PROCESSING CHARGES ============
  processing_po_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder'
  },
  processing_po_number: {
    type: String
  },
  processing_rate: {
    type: Number,
    min: 0
  },
  processing_charge_per_kg: {
    type: Number,
    min: 0
  },
  processing_charge_per_piece: {
    type: Number,
    min: 0
  },
  total_processing_charge: {
    type: Number,
    min: 0
  },
  
  // ==== STOCK MOVEMENT ============
  stock_transaction_out_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StockTransaction'
  },
  stock_transaction_in_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StockTransaction'
  },
  
  // ==== NCR (if rejected) ============
  ncr_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NCR'
  },
  
  // ==== STATUS ============
  status: {
    type: String,
    enum: ['Draft', 'Dispatched', 'In Process', 'Received', 'Partially Received', 'QC Pending', 'QC Failed', 'Completed', 'Rejected', 'Closed'],
    default: 'Draft'
  },
  
  // ==== REMARKS ============
  remarks: {
    type: String
  },
  internal_notes: {
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

// Generate subcontract number before saving
subcontractSchema.pre('save', async function(next) {
  if (!this.subcontract_number) {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const count = await this.constructor.countDocuments() + 1;
    this.subcontract_number = `SC-${year}${month}-${count.toString().padStart(4, '0')}`;
  }
  
  if (!this.subcontract_id) {
    this.subcontract_id = this.subcontract_number;
  }
  
  // Update pending quantities
  if (this.items && this.items.length > 0) {
    this.items.forEach(item => {
      item.pending_qty = item.dispatched_qty - (item.received_qty || 0);
    });
  }
  
  next();
});

// Indexes
subcontractSchema.index({ subcontract_number: 1 });
subcontractSchema.index({ wo_id: 1, op_sequence: 1 });
subcontractSchema.index({ vendor_id: 1, status: 1 });
subcontractSchema.index({ expected_return_date: 1 });
subcontractSchema.index({ status: 1 });

module.exports = mongoose.model('Subcontract', subcontractSchema);