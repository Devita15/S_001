// models/PPEMaster.js
const mongoose = require('mongoose');

const ppeMasterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'PPE name is required'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['Head', 'Eye', 'Hearing', 'Hand', 'Foot', 'Body', 'Respiratory', 'Fall Protection', 'Face'],
    default: 'Body'
  },
  validityDays: {
    type: Number,
    required: [true, 'Validity days is required'],
    min: 1
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  CreatedAt: {
    type: Date,
    default: Date.now
  },
  UpdatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' }
});

module.exports = mongoose.model('PPEMaster', ppeMasterSchema);