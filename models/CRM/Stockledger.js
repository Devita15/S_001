'use strict';
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// STOCK LEDGER
//
// Real-time stock balance per item per warehouse per bin per batch.
// One record per unique (item_id + warehouse_id + bin_id + batch_no).
//
// Used by:
//   Phase 07 — Inventory (available_qty for MIV issuance)
//   Phase 01 — Feasibility check (is RM already in stock?)
//   Phase 05 — MRP (opening_stock for net requirement calculation)
// ─────────────────────────────────────────────────────────────────────────────

const stockLedgerSchema = new mongoose.Schema({

  // ── Identity ──────────────────────────────────────────────────────────────
  stock_id: {
    type: String,
    required: [true, 'Stock ID is required'],
    unique: true,
    trim: true,
    uppercase: true,
  },

  // ── Item ──────────────────────────────────────────────────────────────────
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

  // ── Location ──────────────────────────────────────────────────────────────
  warehouse_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    required: [true, 'Warehouse is required'],
  },
  bin_id:   { type: String, default: '', trim: true },
  batch_no: { type: String, default: '', trim: true },

  // ── Quantities ────────────────────────────────────────────────────────────
  quantity:      { type: Number, default: 0, min: 0 },
  reserved_qty:  { type: Number, default: 0, min: 0 },
  available_qty: { type: Number, default: 0, min: 0 }, // computed: quantity - reserved_qty

  // ── Unit ──────────────────────────────────────────────────────────────────
  unit: {
    type: String,
    enum: ['Nos', 'Kg', 'Meter', 'Sheet', 'Roll', 'Piece', 'Set'],
    default: 'Nos',
  },

  // ── Valuation ─────────────────────────────────────────────────────────────
  valuation_method: {
    type: String,
    enum: ['FIFO', 'Weighted Average'],
    default: 'Weighted Average',
  },
  unit_cost:   { type: Number, default: 0, min: 0 },
  total_value: { type: Number, default: 0, min: 0 }, // computed: quantity × unit_cost

  // ── Reorder ───────────────────────────────────────────────────────────────
  min_stock:        { type: Number, default: 0, min: 0 },
  max_stock:        { type: Number, default: 0, min: 0 },
  is_below_reorder: { type: Boolean, default: false },

  // ── Audit ─────────────────────────────────────────────────────────────────
  last_updated: { type: Date, default: Date.now },
  last_txn_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'StockTransaction', default: null },

}, { timestamps: true });

// ── Compound unique index: one record per item+warehouse+bin+batch ────────────
stockLedgerSchema.index(
  { item_id: 1, warehouse_id: 1, bin_id: 1, batch_no: 1 },
  { unique: true }
);
stockLedgerSchema.index({ part_no: 1 });
stockLedgerSchema.index({ warehouse_id: 1, is_below_reorder: 1 });
stockLedgerSchema.index({ item_id: 1 });

// ── Pre-save: recompute available_qty and total_value ─────────────────────────
stockLedgerSchema.pre('save', function (next) {
  this.available_qty = Math.max(0, this.quantity - this.reserved_qty);
  this.total_value   = Math.round(this.quantity * this.unit_cost * 100) / 100;
  this.is_below_reorder = this.min_stock > 0 && this.quantity < this.min_stock;
  this.last_updated  = new Date();
  next();
});

module.exports = mongoose.model('StockLedger', stockLedgerSchema);