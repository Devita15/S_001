const mongoose = require('mongoose');
const itemSchema = new mongoose.Schema({
  // ==== EXISTING FIELDS ============
  item_id: {
    type: String,
    required: [true, 'Item ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  part_no: {
    type: String,
    required: [true, 'Part number is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  part_description: {
    type: String,
    required: [true, 'Part description is required'],
    trim: true
  },
  drawing_no: {
    type: String,
    trim: true
  },
  revision_no: {
    type: String,
    default: '0'
  },
  rm_grade: {
    type: String,
    required: [true, 'RM Grade is required'],
    trim: true
  },
  density: {
    type: Number,
    required: [true, 'Density is required'],
    min: 0.1
  },
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    enum: ['Nos', 'Kg', 'Meter', 'Set', 'Piece'],
    default: 'Nos'
  },
  hsn_code: {
    type: String,
    required: [true, 'HSN code is required']
  },
  
  // ==== NEW FIELDS FOR TEMPLATE 2 ============
  // Item Information for Landed Cost Template
  item_no: {
    type: String,
    trim: true,
    default: function() {
      return this.part_no; // Default to part_no if not provided
    }
  },
  material: {
    type: String,
    trim: true,
    default: ''
  },
  rm_source: {
    type: String,
    trim: true,
    default: ''
  },
  rm_type: {
    type: String,
    trim: true,
    default: ''
  },
  rm_spec: {
    type: String,
    trim: true,
    default: ''
  },
  
  // Dimensions for Template 2
  strip_size: {
    type: Number,
    default: 0,
    min: 0
  },
  pitch: {
    type: Number,
    default: 0,
    min: 0
  },
  no_of_cavity: {
    type: Number,
    default: 1,
    min: 1
  },
  
  // Rejection & Scrap Percentages
  rm_rejection_percent: {
    type: Number,
    default: 2.0,
    min: 0,
    max: 100
  },
  scrap_realisation_percent: {
    type: Number,
    default: 98,
    min: 0,
    max: 100
  },
  
  // ==== STATUS FIELDS ============
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

// Pre-save middleware to set defaults
itemSchema.pre('save', function(next) {
  // Set item_no from part_no if not provided
  if (!this.item_no && this.part_no) {
    this.item_no = this.part_no;
  }
  
  // Set material based on rm_grade if not provided (optional)
  if (!this.material && this.rm_grade) {
    if (this.rm_grade.includes('C')) {
      this.material = 'Copper';
    } else if (this.rm_grade.includes('AL')) {
      this.material = 'Aluminum';
    } else if (this.rm_grade.includes('SS')) {
      this.material = 'Stainless Steel';
    } else {
      this.material = this.rm_grade;
    }
  }
  
  next();
});

// Indexes for search optimization
itemSchema.index({ part_no: 'text', part_description: 'text', drawing_no: 'text', rm_grade: 'text' });
itemSchema.index({ item_no: 1 });
itemSchema.index({ is_active: 1 });

module.exports = mongoose.model('Item', itemSchema);