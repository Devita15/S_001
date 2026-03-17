const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  RoleName: {
    type: String,
    required: [true, 'Role name is required'],
    unique: true,
    trim: true,
    enum: ['SuperAdmin', 'CEO', 'HR', 'Hiring Manager', 'Interviewer', 'Employee']
  },
  Description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  Permissions: [{
    type: String,
    enum: [
      'MANAGE_USERS',
      'MANAGE_ROLES',
      'MANAGE_EMPLOYEES',
      'MANAGE_DEPARTMENTS',
      'MANAGE_DESIGNATIONS',
      'CREATE_REQUISITION',
      'VIEW_ALL_REQUISITIONS',
      'APPROVE_REQUISITION',
      'MANAGE_JOBS',
      'MANAGE_CANDIDATES',
      'SCHEDULE_INTERVIEWS',
      'PROVIDE_FEEDBACK',
      'VIEW_REPORTS',
      'MANAGE_SETTINGS'
    ]
  }],
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
  timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' }
});

// Add indexes
roleSchema.index({ RoleName: 1 });
roleSchema.index({ IsActive: 1 });

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;