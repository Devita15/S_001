'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// models/CRM/SalesOrderIdCounter.js
//
// Atomic counter for SO number generation.
// Key format: so-YYYYMM  e.g. "so-202503"
// Sequence resets each month (by key change, not by explicit reset).
//
// Usage in SalesOrder pre-save:
//   const counter = await mongoose.model('SalesOrderIdCounter').findOneAndUpdate(
//     { _id: 'so-202503' },
//     { $inc: { seq: 1 } },
//     { upsert: true, new: true }
//   );
//   // counter.seq = 1, 2, 3, ...
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

const salesOrderIdCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },   // e.g. "so-202503"
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('SalesOrderIdCounter', salesOrderIdCounterSchema);