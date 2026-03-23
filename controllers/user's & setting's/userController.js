// controllers/user's & setting's/userController.js
'use strict';

const mongoose   = require('mongoose');
const User       = require("../../models/user's & setting's/User");
const Role       = require("../../models/user's & setting's/Role");
const Permission = require("../../models/user's & setting's/Permission");

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — resolve Permission IDs from moduleAccess + pageAccess maps
// Same format as role creation so frontend sends identical body shape
// ─────────────────────────────────────────────────────────────────────────────
async function resolvePermissionIds(moduleAccess = {}, pageAccess = {}, createdBy) {
  const ids = [];
  for (const [moduleKey, enabled] of Object.entries(moduleAccess)) {
    if (!enabled) continue;
    const pages = pageAccess[moduleKey] || {};
    for (const [pageName, actions] of Object.entries(pages)) {
      if (!Array.isArray(actions) || actions.length === 0) continue;
      for (const action of actions) {
        const perm = await Permission.findOrCreate(moduleKey, pageName, action, createdBy);
        ids.push(perm._id);
      }
    }
  }
  const seen = new Set();
  return ids.filter(id => {
    const s = id.toString();
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL USERS
// GET /api/users
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// GET ALL USERS
// GET /api/users
// ─────────────────────────────────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const {
      page      = 1,
      limit     = 10,
      search,
      status,
      roleId,
      sortBy    = 'CreatedAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    if (search) filter.$or = [
      { Username: { $regex: search, $options: 'i' } },
      { Email:    { $regex: search, $options: 'i' } }
    ];
    if (status) filter.Status = status;
    if (roleId) filter.RoleID = roleId;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-PasswordHash -RefreshToken -ResetPasswordToken -ResetPasswordExpire')
        .populate({ path: 'RoleID', select: 'RoleName isSuperAdmin IsActive' })
        // ✅ ADD THIS — populates the permission ref inside each permissions[] entry
        .populate({ path: 'permissions.permission', select: 'module page action name' })
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      User.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: users,
      pagination: {
        currentPage:  Number(page),
        totalPages:   Math.ceil(total / Number(limit)),
        totalItems:   total,
        itemsPerPage: Number(limit)
      }
    });
  } catch (err) {
    console.error('getAllUsers:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET ONE USER + permissions
// GET /api/users/:id
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const user = await User.findById(req.params.id)
      .select('-PasswordHash -RefreshToken -ResetPasswordToken -ResetPasswordExpire')
      .populate({ path: 'RoleID', select: 'RoleName isSuperAdmin IsActive' });

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Reads directly from user.permissions — no dynamic role resolution
    const allPerms = await user.getAllPermissions();

    return res.status(200).json({
      success: true,
      data: {
        _id:          user._id,
        Username:     user.Username,
        Email:        user.Email,
        Status:       user.Status,
        LastLogin:    user.LastLogin,
        CreatedAt:    user.CreatedAt,
        UpdatedAt:    user.UpdatedAt,
        isSuperAdmin: user.RoleID?.isSuperAdmin || false,
        role: {
          _id:          user.RoleID?._id,
          RoleName:     user.RoleID?.RoleName,
          isSuperAdmin: user.RoleID?.isSuperAdmin
        },
        permissions: allPerms.map(p => ({
          _id:    p._id,
          module: p.module,
          page:   p.page,
          action: p.action,
          name:   p.name,
          source: p.source
        })),
        permissionsCount: allPerms.length
      }
    });
  } catch (err) {
    console.error('getUserById:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE USER (COMPLETE VERSION)
// PATCH /api/users/:id
// Supports updating: Username, Email, RoleID, Status, moduleAccess, pageAccess
// ─────────────────────────────────────────────────────────────────────────────
exports.updateUser = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const {
      Username,
      Email,
      RoleID,
      Status,
      moduleAccess = {},
      pageAccess = {}
    } = req.body;

    // ── 1. Validate and update basic fields ─────────────────────────────────
    if (Username || Email) {
      const orConds = [];
      if (Username) orConds.push({ Username: Username.toLowerCase().trim() });
      if (Email)    orConds.push({ Email:    Email.toLowerCase().trim() });
      const clash = await User.findOne({ $or: orConds, _id: { $ne: user._id } });
      if (clash) return res.status(409).json({ success: false, message: 'Username or Email already taken' });
    }

    // Validate role if being updated
    let role = null;
    if (RoleID) {
      role = await Role.findById(RoleID);
      if (!role || !role.IsActive) {
        return res.status(400).json({ success: false, message: 'Role not found or inactive' });
      }
    } else {
      role = await Role.findById(user.RoleID);
    }

    // ── 2. Handle permissions update ─────────────────────────────────────────
    // Check if permissions were sent in the request (via moduleAccess/pageAccess)
    const hasPermissionsUpdate = Object.keys(moduleAccess).length > 0 || Object.keys(pageAccess).length > 0;
    
    if (hasPermissionsUpdate) {
      // Resolve permission IDs from the provided access maps
      const newPermissionIds = await resolvePermissionIds(moduleAccess, pageAccess, req.user._id);
      
      if (newPermissionIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No valid permissions found in provided access maps' 
        });
      }

      // Build new permissions array with source 'direct'
      const newPermissions = newPermissionIds.map(id => ({
        permission: id,
        grantedBy: req.user._id,
        source: 'direct',
        expiresAt: null
      }));

      // Update user permissions
      user.permissions = newPermissions;
    }

    // ── 3. Apply basic field updates ─────────────────────────────────────────
    if (Username) user.Username = Username.toLowerCase().trim();
    if (Email) user.Email = Email.toLowerCase().trim();
    if (RoleID) user.RoleID = RoleID;
    if (Status) user.Status = Status;

    // Save the updated user
    await user.save();

    // ── 4. Fetch updated user with populated fields ──────────────────────────
    const updatedUser = await User.findById(user._id)
      .select('-PasswordHash -RefreshToken -ResetPasswordToken -ResetPasswordExpire')
      .populate({ path: 'RoleID', select: 'RoleName isSuperAdmin IsActive' })
      .populate({ path: 'permissions.permission', select: 'module page action name' });

    // Get all permissions (for superadmin, this will return all)
    const allPerms = await updatedUser.getAllPermissions();

    // Format response to match frontend expectations
    const responseData = {
      _id: updatedUser._id,
      Username: updatedUser.Username,
      Email: updatedUser.Email,
      Status: updatedUser.Status,
      RoleID: updatedUser.RoleID,
      permissions: allPerms.map(p => ({
        _id: p._id,
        module: p.module,
        page: p.page,
        action: p.action,
        name: p.name,
        source: p.source
      })),
      LastLogin: updatedUser.LastLogin,
      CreatedAt: updatedUser.CreatedAt,
      UpdatedAt: updatedUser.UpdatedAt,
      id: updatedUser._id
    };

    return res.status(200).json({ 
      success: true, 
      data: responseData, 
      message: 'User updated successfully' 
    });

  } catch (err) {
    console.error('updateUser:', err);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Username or Email already exists' });
    }
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// DELETE USER (soft — sets Status to inactive)
// DELETE /api/users/:id
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    const user = await User.findById(req.params.id)
      .populate({ path: 'RoleID', select: 'isSuperAdmin' });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.RoleID?.isSuperAdmin) {
      return res.status(403).json({ success: false, message: 'Cannot delete a SuperAdmin user' });
    }

    user.Status = 'inactive';
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({ success: true, message: 'User deactivated successfully' });
  } catch (err) {
    console.error('deleteUser:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GRANT permissions
// POST /api/users/:id/permissions/grant
// Accepts moduleAccess/pageAccess maps OR raw permission IDs
// ─────────────────────────────────────────────────────────────────────────────
exports.grantPermissions = async (req, res) => {
  try {
    const {
      permissions  = [],
      expiresAt,
      moduleAccess = {},
      pageAccess   = {}
    } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const hasMaps   = Object.keys(moduleAccess).length > 0;
    let resolvedIds = [];

    if (hasMaps) {
      resolvedIds = await resolvePermissionIds(moduleAccess, pageAccess, req.user._id);
      if (resolvedIds.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid permissions found in provided access maps' });
      }
    } else if (permissions.length > 0) {
      const valid = await Permission.find({ _id: { $in: permissions }, is_active: true });
      if (valid.length !== permissions.length) {
        return res.status(400).json({ success: false, message: 'One or more permission IDs are invalid' });
      }
      resolvedIds = valid.map(p => p._id);
    } else {
      return res.status(400).json({ success: false, message: 'Provide either moduleAccess/pageAccess maps or a permissions array' });
    }

    const alreadyGranted = new Set(user.permissions.map(e => e.permission.toString()));
    let added = 0;

    for (const id of resolvedIds) {
      if (!alreadyGranted.has(id.toString())) {
        user.permissions.push({
          permission: id,
          grantedBy:  req.user._id,
          source:     'direct',
          expiresAt:  expiresAt ? new Date(expiresAt) : null
        });
        added++;
      }
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: `${added} permission(s) granted`,
      permissionsCount: user.permissions.length
    });
  } catch (err) {
    console.error('grantPermissions:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REVOKE permissions
// POST /api/users/:id/permissions/revoke
// ─────────────────────────────────────────────────────────────────────────────
exports.revokePermissions = async (req, res) => {
  try {
    const { permissions = [] } = req.body;
    if (!permissions.length) {
      return res.status(400).json({ success: false, message: 'permissions array is required' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const before = user.permissions.length;
    const rSet   = new Set(permissions.map(String));
    user.permissions = user.permissions.filter(e => !rSet.has(e.permission.toString()));

    await user.save();

    return res.status(200).json({
      success: true,
      message: `${before - user.permissions.length} permission(s) revoked`,
      permissionsCount: user.permissions.length
    });
  } catch (err) {
    console.error('revokePermissions:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET USER PERMISSIONS
// GET /api/users/:id/permissions
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserPermissions = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const user = await User.findById(req.params.id)
      .populate({ path: 'RoleID', select: 'RoleName isSuperAdmin' });

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const allPerms = await user.getAllPermissions();

    return res.status(200).json({
      success: true,
      data: {
        userId:       user._id,
        Username:     user.Username,
        RoleName:     user.RoleID?.RoleName,
        isSuperAdmin: !!(user.RoleID?.isSuperAdmin),
        permissions:  allPerms.map(p => ({
          _id:    p._id,
          module: p.module,
          page:   p.page,
          action: p.action,
          name:   p.name,
          source: p.source
        })),
        total: allPerms.length
      }
    });
  } catch (err) {
    console.error('getUserPermissions:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};