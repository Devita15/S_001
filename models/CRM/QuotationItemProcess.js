const mongoose = require('mongoose');
const quotationItemProcessSchema = new mongoose.Schema({
  qip_id: {
    type: String,
    required: [true, 'Quotation Item Process ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  quotation_item_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuotationItem',
    required: true
  },
  process_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Process',
    required: true
  },
  process_name: {
    type: String,
    required: true
  },
  rate_type: {
    type: String,
    enum: ['Per Nos', 'Per Kg', 'Per Hour', 'Fixed'],
    required: true
  },
  rate_used: {
    type: Number,
    required: true,
    min: 0
  },
  calculated_cost: {
    type: Number,
    required: true,
    min: 0
  },
  CreatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  UpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for faster queries
quotationItemProcessSchema.index({ quotation_item_id: 1 });
quotationItemProcessSchema.index({ process_id: 1 });

module.exports = mongoose.model('QuotationItemProcess', quotationItemProcessSchema);