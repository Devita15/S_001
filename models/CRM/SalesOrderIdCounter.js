'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// models/CRM/SalesOrderIdCounter.js
// Atomic sequential counter for SO-YYYYMM-XXXX numbering
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String },          // key e.g. "so-202503"
  seq: { type: Number, default: 0 },
});

// Safe repeated require — mongoose caches models
let SalesOrderIdCounter;
try {
  SalesOrderIdCounter = mongoose.model('SalesOrderIdCounter');
} catch (_) {
  SalesOrderIdCounter = mongoose.model('SalesOrderIdCounter', counterSchema);
}

module.exports = SalesOrderIdCounter;