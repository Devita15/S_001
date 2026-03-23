'use strict';
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS MASTER
//
// Defines every manufacturing operation available in the factory.
// Each process has a rate_type that determines how cost is calculated
// in the Quotation (Phase 02) and Work Order (Phase 05).
//
// Used by:
//   Phase 01 — Lead feasibility (is the required process available?)
//   Phase 02 — Quotation process cost line items
//   Phase 04 — Routing (operation sequence per part)
//   Phase 05 — Work Order operations
// ─────────────────────────────────────────────────────────────────────────────

const processSchema = new mongoose.Schema({

  // ── Identity ──────────────────────────────────────────────────────────────
  process_id: {
    type: String,
    required: [true, 'Process ID is required'],
    unique: true,
    trim: true,
    uppercase: true,
  },
  process_name: {
    type: String,
    required: [true, 'Process name is required'],
    trim: true,
    unique: true,
  },
  description: { type: String, default: '', trim: true },

  // ── Classification ────────────────────────────────────────────────────────
  category: {
    type: String,
    required: [true, 'Process category is required'],
    enum: ['Core', 'Finishing', 'Packing', 'Other'],
    default: 'Core',
  },

  // ── Rate ──────────────────────────────────────────────────────────────────
  // rate_type determines the unit of measurement for quoting
  rate_type: {
    type: String,
    required: [true, 'Rate type is required'],
    enum: ['Per Kg', 'Per Nos', 'Per Hour', 'Fixed'],
  },
  standard_rate: {
    type: Number,
    default: 0,
    min: 0,
    // Standard Rs rate per unit — used as default in quotation
    // Can be overridden per quotation line item
  },

  // ── Work Centre linkage ───────────────────────────────────────────────────
  work_centre: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Machine',
    default: null,
  },

  // ── Time Standards ────────────────────────────────────────────────────────
  setup_time_min:   { type: Number, default: 0, min: 0 },
  cycle_time_min:   { type: Number, default: 0, min: 0 },

  // ── Subcontract flag ──────────────────────────────────────────────────────
  is_subcontract:   { type: Boolean, default: false },
  default_vendor:   {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null,
  },

  // ── Audit ─────────────────────────────────────────────────────────────────
  is_active:  { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });


// ── Indexes ───────────────────────────────────────────────────────────────────
processSchema.index({ process_id:   1 }, { unique: true });
processSchema.index({ process_name: 1 }, { unique: true });
processSchema.index({ category:     1, is_active: 1 });
processSchema.index({ is_active:    1 });


module.exports = mongoose.model('Process', processSchema);