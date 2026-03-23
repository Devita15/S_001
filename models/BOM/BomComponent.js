const mongoose = require("mongoose");

const bomComponentSchema = new mongoose.Schema({
  bom_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Bom",
    required: [true, 'BOM ID is required'],
    index: true
  },
  level: {
    type: Number,
    required: [true, 'Level is required'],
    min: 0
  },
  component_item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item",
    required: [true, 'Component item ID is required'],
    index: true
  },
  component_part_no: {
    type: String,
    required: [true, 'Component part number is required'],
    trim: true,
    uppercase: true,
    index: true
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
  reference_designator: String,
  remarks: String,
  is_active: {
    type: Boolean,
    default: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Compound index for unique component per BOM per level
bomComponentSchema.index(
  { bom_id: 1, component_item_id: 1, level: 1 }, 
  { unique: true }
);

module.exports = mongoose.model("BomComponent", bomComponentSchema);