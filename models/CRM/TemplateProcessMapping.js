const mongoose = require('mongoose');

const templateProcessMappingSchema = new mongoose.Schema({
  mapping_id: {
    type: String,
    required: [true, 'Mapping ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  template_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template',
    required: true
  },
  process_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Process',
    required: true
  },
  excel_column_name: {
    type: String,
    required: true
  },
  column_order: {
    type: Number,
    required: true
  },
  is_visible: {
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

// Ensure unique combination
templateProcessMappingSchema.index(
  { template_id: 1, process_id: 1 }, 
  { unique: true }
);

module.exports = mongoose.model('TemplateProcessMapping', templateProcessMappingSchema);