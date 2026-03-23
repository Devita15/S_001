// scripts/createInitialRoles.js
'use strict';

require('dotenv').config();
const mongoose   = require('mongoose');
const Role       = require("../models/user's & setting's/Role");
const Permission = require("../models/user's & setting's/Permission"); // ← must require here so mongoose registers the model

const ROLES = [
  {
    RoleName:     'SuperAdmin',
    Description:  'Super Administrator — full system access, bypasses all permission checks',
    isSuperAdmin: true,
    IsActive:     true,
    moduleAccess: {},
    pageAccess:   {},
    permissions:  []
  },
  {
    RoleName:     'CEO',
    Description:  'Chief Executive Officer — approvals and reports',
    isSuperAdmin: false,
    IsActive:     true,
    moduleAccess: {
      DASHBOARD:          true,
      REQUISITION_MASTER: true,
      INTERVIEW_MASTER:   true,
      REPORTS:            true
    },
    pageAccess: {
      DASHBOARD:          { 'Dashboard':            ['VIEW'] },
      REQUISITION_MASTER: { 'Hiring Requests':      ['VIEW', 'APPROVE', 'REJECT'] },
      INTERVIEW_MASTER:   { 'Interview Scheduling':  ['VIEW', 'APPROVE'] },
      REPORTS: {
        'Recruitment Report': ['VIEW'],
        'Employee Report':    ['VIEW'],
        'Interview Report':   ['VIEW']
      }
    }
  },
  {
    RoleName:     'HR',
    Description:  'Human Resources — manages full recruitment pipeline',
    isSuperAdmin: false,
    IsActive:     true,
    moduleAccess: {
      DASHBOARD:                  true,
      EMPLOYEE_MASTER:            true,
      DEPARTMENT_MASTER:          true,
      DESIGNATION_MASTER:         true,
      LEAVE_TYPE_MASTER:          true,
      REQUISITION_MASTER:         true,
      JOB_OPENING_MASTER:         true,
      CANDIDATE_MASTER:           true,
      INTERVIEW_MASTER:           true,
      SELECTED_CANDIDATES_MASTER: true,
      EMPLOYEE_LEAVE_MASTER:      true,
      ADMIN_LEAVE_MASTER:         true,
      LEAVE_APPROVAL:             true,
      REPORTS:                    true
    },
    pageAccess: {
      DASHBOARD:                  { 'Dashboard':              ['VIEW'] },
      EMPLOYEE_MASTER:            { 'Employee Registry':      ['VIEW', 'CREATE', 'UPDATE', 'EXPORT', 'PRINT'] },
      DEPARTMENT_MASTER:          { 'Department Master':      ['VIEW', 'CREATE', 'UPDATE'] },
      DESIGNATION_MASTER:         { 'Designation Master':     ['VIEW', 'CREATE', 'UPDATE'] },
      LEAVE_TYPE_MASTER:          { 'Leave Policies':         ['VIEW', 'CREATE', 'UPDATE'] },
      REQUISITION_MASTER:         { 'Hiring Requests':        ['VIEW', 'CREATE', 'UPDATE', 'APPROVE', 'REJECT'] },
      JOB_OPENING_MASTER:         { 'Career Opportunities':   ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT'] },
      CANDIDATE_MASTER:           { 'Candidate Master':       ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT'] },
      INTERVIEW_MASTER:           { 'Interview Scheduling':   ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE'] },
      SELECTED_CANDIDATES_MASTER: { 'Selected Candidate':     ['VIEW', 'CREATE', 'UPDATE', 'EXPORT'] },
      EMPLOYEE_LEAVE_MASTER:      { 'Employee Leave Records': ['VIEW', 'EXPORT'] },
      ADMIN_LEAVE_MASTER:         { 'Leave Administration':   ['VIEW', 'CREATE', 'UPDATE', 'APPROVE', 'REJECT'] },
      LEAVE_APPROVAL:             { 'Leave Approval':         ['VIEW', 'APPROVE', 'REJECT'] },
      REPORTS: {
        'Recruitment Report': ['VIEW'],
        'Employee Report':    ['VIEW'],
        'Interview Report':   ['VIEW']
      }
    }
  },
  {
    RoleName:     'Hiring Manager',
    Description:  'Hiring Manager — raises requisitions and gives feedback',
    isSuperAdmin: false,
    IsActive:     true,
    moduleAccess: {
      DASHBOARD:          true,
      REQUISITION_MASTER: true,
      CANDIDATE_MASTER:   true,
      INTERVIEW_MASTER:   true
    },
    pageAccess: {
      DASHBOARD:          { 'Dashboard':            ['VIEW'] },
      REQUISITION_MASTER: { 'Hiring Requests':      ['VIEW', 'CREATE', 'UPDATE'] },
      CANDIDATE_MASTER:   { 'Candidate Master':     ['VIEW'] },
      INTERVIEW_MASTER:   { 'Interview Scheduling': ['VIEW', 'CREATE'] }
    }
  },
  {
    RoleName:     'Interviewer',
    Description:  'Interviewer — views assigned interviews and gives feedback',
    isSuperAdmin: false,
    IsActive:     true,
    moduleAccess: {
      DASHBOARD:        true,
      CANDIDATE_MASTER: true,
      INTERVIEW_MASTER: true
    },
    pageAccess: {
      DASHBOARD:        { 'Dashboard':            ['VIEW'] },
      CANDIDATE_MASTER: { 'Candidate Master':     ['VIEW'] },
      INTERVIEW_MASTER: { 'Interview Scheduling': ['VIEW', 'UPDATE'] }
    }
  },
  {
    RoleName:     'Employee',
    Description:  'Regular employee — self-service only',
    isSuperAdmin: false,
    IsActive:     true,
    moduleAccess: {
      DASHBOARD:             true,
      EMPLOYEE_LEAVE_MASTER: true,
      LEAVE_APPROVAL:        true
    },
    pageAccess: {
      DASHBOARD:             { 'Dashboard':              ['VIEW'] },
      EMPLOYEE_LEAVE_MASTER: { 'Employee Leave Records': ['VIEW', 'CREATE'] },
      LEAVE_APPROVAL:        { 'Leave Approval':         ['VIEW'] }
    }
  }
];

function buildPageAccessMap(pageAccess = {}) {
  const outer = new Map();
  for (const [mod, pages] of Object.entries(pageAccess)) {
    const inner = new Map();
    for (const [page, actions] of Object.entries(pages || {})) {
      inner.set(page, Array.isArray(actions) ? actions : []);
    }
    outer.set(mod, inner);
  }
  return outer;
}

// Uses the top-level Permission require — no mongoose.model() lookup needed
async function resolvePermissions(moduleAccess, pageAccess) {
  const ids = [];

  for (const [moduleKey, enabled] of Object.entries(moduleAccess)) {
    if (!enabled) continue;

    const pagesForModule = pageAccess[moduleKey] || {};

    for (const [pageName, actions] of Object.entries(pagesForModule)) {
      for (const action of actions) {
        const filter = {
          module: moduleKey.toUpperCase(),
          page:   pageName,
          action: action.toUpperCase()
        };

        const perm = await Permission.findOneAndUpdate(
          filter,
          { $setOnInsert: { ...filter, is_active: true } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        ids.push(perm._id);
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  return ids.filter(id => {
    const s = id.toString();
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

async function createInitialRoles() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hr-system';
  await mongoose.connect(uri);
  console.log(`🔗  Connected: ${uri}\n`);

  let created = 0;
  let patched  = 0;
  let skipped  = 0;

  for (const roleDef of ROLES) {
    const existing = await Role.findOne({ RoleName: roleDef.RoleName });

    if (existing) {
      if (roleDef.isSuperAdmin && !existing.isSuperAdmin) {
        await Role.findByIdAndUpdate(existing._id, { $set: { isSuperAdmin: true } });
        console.log(`🔧  Patched  : ${roleDef.RoleName} → isSuperAdmin: true`);
        patched++;
      } else {
        console.log(`⏭️   Skipped  : ${roleDef.RoleName} (already exists)`);
        skipped++;
      }
      continue;
    }

    let permissionIds = [];
    if (!roleDef.isSuperAdmin && Object.keys(roleDef.moduleAccess).length > 0) {
      permissionIds = await resolvePermissions(roleDef.moduleAccess, roleDef.pageAccess);
    }

    await Role.create({
      RoleName:     roleDef.RoleName,
      Description:  roleDef.Description,
      isSuperAdmin: roleDef.isSuperAdmin,
      IsActive:     roleDef.IsActive,
      moduleAccess: new Map(Object.entries(roleDef.moduleAccess).map(([k, v]) => [k, !!v])),
      pageAccess:   buildPageAccessMap(roleDef.pageAccess),
      permissions:  permissionIds
    });

    const permLabel = roleDef.isSuperAdmin
      ? '(SuperAdmin — all permissions via flag)'
      : `(${permissionIds.length} permissions resolved)`;

    console.log(`✅  Created  : ${roleDef.RoleName}  ${permLabel}`);
    created++;
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅  Created : ${created}`);
  console.log(`🔧  Patched : ${patched}`);
  console.log(`⏭️   Skipped : ${skipped}`);
  console.log(`${'─'.repeat(50)}\n`);

  const all = await Role.find({}).select('RoleName isSuperAdmin IsActive permissions').lean();
  console.log('📋  All roles:\n');
  all.forEach(r => {
    const sa    = r.isSuperAdmin ? '👑 SUPERADMIN' : '   regular   ';
    const act   = r.IsActive ? 'active' : 'INACTIVE';
    const perms = r.isSuperAdmin ? 'all (via flag)' : `${r.permissions?.length ?? 0} permissions`;
    console.log(`   ${sa}  |  ${act}  |  ${r.RoleName.padEnd(16)}  |  ${perms}`);
  });

  await mongoose.disconnect();
  console.log('\n✅  Done.');
  process.exit(0);
}

createInitialRoles().catch(err => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});