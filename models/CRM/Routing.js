'use strict';
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// ROUTING MASTER
//
// Defines the standard sequence of manufacturing operations for a part.
// "How to make it" — which machines, in which order, how long each step takes.
//
// Used by:
//   Phase 01 — Lead feasibility (is there a routing for this part?)
//   Phase 05 — Work Order (operations array populated from routing)
//   Phase 05 — Production scheduling (machine loading from cycle times)
// ─────────────────────────────────────────────────────────────────────────────

// ── Operation sub-schema ──────────────────────────────────────────────────────
const routingOperationSchema = new mongoose.Schema({
  sequence_no: {
    type: Number,
    required: [true, 'Sequence number is required'],
    min: 1,
  },
  operation_code: {
    type: String,
    required: [true, 'Operation code is required'],
    trim: true,
    uppercase: true,
  },
  operation_name: {
    type: String,
    required: [true, 'Operation name is required'],
    trim: true,
  },

  // ── Process & Machine linkage ─────────────────────────────────────────────
  process_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Process',
    required: [true, 'Process ID is required'],
  },
  work_centre: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Machine',
    default: null,
  },

  // ── Time standards ────────────────────────────────────────────────────────
  setup_time_min:     { type: Number, default: 0, min: 0 },
  cycle_time_min:     { type: Number, default: 0, min: 0 },   // per piece
  queue_time_min:     { type: Number, default: 0, min: 0 },   // wait between ops
  move_time_min:      { type: Number, default: 0, min: 0 },   // transit time

  // ── Cost ──────────────────────────────────────────────────────────────────
  rate_type: {
    type: String,
    enum: ['Per Kg', 'Per Nos', 'Per Hour', 'Fixed'],
    default: 'Per Nos',
  },
  standard_rate: { type: Number, default: 0, min: 0 },

  // ── Subcontract ───────────────────────────────────────────────────────────
  is_subcontract:  { type: Boolean, default: false },
  subcontract_vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null,
  },

  // ── QC gate ───────────────────────────────────────────────────────────────
  inspection_required: { type: Boolean, default: false },

  remarks: { type: String, default: '', trim: true },
}, { _id: true });


// ── Routing schema ────────────────────────────────────────────────────────────
const routingSchema = new mongoose.Schema({

  // ── Identity ──────────────────────────────────────────────────────────────
  routing_id: {
    type: String,
    required: [true, 'Routing ID is required'],
    unique: true,
    trim: true,
    uppercase: true,
  },
  routing_name: {
    type: String,
    required: [true, 'Routing name is required'],
    trim: true,
  },

  // ── Item linkage ──────────────────────────────────────────────────────────
  item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: [true, 'Item ID is required'],
  },
  part_no: {
    type: String,
    required: [true, 'Part number is required'],
    trim: true,
    uppercase: true,
  },

  // ── Version ───────────────────────────────────────────────────────────────
  routing_version: { type: String, default: '1', trim: true },
  is_default:      { type: Boolean, default: false },
  effective_from:  { type: Date, default: Date.now },
  effective_to:    { type: Date, default: null },

  // ── Operations ────────────────────────────────────────────────────────────
  operations: {
    type: [routingOperationSchema],
    validate: {
      validator: (v) => v && v.length > 0,
      message: 'Routing must have at least one operation',
    },
  },

  // ── Totals (auto-computed) ────────────────────────────────────────────────
  total_setup_time_min: { type: Number, default: 0 },
  total_cycle_time_min: { type: Number, default: 0 },

  // ── Approval ──────────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['Draft', 'Active', 'Archived'],
    default: 'Draft',
  },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approved_at: { type: Date, default: null },

  // ── Audit ─────────────────────────────────────────────────────────────────
  is_active:  { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

}, { timestamps: true });


// ── Indexes ───────────────────────────────────────────────────────────────────
routingSchema.index({ routing_id: 1 }, { unique: true });
routingSchema.index({ item_id: 1, routing_version: 1 }, { unique: true });
routingSchema.index({ item_id: 1, is_default: 1 });
routingSchema.index({ part_no: 1 });
routingSchema.index({ status: 1, is_active: 1 });


// ── Pre-save: auto-compute totals ─────────────────────────────────────────────
routingSchema.pre('save', function (next) {
  if (this.operations?.length) {
    this.total_setup_time_min = this.operations.reduce((s, o) => s + (o.setup_time_min || 0), 0);
    this.total_cycle_time_min = this.operations.reduce((s, o) => s + (o.cycle_time_min || 0), 0);
  }
  next();
});

// ── Pre-save: auto-fill part_no from Item ─────────────────────────────────────
routingSchema.pre('save', async function (next) {
  if (!this.part_no && this.item_id) {
    try {
      const Item = mongoose.model('Item');
      const item = await Item.findById(this.item_id).select('part_no');
      if (item) this.part_no = item.part_no;
    } catch (_) {}
  }
  next();
});


module.exports = mongoose.model('Routing', routingSchema);