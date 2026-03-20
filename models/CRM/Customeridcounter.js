'use strict';
const mongoose = require('mongoose');
const s = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
module.exports = mongoose.model('CustomerIdCounter', s);