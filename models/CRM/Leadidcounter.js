'use strict';
const mongoose = require('mongoose');

const leadIdCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },  // e.g. "lead-202603"
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('LeadIdCounter', leadIdCounterSchema);