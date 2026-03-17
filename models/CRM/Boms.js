const mongoose = require("mongoose");

const bomComponentSchema = new mongoose.Schema({
  level: {
    type: Number,
    required: true
  },
  component_item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: true
  },
  component_part_no: {
    type: String,
    required: true
  },
  component_desc: {
    type: String,
    required: true
  },
  quantity_per: {
    type: Number,
    required: true,
    min: 0.0001
  },
  unit: {
    type: String,
    enum: ["Nos", "Kg", "Meter", "Sheet", "Roll"],
    required: true
  },
  scrap_percent: {
    type: Number,
    default: 0
  },
  is_phantom: {
    type: Boolean,
    default: false
  },
  is_subcontract: {
    type: Boolean,
    default: false
  },
  subcontract_vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor"
  },
  reference_designator: String,
  remarks: String
}, { _id: false });

// Revision snapshot schema
const revisionSnapshotSchema = new mongoose.Schema({
  revision_no: {
    type: Number,
    required: true
  },
  snapshot_data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  change_description: String,
  pdf_path: String,
  email_sent_to: [String]
}, { _id: true });

const bomSchema = new mongoose.Schema({
  bom_id: {
    type: String,
    required: true,
    unique: true
  },
  parent_item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: true
  },
  parent_part_no: {
    type: String,
    required: true
  },
  bom_version: {
    type: String,
    required: true
  },
  is_default: {
    type: Boolean,
    default: false
  },
  effective_from: Date,
  effective_to: Date,
  bom_type: {
    type: String,
    enum: ["Manufacturing", "Subcontract", "Phantom", "Variant"],
    required: true
  },
  batch_size: {
    type: Number,
    required: true
  },
  yield_percent: {
    type: Number,
    default: 100
  },
  setup_time_min: Number,
  cycle_time_min: Number,
  components: {
    type: [bomComponentSchema],
    validate: v => v.length > 0
  },
  approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  approved_at: Date,
  is_active: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ["Draft", "Active", "Cancelled", "Archived"],
    default: "Draft"
  },
  // Revision history - append only
  revision_history: [revisionSnapshotSchema],
  // Current revision number
  current_revision: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Ensure revision_history is append-only
bomSchema.pre('save', function(next) {
  if (this.isModified('revision_history')) {
    // Check if trying to modify existing revisions
    const existingHistory = this._original?.revision_history || [];
    if (this.revision_history.length < existingHistory.length) {
      next(new Error('Cannot delete revision history entries'));
    }
  }
  next();
});

// Indexes
bomSchema.index({ bom_id: 1 });
bomSchema.index({ parent_item_id: 1, is_default: 1 });
bomSchema.index({ 'revision_history.revision_no': 1 });

module.exports = mongoose.model("Bom", bomSchema);