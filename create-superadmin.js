const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
dotenv.config();
const createSuperadmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Import models
    const Role = require('./models/Role');
    const User = require('./models/User');

    // Step 1: Create Super Admin Role if not exists
    let superadminRole = await Role.findOne({ RoleName: 'SuperAdmin' });
    
    if (!superadminRole) {
      superadminRole = await Role.create({
        RoleName: 'SuperAdmin',
        Description: 'Super Administrator with full system access',
        IsActive: true
      });
      console.log('SuperAdmin role created');
    } else {
      console.log('SuperAdmin role already exists');
    }

    // Step 2: Create Admin Role if not exists
    let adminRole = await Role.findOne({ RoleName: 'Admin' });
    
    if (!adminRole) {
      adminRole = await Role.create({
        RoleName: 'Admin',
        Description: 'System Administrator',
        IsActive: true
      });
      console.log('Admin role created');
    }

    // Step 3: Check if superadmin user already exists
    const existingSuperadmin = await User.findOne({ 
      $or: [
        { Username: 'superadmin' },
        { Email: 'superadmin@company.com' }
      ]
    });
    
    if (existingSuperadmin) {
      console.log('Superadmin user already exists');
      console.log('Username: superadmin');
      console.log('Email: superadmin@company.com');
      console.log('You can login with this account');
      process.exit(1);
    }

    // Step 4: Create superadmin user
    const superadminUser = await User.create({
      Username: 'superadmin',
      Email: 'superadmin@company.com',
      PasswordHash: 'SuperAdmin@123', // Will be hashed by pre-save middleware
      RoleID: superadminRole._id,
      Status: 'active'
      // No EmployeeID - this is intentional for superadmin
    });

    console.log('\nSUPERADMIN CREATED SUCCESSFULLY!');
    console.log('='.repeat(40));
    console.log('Login Credentials:');
    console.log('Email: superadmin@company.com');
    console.log('Password: SuperAdmin@123');
    console.log('Username: superadmin');
    console.log('Role: SuperAdmin');
    console.log('='.repeat(40));
    console.log('\n⚠️  IMPORTANT: Change the password after first login!');
    
    process.exit(0);
    
  } catch (error) {
    console.error('Error creating superadmin:', error.message);
    process.exit(1);
  }
};

createSuperadmin();