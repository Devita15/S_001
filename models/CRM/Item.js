'use strict';
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// ITEM MASTER
//
// Single source of truth for every item in the system —
// raw materials, semi-finished goods, finished goods, consumables, tools.
//
// Used by:
//   Phase 01 — Lead feasibility check (does this part_no exist?)
//   Phase 02 — Quotation costing (density, rm_grade, hsn_code)
//   Phase 04 — BOM & Routing
//   Phase 05 — MRP explosion
//   Phase 07 — Inventory / Stock Ledger
// ─────────────────────────────────────────────────────────────────────────────

const itemSchema = new mongoose.Schema({

  // ── Identity ──────────────────────────────────────────────────────────────
  item_id: {
    type: String,
    required: [true, 'Item ID is required'],
    unique: true,
    trim: true,
    uppercase: true,
  },
  part_no: {
    type: String,
    required: [true, 'Part number is required'],
    unique: true,
    trim: true,
    uppercase: true,
  },
  part_description: {
    type: String,
    required: [true, 'Part description is required'],
    trim: true,
  },

  // ── Drawing & Revision ────────────────────────────────────────────────────
  drawing_no:  { type: String, default: '', trim: true },
  revision_no: { type: String, default: '0', trim: true },

  // ── Classification ────────────────────────────────────────────────────────
  item_type: {
    type: String,
    enum: ['Finished Good', 'Semi-Finished', 'Raw Material', 'Consumable', 'Tool', 'Packing'],
    default: 'Finished Good',
  },
  item_category: { type: String, default: '', trim: true },

  // ── Raw Material Specification ────────────────────────────────────────────
  rm_grade:   { type: String, required: [true, 'RM Grade is required'], trim: true },
  density:    { type: Number, required: [true, 'Density is required'], min: 0.1 },   // g/cm³
  rm_source:  { type: String, default: '', trim: true },
  rm_type:    { type: String, default: '', trim: true },
  rm_spec:    { type: String, default: '', trim: true },
  material:   { type: String, default: '', trim: true },   // Human-readable e.g. "Copper"

  // ── Dimensions (for Landed Cost / Template 2) ─────────────────────────────
  item_no:      { type: String, default: '', trim: true },
  strip_size:   { type: Number, default: 0, min: 0 },
  pitch:        { type: Number, default: 0, min: 0 },
  no_of_cavity: { type: Number, default: 1, min: 1 },

  // ── Rejection & Scrap ─────────────────────────────────────────────────────
  rm_rejection_percent:      { type: Number, default: 2.0, min: 0, max: 100 },
  scrap_realisation_percent: { type: Number, default: 98,  min: 0, max: 100 },

  // ── Units & Tax ───────────────────────────────────────────────────────────
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    enum: ['Nos', 'Kg', 'Meter', 'Set', 'Piece'],
    default: 'Nos',
  },
  hsn_code: { type: String, required: [true, 'HSN code is required'], trim: true },

  // ── Inventory Control ─────────────────────────────────────────────────────
  reorder_level:  { type: Number, default: 0, min: 0 },
  reorder_qty:    { type: Number, default: 0, min: 0 },
  min_stock:      { type: Number, default: 0, min: 0 },
  max_stock:      { type: Number, default: 0, min: 0 },
  lead_time_days: { type: Number, default: 0, min: 0 },

  // ── Procurement Source ────────────────────────────────────────────────────
  procurement_type: {
    type: String,
    enum: ['Manufacture', 'Purchase', 'Subcontract', 'Free Issue'],
    default: 'Manufacture',
  },

  // ── Audit ─────────────────────────────────────────────────────────────────
  is_active:  { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });


// ── Indexes ───────────────────────────────────────────────────────────────────
itemSchema.index({ part_description: 'text', drawing_no: 'text', rm_grade: 'text' });
itemSchema.index({ item_no:   1 });
itemSchema.index({ is_active: 1 });
itemSchema.index({ rm_grade:  1 });
itemSchema.index({ item_type: 1, is_active: 1 });


// ── Pre-save: auto-set item_no and material ───────────────────────────────────
itemSchema.pre('save', function (next) {
  if (!this.item_no && this.part_no) {
    this.item_no = this.part_no;
  }
  if (!this.material && this.rm_grade) {
    if      (this.rm_grade.toUpperCase().includes('C'))  this.material = 'Copper';
    else if (this.rm_grade.toUpperCase().includes('AL')) this.material = 'Aluminum';
    else if (this.rm_grade.toUpperCase().includes('SS')) this.material = 'Stainless Steel';
    else                                                  this.material = this.rm_grade;
  }
  next();
});


module.exports = mongoose.model('Item', itemSchema);