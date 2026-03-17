const mongoose = require('mongoose');

const processDetailSchema = new mongoose.Schema({
  PartNo: {
    type: String,
    required: true,
    ref: 'Item',
    uppercase: true
  },
  OperationDescription: {
    type: String,
    required: true
  },
  Operation: {
    type: String,
    required: true
  },
  Machine: {
    type: String,
    required: true
  },
  Manday: {
    type: Number,
    required: true,
    min: 0
  },
  Rate: {
    type: Number,
    required: true,
    min: 0
  },
  Amount: {
    type: Number,
    min: 0
  },
  IsActive: {
    type: Boolean,
    default: true
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

processDetailSchema.pre('save', function(next) {
  this.Amount = this.Manday * this.Rate;
  next();
});

module.exports = mongoose.model('ProcessDetail', processDetailSchema);