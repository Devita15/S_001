const mongoose = require('mongoose');

const pieceRateMasterSchema = new mongoose.Schema({
  productType: {
    type: String,
    required: true,
    trim: true
  },
  operation: {
    type: String,
    required: true,
    trim: true
  },
  ratePerUnit: {
    type: Number,
    required: true,
    min: 0
  },
  uom: {
    type: String,
    required: true,
    enum: ['piece', 'dozen', 'kg', 'meter', 'hour'],
    default: 'piece'
  },
  skillLevel: {
    type: String,
    enum: ['Unskilled', 'Semi-Skilled', 'Skilled', 'Highly Skilled']
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  effectiveFrom: {
    type: Date,
    required: true
  },
  effectiveTo: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

pieceRateMasterSchema.index(
  { productType: 1, operation: 1, effectiveFrom: 1 },
  { unique: true }
);

module.exports = mongoose.model('PieceRateMaster', pieceRateMasterSchema);