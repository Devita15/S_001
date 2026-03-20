'use strict';
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSION WEIGHT MASTER
//
// Stores T × W × L dimensions for each part and auto-computes
// VolumeMM3 and WeightInKG on save.
//
// Used by:
//   Phase 01 — Lead feasibility (can we compute weight for this part?)
//   Phase 02 — Quotation costing (gross_weight_kg = T×W×L×density / 1,000,000)
// ─────────────────────────────────────────────────────────────────────────────

const dimensionWeightSchema = new mongoose.Schema({

  // ── Part linkage ──────────────────────────────────────────────────────────
  PartNo: {
    type: String,
    required: [true, 'Part number is required'],
    ref: 'Item',
    uppercase: true,
    trim: true,
    unique: true,
  },

  // ── Dimensions (mm) ───────────────────────────────────────────────────────
  Thickness: {
    type: Number,
    required: [true, 'Thickness is required'],
    min: [0.1, 'Thickness must be at least 0.1 mm'],
    max: [1000, 'Thickness cannot exceed 1000 mm'],
  },
  Width: {
    type: Number,
    required: [true, 'Width is required'],
    min: [0.1,  'Width must be at least 0.1 mm'],
    max: [5000, 'Width cannot exceed 5000 mm'],
  },
  Length: {
    type: Number,
    required: [true, 'Length is required'],
    min: [0.1,   'Length must be at least 0.1 mm'],
    max: [10000, 'Length cannot exceed 10000 mm'],
  },

  // ── Physical ──────────────────────────────────────────────────────────────
  Density: {
    type: Number,
    required: [true, 'Density is required'],
    min: [0.1, 'Density must be at least 0.1'],
    max: [30,  'Density cannot exceed 30 g/cm³'],
  },

  // ── Calculated (auto-set in pre-save) ─────────────────────────────────────
  VolumeMM3: { type: Number, min: 0 },    // T × W × L
  WeightInKG: { type: Number, min: 0 },   // (VolumeMM3 × Density) / 1,000,000

  // ── Audit ─────────────────────────────────────────────────────────────────
  CreatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  UpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});


// ── Indexes ───────────────────────────────────────────────────────────────────
dimensionWeightSchema.index({ PartNo:    1 }, { unique: true });
dimensionWeightSchema.index({ WeightInKG: 1 });


// ── Virtuals ──────────────────────────────────────────────────────────────────
dimensionWeightSchema.virtual('DimensionsFormatted').get(function () {
  return `T: ${this.Thickness}mm × W: ${this.Width}mm × L: ${this.Length}mm`;
});

dimensionWeightSchema.virtual('WeightFormatted').get(function () {
  return `${this.WeightInKG?.toFixed(3)} Kg`;
});


// ── Pre-save: compute Volume and Weight ───────────────────────────────────────
dimensionWeightSchema.pre('save', function (next) {
  this.VolumeMM3  = this.Thickness * this.Width * this.Length;
  this.WeightInKG = Math.round((this.VolumeMM3 * this.Density) / 1_000_000 * 1000) / 1000;
  next();
});


// ── Pre-findOneAndUpdate: recompute if dimensions change ──────────────────────
dimensionWeightSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate();
  const doc    = await this.model.findOne(this.getQuery());
  if (!doc) return next();

  const T = update.Thickness !== undefined ? update.Thickness : doc.Thickness;
  const W = update.Width     !== undefined ? update.Width     : doc.Width;
  const L = update.Length    !== undefined ? update.Length    : doc.Length;
  const D = update.Density   !== undefined ? update.Density   : doc.Density;

  update.VolumeMM3  = T * W * L;
  update.WeightInKG = Math.round((update.VolumeMM3 * D) / 1_000_000 * 1000) / 1000;
  next();
});


module.exports = mongoose.model('DimensionWeight', dimensionWeightSchema);