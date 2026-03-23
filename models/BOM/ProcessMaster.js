const mongoose = require('mongoose');

const processMasterSchema = new mongoose.Schema({
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
    unique: true,
    trim: true
  },
  process_category: {
    type: String,
    required: [true, 'Process category is required'],
    enum: ['Cutting', 'Stamping', 'Drilling', 'Deburring', 'Plating', 
            'Heat Treatment', 'Welding', 'Assembly', 'Inspection', 'Packing']
  },
  rate_type: {
    type: String,
    required: [true, 'Rate type is required'],
    enum: ['Per Nos', 'Per Kg', 'Per Hour', 'Fixed']
  },
  standard_rate: {
    type: Number,
    required: [true, 'Standard rate is required'],
    min: 0
  },
  machine_type_required: {
    type: String,
    enum: ['Press', 'CNC', 'Lathe', 'Milling', 'Drilling', 'Grinding', 
           'Welding', 'Bending', 'Laser Cutting', 'Plating', 'Assembly', 
           'Inspection', 'None'],
    default: 'None'
  },
  skill_required: {
    type: String,
    trim: true
  },
  default_setup_time_min: {
    type: Number,
    default: 0
  },
  default_run_time_min: {
    type: Number,
    default: 0
  },
  default_scrap_pct: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  description: {
    type: String,
    trim: true
  },
  is_subcontract_allowed: {
    type: Boolean,
    default: false
  },
  is_active: {
    type: Boolean,
    default: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes
processMasterSchema.index({ process_id: 1 }, { unique: true });
processMasterSchema.index({ process_name: 1 }, { unique: true });
processMasterSchema.index({ process_category: 1 });
processMasterSchema.index({ is_active: 1 });

module.exports = mongoose.model('ProcessMaster', processMasterSchema);