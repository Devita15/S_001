const mongoose = require('mongoose');
const materialSchema = new mongoose.Schema({
  material_id: {
    type: String,
    required: [true, 'Material ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  MaterialCode: {
    type: String,
    required: [true, 'Material code is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  MaterialName: {
    type: String,
    required: [true, 'Material name is required'],
    trim: true
  },
  Description: {
    type: String,
    trim: true
  },
  Density: {
    type: Number,
    required: [true, 'Density is required'],
    min: [0.1, 'Density must be at least 0.1 g/cm³'],
    max: [25, 'Density cannot exceed 25 g/cm³']
  },
  Unit: {
    type: String,
    required: [true, 'Unit is required'],
    enum: ['Kg', 'Gram', 'Ton'],
    default: 'Kg'
  },
  Standard: {
    type: String,
    trim: true
  },
  Grade: {
    type: String,
    trim: true
  },
  Color: {
    type: String,
    trim: true
  },
  EffectiveRate: {
    type: Number,
    required: [true, 'Effective rate is required'],
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

// Indexes
materialSchema.index({ MaterialCode: 1 });
materialSchema.index({ material_id: 1 });
materialSchema.index({ IsActive: 1 });

module.exports = mongoose.model('Material', materialSchema);