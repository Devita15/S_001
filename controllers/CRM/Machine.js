'use strict';
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// MACHINE / WORK CENTRE MASTER
//
// Every machine and work centre in the factory.
// Used by:
//   Phase 04 — Routing (work_centre linkage)
//   Phase 05 — Production scheduling, capacity planning, OEE
//   Phase 01 — Feasibility check (do we have machine capability?)
// ─────────────────────────────────────────────────────────────────────────────

const machineSchema = new mongoose.Schema({

  // ── Identity ──────────────────────────────────────────────────────────────
  machine_id: {
    type: String,
    required: [true, 'Machine ID is required'],
    unique: true,
    trim: true,
    uppercase: true,
  },
  machine_name: {
    type: String,
    required: [true, 'Machine name is required'],
    trim: true,
  },
  machine_code: {
    type: String,
    required: [true, 'Machine code is required'],
    unique: true,
    trim: true,
    uppercase: true,
  },

  // ── Classification ────────────────────────────────────────────────────────
  machine_type: {
    type: String,
    required: [true, 'Machine type is required'],
    enum: [
      'Press', 'CNC', 'Lathe', 'Milling', 'Drilling', 'Grinding',
      'Welding', 'Bending', 'Laser Cutting', 'Plating', 'Assembly',
      'Inspection', 'Sawing', 'Tumbling', 'Other',
    ],
  },

  // ── Capacity ──────────────────────────────────────────────────────────────
  capacity_value:  { type: Number, default: 0, min: 0 },
  capacity_unit:   { type: String, default: '', trim: true }, // 'Tons', 'SPM', 'mm', etc.

  // ── Work Centre ───────────────────────────────────────────────────────────
  work_centre: {
    type: String,
    required: [true, 'Work centre is required'],
    trim: true,
    // e.g. 'Press Shop', 'CNC Shop', 'Plating Area', 'Assembly Bay'
  },

  // ── Shift Configuration ───────────────────────────────────────────────────
  shifts_per_day:          { type: Number, default: 2, min: 1, max: 3 },
  hours_per_shift:         { type: Number, default: 8, min: 1, max: 12 },
  available_hours_per_day: { type: Number, default: 16, min: 0 }, // auto-computed

  // ── OEE ───────────────────────────────────────────────────────────────────
  oee_target_percent: { type: Number, default: 75, min: 0, max: 100 },

  // ── Status ────────────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['Active', 'Idle', 'Under Maintenance', 'Breakdown', 'Decommissioned'],
    default: 'Active',
  },

  // ── Asset Info ────────────────────────────────────────────────────────────
  make:              { type: String, default: '', trim: true },
  model:             { type: String, default: '', trim: true },
  serial_no:         { type: String, default: '', trim: true },
  installation_date: { type: Date, default: null },

  // ── Audit ─────────────────────────────────────────────────────────────────
  is_active:  { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
machineSchema.index({ machine_id:   1 }, { unique: true });
machineSchema.index({ machine_code: 1 }, { unique: true });
machineSchema.index({ work_centre:  1, is_active: 1 });
machineSchema.index({ machine_type: 1, status: 1 });

// ── Pre-save: auto-compute available_hours_per_day ────────────────────────────
machineSchema.pre('save', function (next) {
  this.available_hours_per_day = this.shifts_per_day * this.hours_per_shift;
  next();
});

module.exports = mongoose.model('Machine', machineSchema);