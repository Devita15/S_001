const mongoose = require('mongoose');
const Role = require('../models/Role');
require('dotenv').config();

const createInitialRoles = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const roles = [
      {
        RoleName: 'SuperAdmin',
        Description: 'Super Administrator with full system access (CEO)',
        Permissions: [
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
        ],
        IsActive: true
      },
      {
        RoleName: 'CEO',
        Description: 'Chief Executive Officer',
        Permissions: [
          'VIEW_ALL_REQUISITIONS',
          'APPROVE_REQUISITION',
          'VIEW_REPORTS'
        ],
        IsActive: true
      },
      {
        RoleName: 'HR',
        Description: 'Human Resources',
        Permissions: [
          'CREATE_REQUISITION',
          'VIEW_ALL_REQUISITIONS',
          'MANAGE_JOBS',
          'MANAGE_CANDIDATES',
          'SCHEDULE_INTERVIEWS',
          'PROVIDE_FEEDBACK',
          'VIEW_REPORTS'
        ],
        IsActive: true
      },
      {
        RoleName: 'Hiring Manager',
        Description: 'Hiring Manager',
        Permissions: [
          'CREATE_REQUISITION',
          'VIEW_ALL_REQUISITIONS',
          'PROVIDE_FEEDBACK'
        ],
        IsActive: true
      },
      {
        RoleName: 'Interviewer',
        Description: 'Interviewer',
        Permissions: [
          'PROVIDE_FEEDBACK'
        ],
        IsActive: true
      },
      {
        RoleName: 'Employee',
        Description: 'Regular Employee',
        Permissions: [],
        IsActive: true
      }
    ];

    for (const roleData of roles) {
      const existingRole = await Role.findOne({ RoleName: roleData.RoleName });
      if (!existingRole) {
        await Role.create(roleData);
        console.log(`✅ Role created: ${roleData.RoleName}`);
      } else {
        console.log(`⏭️ Role already exists: ${roleData.RoleName}`);
      }
    }

    console.log('Initial roles setup completed');
    process.exit(0);
  } catch (error) {
    console.error('Error creating initial roles:', error);
    process.exit(1);
  }
};

createInitialRoles();