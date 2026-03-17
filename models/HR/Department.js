const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  DepartmentName: {
    type: String,
    required: [true, 'Department name is required'],
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  Description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  HeadOfDepartment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  },
  IsActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' }
});

// Pre-save middleware to update UpdatedAt
departmentSchema.pre('save', function(next) {
  this.UpdatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Department', departmentSchema);