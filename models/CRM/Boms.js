'use strict';
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// BOM — BILL OF MATERIALS
//
// Defines what a finished product is made of.
// Multi-level: FG → Sub-Assembly → Components → Raw Material.
//
// Used by:
//   Phase 01 — Lead feasibility (does a BOM exist for this part?)
//   Phase 05 — MRP explosion (BOM drives material requirements)
//   Phase 05 — Work Order (BOM drives material issue list)
// ─────────────────────────────────────────────────────────────────────────────

// ── Component sub-schema ──────────────────────────────────────────────────────
const bomComponentSchema = new mongoose.Schema({
  level: {
    type: Number,
    required: [true, 'Component level is required'],
    min: 0,
  },
  component_item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: [true, 'Component item ID is required'],
  },
  component_part_no: {
    type: String,
    required: [true, 'Component part number is required'],
    trim: true,
    uppercase: true,
  },
  component_desc: {
    type: String,
    required: [true, 'Component description is required'],
    trim: true,
  },
  quantity_per: {
    type: Number,
    required: [true, 'Quantity per is required'],
    min: 0.0001,
  },
  unit: {
    type: String,
    enum: ['Nos', 'Kg', 'Meter', 'Sheet', 'Roll'],
    required: [true, 'Unit is required'],
  },
  scrap_percent:       { type: Number, default: 0, min: 0, max: 100 },
  is_phantom:          { type: Boolean, default: false },
  is_subcontract:      { type: Boolean, default: false },
  subcontract_vendor:  { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  reference_designator: { type: String, default: '', trim: true },
  remarks:             { type: String, default: '', trim: true },
}, { _id: false });


// ── Revision snapshot sub-schema ──────────────────────────────────────────────
const revisionSnapshotSchema = new mongoose.Schema({
  revision_no:       { type: Number, required: true },
  snapshot_data:     { type: mongoose.Schema.Types.Mixed, required: true },
  change_description: { type: String, default: '', trim: true },
  pdf_path:          { type: String, default: '', trim: true },
  email_sent_to:     [{ type: String, trim: true, lowercase: true }],
  created_by:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at:        { type: Date, default: Date.now },
}, { _id: true });


// ── BOM schema ────────────────────────────────────────────────────────────────
const bomSchema = new mongoose.Schema({

  // ── Identity ──────────────────────────────────────────────────────────────
  bom_id: {
    type: String,
    required: [true, 'BOM ID is required'],
    unique: true,
    trim: true,
    uppercase: true,
  },

  // ── Parent Item ───────────────────────────────────────────────────────────
  parent_item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: [true, 'Parent item ID is required'],
  },
  parent_part_no: {
    type: String,
    required: [true, 'Parent part number is required'],
    trim: true,
    uppercase: true,
  },

  // ── Version ───────────────────────────────────────────────────────────────
  bom_version:     { type: String, required: [true, 'BOM version is required'], trim: true },
  is_default:      { type: Boolean, default: false },
  effective_from:  { type: Date, default: Date.now },
  effective_to:    { type: Date, default: null },

  // ── Type ──────────────────────────────────────────────────────────────────
  bom_type: {
    type: String,
    enum: ['Manufacturing', 'Subcontract', 'Phantom', 'Variant'],
    required: [true, 'BOM type is required'],
  },

  // ── Production Parameters ─────────────────────────────────────────────────
  batch_size:      { type: Number, required: true, min: 1, default: 1 },
  yield_percent:   { type: Number, default: 100, min: 0, max: 100 },
  setup_time_min:  { type: Number, default: 0, min: 0 },
  cycle_time_min:  { type: Number, default: 0, min: 0 },

  // ── Components ────────────────────────────────────────────────────────────
  components: {
    type: [bomComponentSchema],
    validate: {
      validator: (v) => v && v.length > 0,
      message: 'BOM must have at least one component',
    },
  },

  // ── Approval ──────────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['Draft', 'Active', 'Cancelled', 'Archived'],
    default: 'Draft',
  },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approved_at: { type: Date, default: null },

  // ── Revision History (append-only) ───────────────────────────────────────
  revision_history: [revisionSnapshotSchema],
  current_revision: { type: Number, default: 0 },

  // ── Audit ─────────────────────────────────────────────────────────────────
  is_active:  { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});


// ── Indexes ───────────────────────────────────────────────────────────────────
bomSchema.index({ bom_id:         1 }, { unique: true });
bomSchema.index({ parent_item_id: 1, bom_version: 1 }, { unique: true });
bomSchema.index({ parent_item_id: 1, is_default: 1 });
bomSchema.index({ status: 1, is_active: 1 });
bomSchema.index({ parent_part_no: 1 });


// ── Pre-save: auto-fill parent_part_no from Item ──────────────────────────────
bomSchema.pre('save', async function (next) {
  if (!this.parent_part_no && this.parent_item_id) {
    try {
      const Item = mongoose.model('Item');
      const item = await Item.findById(this.parent_item_id).select('part_no');
      if (item) this.parent_part_no = item.part_no;
    } catch (_) {}
  }
  next();
});

// ── Pre-save: guard revision_history from deletions ───────────────────────────
bomSchema.pre('save', function (next) {
  if (this.isModified('revision_history') && this._original?.revision_history) {
    if (this.revision_history.length < this._original.revision_history.length) {
      return next(new Error('Cannot delete revision history entries'));
    }
  }
  next();
});


module.exports = mongoose.model('Bom', bomSchema);