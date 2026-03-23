const mongoose = require("mongoose");

const bomComponentSchema = new mongoose.Schema({
  level: {
    type: Number,
    required: [true, 'Component level is required'],
    min: 0
  },
  component_item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: [true, 'Component item ID is required']
  },
  component_part_no: {
    type: String,
    required: [true, 'Component part number is required'],
    trim: true,
    uppercase: true
  },
  component_desc: {
    type: String,
    required: [true, 'Component description is required'],
    trim: true
  },
  quantity_per: {
    type: Number,
    required: [true, 'Quantity per is required'],
    min: 0.0001
  },
  unit: {
    type: String,
    enum: ["Nos", "Kg", "Meter", "Sheet", "Roll"],
    required: [true, 'Unit is required']
  },
  scrap_percent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
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
  reference_designator: {
    type: String,
    trim: true
  },
  remarks: {
    type: String,
    trim: true
  }
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
  change_description: {
    type: String,
    trim: true
  },
  pdf_path: {
    type: String,
    trim: true
  },
  email_sent_to: [{
    type: String,
    trim: true,
    lowercase: true
  }]
}, { _id: true });

const bomSchema = new mongoose.Schema({
  bom_id: {
    type: String,
    required: [true, 'BOM ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  parent_item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: [true, 'Parent item ID is required']
  },
  parent_part_no: {
    type: String,
    required: [true, 'Parent part number is required'],
    trim: true,
    uppercase: true
  },
  bom_version: {
    type: String,
    required: [true, 'BOM version is required'],
    trim: true
  },
  is_default: {
    type: Boolean,
    default: false
  },
  effective_from: {
    type: Date,
    default: Date.now
  },
  effective_to: Date,
  bom_type: {
    type: String,
    enum: ["Manufacturing", "Subcontract", "Phantom", "Variant"],
    required: [true, 'BOM type is required']
  },
  batch_size: {
    type: Number,
    required: [true, 'Batch size is required'],
    min: 1,
    default: 1
  },
  yield_percent: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  },
  setup_time_min: {
    type: Number,
    min: 0,
    default: 0
  },
  cycle_time_min: {
    type: Number,
    min: 0,
    default: 0
  },
  components: {
    type: [bomComponentSchema],
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'BOM must have at least one component'
    }
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
  revision_history: [revisionSnapshotSchema],
  current_revision: {
    type: Number,
    default: 0
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Pre-save middleware to ensure revision_history is append-only
bomSchema.pre('save', function(next) {
  if (this.isModified('revision_history')) {
    if (!this._original) {
      this._original = {};
    }
    if (this._original.revision_history && 
        this.revision_history.length < this._original.revision_history.length) {
      return next(new Error('Cannot delete revision history entries'));
    }
  }
  next();
});

// Pre-save middleware to set parent_part_no from item if not provided
bomSchema.pre('save', async function(next) {
  if (!this.parent_part_no && this.parent_item_id) {
    try {
      const Item = mongoose.model('Item');
      const item = await Item.findById(this.parent_item_id);
      if (item) {
        this.parent_part_no = item.part_no;
      }
    } catch (error) {
      // Silently fail
    }
  }
  next();
});

// Indexes
bomSchema.index({ bom_id: 1 }, { unique: true });
bomSchema.index({ parent_item_id: 1, bom_version: 1 }, { unique: true });
bomSchema.index({ parent_item_id: 1, is_default: 1 });
bomSchema.index({ status: 1, is_active: 1 });
bomSchema.index({ 'revision_history.revision_no': 1 });

module.exports = mongoose.model("Bom", bomSchema);