// models/Holiday.js
const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  Name: {
    type: String,
    required: [true, 'Holiday name is required'],
    trim: true,
    maxlength: 100
  },
  Date: {
    type: Date,
    required: true
  },
  Type: {
    type: String,
    required: true,
    enum: ['National', 'State', 'Festival', 'Optional', 'Company'],
    default: 'National'
  },
  Description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  Year: {
    type: Number,
    required: true
  },
  IsRecurring: {
    type: Boolean,
    default: false
  },
  ApplicableDepartments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }],
  IsActive: {
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

holidaySchema.pre('save', function(next) {
  this.UpdatedAt = Date.now();
  next();
  
  // Set year from date
  if (this.Date) {
    this.Year = this.Date.getFullYear();
  }
});

module.exports = mongoose.model('Holiday', holidaySchema);