// scripts/bootstrapPermissions.js
//
// Seeds every permission defined in permissionCatalog into MongoDB.
// Safe to run multiple times — only creates what's missing.
//
// CLI:
//   node scripts/bootstrapPermissions.js           → add missing
//   node scripts/bootstrapPermissions.js --check   → dry-run
//   node scripts/bootstrapPermissions.js --list    → print all in DB
//   node scripts/bootstrapPermissions.js --debug   → counts + samples

'use strict';

const mongoose        = require('mongoose');
const Permission = require('../models/user\'s & setting\'s/Permission');
const catalog  = require('../config/permissionCatalog');

// ── Module structure exposed to roleController (for API /sidebar-structure) ──
const sidebarStructure = catalog.modules.reduce((acc, item) => {
  const key = item.key;
  if (!acc[key]) {
    acc[key] = {
      category:             item.category,
      pages:                [],
      availablePermissions: new Set()
    };
  }
  acc[key].pages.push({ page: item.page, actions: item.actions });
  item.actions.forEach(a => acc[key].availablePermissions.add(a));
  return acc;
}, {});

// Convert Sets to Arrays for JSON serialisation
Object.keys(sidebarStructure).forEach(k => {
  sidebarStructure[k].availablePermissions = [...sidebarStructure[k].availablePermissions];
});

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrapPermissions(adminUserId = null) {
  console.log('\n🚀  Permission Bootstrap — idempotent (only adds what is missing)');
  console.log('═'.repeat(64));

  const before = await Permission.countDocuments();
  console.log(`📊  Permissions in DB before: ${before}\n`);

  let created  = 0;
  let existing = 0;
  const errors = [];

  for (const item of catalog.modules) {
    const { key: module, page, actions } = item;

    for (const action of actions) {
      try {
        const filter = {
          module: module.toUpperCase(),
          page,
          action: action.toUpperCase()
        };

        const result = await Permission.findOneAndUpdate(
          filter,
          { $setOnInsert: { ...filter, is_active: true, createdBy: adminUserId } },
          { upsert: true, new: false, setDefaultsOnInsert: true }  // new:false → null if created
        );

        if (result === null) {
          // upsert inserted a new doc
          process.stdout.write('+');
          created++;
        } else {
          process.stdout.write('.');
          existing++;
        }
      } catch (err) {
        if (err.code === 11000) { existing++; process.stdout.write('.'); continue; }
        errors.push(`${module}.${page}.${action} → ${err.message}`);
        process.stdout.write('✗');
      }
    }
  }

  const after = await Permission.countDocuments();

  console.log('\n\n' + '═'.repeat(64));
  console.log('✅  Bootstrap complete');
  console.log(`   + Created  : ${created}`);
  console.log(`   . Existing : ${existing}`);
  console.log(`   DB total   : ${after}`);

  if (errors.length) {
    console.log(`\n⚠️   Errors (${errors.length}):`);
    errors.forEach(e => console.log(`   - ${e}`));
  }

  return { created, existing, total: after, errors };
}

// ── Dry-run: just show what would be created ─────────────────────────────────
async function checkMissingPermissions() {
  console.log('\n🔍  Checking for missing permissions (dry-run)…\n');
  const missing = [];

  for (const item of catalog.modules) {
    const { key: module, page, actions } = item;
    for (const action of actions) {
      const exists = await Permission.findOne({
        module: module.toUpperCase(), page, action: action.toUpperCase()
      });
      if (!exists) missing.push(`${module}.${page}.${action}`);
    }
  }

  if (!missing.length) {
    console.log('✅  All permissions are up to date.');
  } else {
    console.log(`⚠️   ${missing.length} missing permission(s):\n`);
    missing.forEach(m => console.log(`   - ${m}`));
  }
  return missing;
}

// ── List all DB permissions ──────────────────────────────────────────────────
async function listPermissions() {
  const perms = await Permission
    .find({})
    .sort({ module: 1, page: 1, action: 1 })
    .lean();

  console.log(`\n📋  All permissions in DB (${perms.length}):\n`);
  let lastModule = '';
  for (const p of perms) {
    if (p.module !== lastModule) {
      console.log(`\n  [${p.module}]`);
      lastModule = p.module;
    }
    console.log(`    ${p.page.padEnd(40)} ${p.action}`);
  }
}

// ── Debug stats ──────────────────────────────────────────────────────────────
async function debugPermissions() {
  const total   = await Permission.countDocuments();
  const active  = await Permission.countDocuments({ is_active: true });
  const modules = await Permission.distinct('module');
  const sample  = await Permission.find({}).limit(5).lean();

  console.log(`\n🛠   Debug Stats`);
  console.log(`   Total           : ${total}`);
  console.log(`   Active          : ${active}`);
  console.log(`   Modules (${modules.length})     : ${modules.join(', ')}`);
  console.log(`\n   Sample (first 5):`);
  sample.forEach(p => console.log(`   ${p.module}.${p.page}.${p.action}`));
}

// ── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  sidebarStructure,
  bootstrapPermissions,
  checkMissingPermissions,
  listPermissions,
  debugPermissions
};

// ── CLI entry ────────────────────────────────────────────────────────────────
if (require.main === module) {
  require('dotenv').config();
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hr-system';

  mongoose.connect(uri)
    .then(async () => {
      console.log(`🔗  MongoDB: ${uri}`);
      const args = process.argv.slice(2);

      if      (args.includes('--check'))  await checkMissingPermissions();
      else if (args.includes('--list'))   await listPermissions();
      else if (args.includes('--debug'))  await debugPermissions();
      else                                await bootstrapPermissions();

      process.exit(0);
    })
    .catch(err => { console.error('❌', err.message); process.exit(1); });
}