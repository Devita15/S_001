const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const createSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find SuperAdmin role
    const superAdminRole = await Role.findOne({ RoleName: 'SuperAdmin' });
    if (!superAdminRole) {
      console.error('SuperAdmin role not found. Run createInitialRoles.js first.');
      process.exit(1);
    }

    // Check if SuperAdmin already exists
    const existingAdmin = await User.findOne({ 
      $or: [
        { Username: 'superadmin' },
        { Email: 'ceo@suyash.com' }
      ]
    });

    if (existingAdmin) {
      console.log('SuperAdmin user already exists');
      process.exit(0);
    }

    // Create SuperAdmin user
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    const superAdmin = await User.create({
      Username: 'superadmin',
      Email: 'ceo@suyash.com',
      PasswordHash: hashedPassword,
      RoleID: superAdminRole._id,
      Status: 'active',
      CreatedAt: new Date()
    });

    console.log('✅ SuperAdmin user created successfully');
    console.log('📧 Email: ceo@suyash.com');
    console.log('🔑 Password: Admin@123');
    console.log('⚠️  Please change this password after first login');

    process.exit(0);
  } catch (error) {
    console.error('Error creating SuperAdmin:', error);
    process.exit(1);
  }
};

createSuperAdmin();