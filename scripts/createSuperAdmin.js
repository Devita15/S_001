// scripts/createSuperAdmin.js
//
// Creates the SuperAdmin user tied to the SuperAdmin role.
// Run AFTER createInitialRoles.js
//
// Usage:
//   node scripts/createSuperAdmin.js

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const User     = require("../models/user's & setting's/User");
const Role     = require("../models/user's & setting's/Role");

// ─── Credentials — change after first login ──────────────────────────────────
const SUPERADMIN_EMAIL    = 'ceo@suyash.com';
const SUPERADMIN_USERNAME = 'superadmin';
const SUPERADMIN_PASSWORD = 'Admin@123';   // ← will be hashed by pre-save hook

async function createSuperAdmin() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hr-system';
  await mongoose.connect(uri);
  console.log(`🔗  Connected: ${uri}\n`);

  // ── 1. Find the SuperAdmin role ────────────────────────────────────────────
  const superAdminRole = await Role.findOne({ RoleName: 'SuperAdmin' });

  if (!superAdminRole) {
    console.error(' SuperAdmin role not found.');
    console.error('    Run: node scripts/createInitialRoles.js first.\n');
    process.exit(1);
  }

  // Ensure the role has isSuperAdmin: true (fix if missing)
  if (!superAdminRole.isSuperAdmin) {
    await Role.findByIdAndUpdate(superAdminRole._id, { $set: { isSuperAdmin: true } });
    console.log('🔧  Patched SuperAdmin role → isSuperAdmin: true\n');
  }

  // ── 2. Check if the user already exists ───────────────────────────────────
  const existing = await User.findOne({
    $or: [
      { Username: SUPERADMIN_USERNAME },
      { Email: SUPERADMIN_EMAIL }
    ]
  }).populate({ path: 'RoleID', select: 'RoleName isSuperAdmin' });

  if (existing) {
    console.log('⏭️   SuperAdmin user already exists.\n');
    console.log(`   _id      : ${existing._id}`);
    console.log(`   Username : ${existing.Username}`);
    console.log(`   Email    : ${existing.Email}`);
    console.log(`   Status   : ${existing.Status}`);
    console.log(`   Role     : ${existing.RoleID?.RoleName} (isSuperAdmin: ${existing.RoleID?.isSuperAdmin})`);

    // Patch role if it was previously pointing to wrong/old role
    if (existing.RoleID?._id.toString() !== superAdminRole._id.toString()) {
      await User.findByIdAndUpdate(existing._id, { $set: { RoleID: superAdminRole._id } });
      console.log('\n🔧  Patched user → now points to correct SuperAdmin role.');
    }

    await mongoose.disconnect();
    process.exit(0);
  }

  // ── 3. Create the SuperAdmin user ─────────────────────────────────────────
  // NOTE: We pass plain-text password here.
  //       The User model's pre-save hook (bcrypt) handles hashing automatically.
  //       Do NOT pre-hash here — that would double-hash.
  const superAdmin = await User.create({
    Username:     SUPERADMIN_USERNAME,
    Email:        SUPERADMIN_EMAIL,
    PasswordHash: SUPERADMIN_PASSWORD,  // plain text — hashed by pre-save hook
    RoleID:       superAdminRole._id,
    Status:       'active',
    permissions:  []                    // SuperAdmin needs no direct overrides
  });

  console.log('✅  SuperAdmin user created successfully!\n');
  console.log(`   _id      : ${superAdmin._id}`);
  console.log(`   Username : ${superAdmin.Username}`);
  console.log(`   Email    : ${superAdmin.Email}`);
  console.log(`   Role     : ${superAdminRole.RoleName}`);
  console.log('\n─────────────────────────────────────────');
  console.log('  Login credentials:');
  console.log(`  📧 Email    : ${SUPERADMIN_EMAIL}`);
  console.log(`  🔑 Password : ${SUPERADMIN_PASSWORD}`);
  console.log('  ⚠️  Change this password after first login!');
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
  process.exit(0);
}

createSuperAdmin().catch(err => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});