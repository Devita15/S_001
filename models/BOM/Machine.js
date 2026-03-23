const mongoose = require('mongoose');

const machineSchema = new mongoose.Schema({
  machine_id: {
    type: String,
    required: [true, 'Machine ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  machine_name: {
    type: String,
    required: [true, 'Machine name is required'],
    trim: true
  },
  machine_code: {
    type: String,
    required: [true, 'Machine code is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  machine_type: {
    type: String,
    required: [true, 'Machine type is required'],
    enum: ['Press', 'CNC', 'Lathe', 'Milling', 'Drilling', 'Grinding', 
            'Welding', 'Bending', 'Laser Cutting', 'Plating', 'Assembly', 
            'Inspection', 'Other']
  },
  capacity_value: {
    type: Number,
    default: 0
  },
  capacity_unit: {
    type: String,
    enum: ['Ton', 'kW', 'mm', 'SPM', 'RPM', 'Liters', 'None'],
    default: 'None'
  },
  work_centre: {
    type: String,
    required: [true, 'Work centre is required'],
    trim: true
  },
  shifts_per_day: {
    type: Number,
    default: 2,
    min: 1,
    max: 3
  },
  hours_per_shift: {
    type: Number,
    default: 8,
    min: 0,
    max: 12
  },
  available_hours_per_day: {
    type: Number,
    default: function() {
      return this.shifts_per_day * this.hours_per_shift;
    }
  },
  oee_target_percent: {
    type: Number,
    default: 75,
    min: 0,
    max: 100
  },
  status: {
    type: String,
    enum: ['Active', 'Idle', 'Under Maintenance', 'Breakdown', 'Decommissioned'],
    default: 'Active'
  },
  make: {
    type: String,
    trim: true
  },
  model: {
    type: String,
    trim: true
  },
  serial_number: {
    type: String,
    trim: true
  },
  installation_date: Date,
  last_maintenance_date: Date,
  next_maintenance_date: Date,
  location: {
    type: String,
    trim: true
  },
  operating_cost_per_hour: {
    type: Number,
    default: 0
  },
  maintenance_cost_per_hour: {
    type: Number,
    default: 0
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

// Pre-save middleware to compute available hours
machineSchema.pre('save', function(next) {
  this.available_hours_per_day = this.shifts_per_day * this.hours_per_shift;
  next();
});

// Indexes
machineSchema.index({ machine_id: 1 }, { unique: true });
machineSchema.index({ machine_code: 1 }, { unique: true });
machineSchema.index({ work_centre: 1 });
machineSchema.index({ status: 1 });
machineSchema.index({ machine_type: 1 });

module.exports = mongoose.model('Machine', machineSchema);