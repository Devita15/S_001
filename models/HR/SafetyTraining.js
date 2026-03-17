// models/SafetyTraining.js
const mongoose = require('mongoose');

const safetyTrainingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Training title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['General', 'Fire Safety', 'Machine Safety', 'Material Handling', 'Chemical Safety', 'Safety Compliance', 'Electrical Safety', 'First Aid', 'Emergency Response'],
    default: 'General'
  },
  durationHours: {
    type: Number,
    required: [true, 'Duration is required'],
    min: 0.5
  },
  validityMonths: {
    type: Number,
    required: [true, 'Validity months is required'],
    min: 1
  },
  isMandatory: {
    type: Boolean,
    default: false
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
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

module.exports = mongoose.model('SafetyTraining', safetyTrainingSchema);