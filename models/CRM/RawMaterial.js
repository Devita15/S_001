'use strict';
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// RAW MATERIAL MASTER
//
// Stores material grades, current market rates, scrap rates,
// transport costs, and profile conversion rates.
//
// Used by:
//   Phase 01 — Lead feasibility (is this grade registered?)
//   Phase 02 — Quotation costing (rm_rate, scrap_rate, transport_rate)
//   Phase 06 — Purchase (vendor pricing comparison)
// ─────────────────────────────────────────────────────────────────────────────

const rawMaterialSchema = new mongoose.Schema({

  // ── Identity ──────────────────────────────────────────────────────────────
  MaterialName: {
    type: String,
    required: [true, 'Material name is required'],
    trim: true,
  },
  Grade: {
    type: String,
    required: [true, 'Grade is required'],
    trim: true,
  },
  Description: { type: String, default: '', trim: true },

  // ── Rates ─────────────────────────────────────────────────────────────────
  RatePerKG: {
    type: Number,
    required: [true, 'Rate per KG is required'],
    min: 0,
  },
  profile_conversion_rate: {
    type: Number,
    default: 0,
    min: 0,
  },
  // total_rm_rate = RatePerKG + profile_conversion_rate (auto-computed)
  total_rm_rate: { type: Number, default: 0, min: 0 },

  // ── Scrap ─────────────────────────────────────────────────────────────────
  ScrapPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  scrap_rate_per_kg: {
    type: Number,
    default: 0,
    min: 0,
    // auto-computed if 0 and ScrapPercentage > 0
  },

  // ── Transport ─────────────────────────────────────────────────────────────
  TransportLossPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  transport_rate_per_kg: {
    type: Number,
    default: 0,
    min: 0,
    // auto-computed if 0 and TransportLossPercentage > 0
  },

  // ── Effective Rate (all-in cost) ──────────────────────────────────────────
  // EffectiveRate = RatePerKG * (1 + (Scrap% + Transport%) / 100)
  EffectiveRate: { type: Number, min: 0 },

  // ── Validity ──────────────────────────────────────────────────────────────
  DateEffective: { type: Date, default: Date.now, required: true },
  DateExpiry:    { type: Date, default: null },

  // ── Physical Properties ───────────────────────────────────────────────────
  density:   { type: Number, default: 0, min: 0 },   // g/cm³ (optional — Item master is primary)
  unit:      { type: String, enum: ['Kg', 'Gram', 'Ton', 'Meter'], default: 'Kg' },

  // ── Audit ─────────────────────────────────────────────────────────────────
  IsActive:   { type: Boolean, default: true },
  CreatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  UpdatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });


// ── Indexes ───────────────────────────────────────────────────────────────────
rawMaterialSchema.index({ MaterialName: 1, Grade: 1 }, { unique: true });
rawMaterialSchema.index({ IsActive: 1 });
rawMaterialSchema.index({ Grade: 1 });
rawMaterialSchema.index({ DateEffective: -1 });


// ── Pre-save: auto-compute all derived rates ──────────────────────────────────
rawMaterialSchema.pre('save', function (next) {

  // total_rm_rate = base rate + profile conversion
  this.total_rm_rate = this.RatePerKG + (this.profile_conversion_rate || 0);

  // scrap rate from percentage
  if (this.scrap_rate_per_kg === 0 && this.ScrapPercentage > 0) {
    this.scrap_rate_per_kg = (this.RatePerKG * this.ScrapPercentage) / 100;
  }

  // transport rate from percentage
  if (this.transport_rate_per_kg === 0 && this.TransportLossPercentage > 0) {
    this.transport_rate_per_kg = (this.RatePerKG * this.TransportLossPercentage) / 100;
  }

  // effective all-in rate
  const totalPct = (this.ScrapPercentage + this.TransportLossPercentage) / 100;
  this.EffectiveRate = this.RatePerKG * (1 + totalPct);

  next();
});


module.exports = mongoose.model('RawMaterial', rawMaterialSchema);