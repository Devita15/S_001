const mongoose = require('mongoose');
const processSchema = new mongoose.Schema({
  process_id: {
    type: String,
    required: [true, 'Process ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  process_name: {
    type: String,
    required: [true, 'Process name is required'],
    trim: true,
    unique: true
  },
  category: {
    type: String,
    required: [true, 'Process category is required'],
    enum: ['Core', 'Finishing', 'Packing', 'Other'],
    default: 'Core'
  },
  rate_type: {
    type: String,
    required: [true, 'Rate type is required'],
    enum: ['Per Kg', 'Per Nos', 'Per Hour', 'Fixed']
  },
  is_active: {
    type: Boolean,
    default: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});
module.exports = mongoose.model('Process', processSchema);