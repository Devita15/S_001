
// controllers/roleController.js
'use strict';

const mongoose    = require('mongoose');
const Role = require('../../models/user\'s & setting\'s/Role');
const Permission = require('../../models/user\'s & setting\'s/Permission');
const User = require('../../models/user\'s & setting\'s/User');
const { sidebarStructure } = require('../../scripts/bootstrapPermissions');

// ── Serialise nested Maps → plain objects for JSON ───────────────────────────
function mapToObj(val) {
  if (val instanceof Map) {
    const out = {};
    for (const [k, v] of val.entries()) out[k] = mapToObj(v);
    return out;
  }
  if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = mapToObj(v);
    return out;
  }
  return val;
}

function formatRole(role) {
  return {
    _id:              role._id,
    RoleName:         role.RoleName,
    Description:      role.Description || '',
    isSuperAdmin:     role.isSuperAdmin,
    IsActive:         role.IsActive,
    moduleAccess:     mapToObj(role.moduleAccess),
    pageAccess:       mapToObj(role.pageAccess),
    permissions:      role.permissions || [],
    permissionsCount: (role.permissions || []).length,
    CreatedAt:        role.CreatedAt,
    UpdatedAt:        role.UpdatedAt
  };
}

// ── Resolve Permission IDs from the access payload ───────────────────────────
//
// moduleAccess  { "COMPANY_MASTER": true, "DASHBOARD": true }
// pageAccess    { "COMPANY_MASTER": { "Organization / Company": ["VIEW","CREATE"] } }
//
// Rules:
//  - Module false  → skip entirely
//  - Module true   → only generate perms for pages that are explicitly listed
//  - Page actions  → find-or-create Permission docs for each action
//
async function resolvePermissionIds(moduleAccess = {}, pageAccess = {}, createdBy) {
  const ids = [];

  for (const [moduleKey, enabled] of Object.entries(moduleAccess)) {
    if (!enabled) continue;

    const pagesForModule = pageAccess[moduleKey] || {};

    for (const [pageName, actions] of Object.entries(pagesForModule)) {
      if (!Array.isArray(actions) || actions.length === 0) continue;

      for (const action of actions) {
        const perm = await Permission.findOrCreate(moduleKey, pageName, action, createdBy);
        ids.push(perm._id);
      }
    }
  }

  // Deduplicate by string comparison
  const seen = new Set();
  return ids.filter(id => {
    const s = id.toString();
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

// ── pageAccess object → nested Map for storage ───────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE ROLE
// POST /api/roles
// Body: { RoleName, Description?, isSuperAdmin?, moduleAccess, pageAccess }
// ═══════════════════════════════════════════════════════════════════════════════
exports.createRole = async (req, res, next) => {
  try {
    const {
      RoleName,
      Description  = '',
      isSuperAdmin = false,
      moduleAccess = {},
      pageAccess   = {}
    } = req.body;

    if (!RoleName?.trim()) {
      return res.status(400).json({ success: false, message: 'RoleName is required' });
    }

    const exists = await Role.findOne({ RoleName: RoleName.trim() });
    if (exists) return res.status(409).json({ success: false, message: 'Role already exists' });

    const role = await Role.create({
      RoleName:     RoleName.trim(),
      Description,
      isSuperAdmin: !!isSuperAdmin,
      IsActive:     true,
      moduleAccess: new Map(Object.entries(moduleAccess).map(([k, v]) => [k, !!v])),
      pageAccess:   buildPageAccessMap(pageAccess),
      permissions:  [],
      CreatedBy:    req.user._id
    });

    // SuperAdmin role: no permission list needed — bypass is handled in User.getAllPermissions()
    if (!isSuperAdmin) {
      role.permissions = await resolvePermissionIds(moduleAccess, pageAccess, req.user._id);
      await role.save();
    }

    const populated = await Role.findById(role._id)
      .populate({ path: 'permissions', select: 'module page action name' });

    return res.status(201).json({ success: true, data: formatRole(populated) });

  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET ALL ROLES
// GET /api/roles?search=&isActive=&page=&limit=
// ═══════════════════════════════════════════════════════════════════════════════
exports.getAllRoles = async (req, res, next) => {
  try {
    const { search, isActive, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (search)             filter.RoleName = { $regex: search, $options: 'i' };
    if (isActive !== undefined) filter.IsActive = isActive === 'true';

    const [roles, total] = await Promise.all([
      Role.find(filter)
        .populate({ path: 'permissions', select: 'module page action name' })
        .sort({ CreatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      Role.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      total,
      data:    roles.map(formatRole)
    });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET ONE ROLE
// GET /api/roles/:id
// ═══════════════════════════════════════════════════════════════════════════════
exports.getRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id)
      .populate({ path: 'permissions', select: 'module page action name is_active' });

    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

    return res.status(200).json({ success: true, data: formatRole(role) });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE ROLE
// PATCH /api/roles/:id
// Partial update — send only what you want to change
// ═══════════════════════════════════════════════════════════════════════════════
exports.updateRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

    const { RoleName, Description, IsActive, isSuperAdmin, moduleAccess, pageAccess } = req.body;

    if (RoleName !== undefined) {
      const clash = await Role.findOne({ RoleName: RoleName.trim(), _id: { $ne: role._id } });
      if (clash) return res.status(409).json({ success: false, message: 'Role name already taken' });
      role.RoleName = RoleName.trim();
    }
    if (Description  !== undefined) role.Description  = Description;
    if (IsActive     !== undefined) role.IsActive      = IsActive;
    if (isSuperAdmin !== undefined) role.isSuperAdmin  = !!isSuperAdmin;

    // If access maps are being updated, regenerate the permission list
    if (moduleAccess !== undefined || pageAccess !== undefined) {
      const ma = moduleAccess ?? mapToObj(role.moduleAccess);
      const pa = pageAccess   ?? mapToObj(role.pageAccess);

      role.moduleAccess = new Map(Object.entries(ma).map(([k, v]) => [k, !!v]));
      role.pageAccess   = buildPageAccessMap(pa);
      role.permissions  = role.isSuperAdmin
        ? []
        : await resolvePermissionIds(ma, pa, req.user._id);
    }

    role.UpdatedBy = req.user._id;
    await role.save();

    const populated = await Role.findById(role._id)
      .populate({ path: 'permissions', select: 'module page action name' });

    return res.status(200).json({ success: true, data: formatRole(populated) });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE ROLE
// DELETE /api/roles/:id
// ═══════════════════════════════════════════════════════════════════════════════
exports.deleteRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });

    if (role.isSuperAdmin) {
      return res.status(400).json({ success: false, message: 'Cannot delete a SuperAdmin role' });
    }

    const activeUsers = await User.countDocuments({ RoleID: role._id, Status: 'active' });
    if (activeUsers > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete — ${activeUsers} active user(s) still hold this role`
      });
    }

    await role.deleteOne();
    return res.status(200).json({ success: true, message: 'Role deleted' });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET ALL PERMISSIONS  —  for the role-builder UI
// GET /api/roles/permissions
// Returns flat array + grouped by module→page→actions
// ═══════════════════════════════════════════════════════════════════════════════
exports.getAllPermissions = async (req, res, next) => {
  try {
    const perms = await Permission.find({ is_active: true })
      .select('module page action name')
      .sort({ module: 1, page: 1, action: 1 })
      .lean();

    // Group for easy frontend consumption when building role form
    const grouped = {};
    for (const p of perms) {
      if (!grouped[p.module])         grouped[p.module] = {};
      if (!grouped[p.module][p.page]) grouped[p.module][p.page] = [];
      grouped[p.module][p.page].push(p.action);
    }

    return res.status(200).json({
      success: true,
      total:   perms.length,
      flat:    perms,      // [ { module, page, action, name }, … ]
      grouped              // { MODULE: { page: [actions] } }
    });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET SIDEBAR STRUCTURE  —  for admin UI to build the role toggle form
// GET /api/roles/sidebar-structure
// ═══════════════════════════════════════════════════════════════════════════════
exports.getSidebarStructure = (req, res) => {
  res.status(200).json({ success: true, data: sidebarStructure });
};