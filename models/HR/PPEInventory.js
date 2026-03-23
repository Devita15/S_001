// models/PPEInventory.js
const mongoose = require('mongoose');

const ppeInventorySchema = new mongoose.Schema({
  ppe: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PPEMaster',
    required: [true, 'PPE is required']
  },
  sku: String,
  batchNumber: String,
  manufacturer: String,
  supplier: String,
  purchaseDate: Date,
  expiryDate: Date,
  unitPrice: Number,
  quantityReceived: {
    type: Number,
    default: 0,
    min: 0
  },
  quantityAvailable: {
    type: Number,
    default: 0,
    min: 0
  },
  quantityIssued: {
    type: Number,
    default: 0,
    min: 0
  },
  quantityDamaged: {
    type: Number,
    default: 0,
    min: 0
  },
  quantityLost: {
    type: Number,
    default: 0,
    min: 0
  },
  minimumStockLevel: {
    type: Number,
    default: 10,
    min: 0
  },
  reorderLevel: {
    type: Number,
    default: 20,
    min: 0
  },
  storageLocation: String,
  shelfNumber: String,
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

// Indexes
ppeInventorySchema.index({ ppe: 1 });
ppeInventorySchema.index({ quantityAvailable: 1 });

// Virtual for stock status
ppeInventorySchema.virtual('stockStatus').get(function() {
  if (this.quantityAvailable <= this.minimumStockLevel) return 'Critical';
  if (this.quantityAvailable <= this.reorderLevel) return 'Low';
  return 'Adequate';
});

module.exports = mongoose.model('PPEInventory', ppeInventorySchema);