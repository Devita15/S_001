const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema({
  DesignationName: {
    type: String,
    required: [true, 'Designation name is required'],
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  Level: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  Description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  IsActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' }
});

// Pre-save middleware to update UpdatedAt
designationSchema.pre('save', function(next) {
  this.UpdatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Designation', designationSchema);