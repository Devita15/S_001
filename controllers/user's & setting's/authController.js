// controllers/user's & setting's/authController.js
'use strict';

const mongoose   = require('mongoose');
const User       = require("../../models/user's & setting's/User");
const Role       = require("../../models/user's & setting's/Role");
const Permission = require("../../models/user's & setting's/Permission");
const { generateToken, generateRefreshToken } = require('../../middleware/authMiddleware');

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
// REGISTER
// POST /api/auth/register  (SuperAdmin only)
//
// Flow:
//  1. Load role → get its resolved Permission docs  (source: 'role')
//  2. If moduleAccess/pageAccess sent → resolve those too (source: 'direct')
//  3. Merge both, deduplicate
//  4. Save final list directly on user.permissions
//  → getMe / login just reads user.permissions, no role lookup needed
// ─────────────────────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const {
      Username,
      Email,
      Password,
      RoleID,
      Status       = 'active',
      moduleAccess = {},   // extra direct overrides (same format as role)
      pageAccess   = {}    // extra direct overrides (same format as role)
    } = req.body;

    if (!Username || !Email || !Password || !RoleID) {
      return res.status(400).json({ success: false, message: 'Username, Email, Password and RoleID are required' });
    }

    // Duplicate check
    const dup = await User.findOne({
      $or: [
        { Username: Username.toLowerCase().trim() },
        { Email:    Email.toLowerCase().trim() }
      ]
    });
    if (dup) return res.status(409).json({ success: false, message: 'Username or Email already exists' });

    // Load role with its permissions
    const role = await Role.findById(RoleID)
      .populate({ path: 'permissions', match: { is_active: true } });
    if (!role)          return res.status(404).json({ success: false, message: 'Role not found' });
    if (!role.IsActive) return res.status(400).json({ success: false, message: 'Role is inactive' });

    // ── Step 1: role permissions → source: 'role' ────────────────────────────
// ── If moduleAccess sent → save ONLY those exact permissions
// ── If nothing sent     → save ALL role permissions
const finalPermissions = [];
const seen             = new Set();

if (Object.keys(moduleAccess).length > 0) {
  const directIds = await resolvePermissionIds(moduleAccess, pageAccess, req.user._id);
  for (const id of directIds) {
    if (!seen.has(id.toString())) {
      finalPermissions.push({
        permission: id,
        grantedBy:  req.user._id,
        source:     'direct'
      });
      seen.add(id.toString());
    }
  }
} else {
  for (const p of (role.permissions || [])) {
    if (!seen.has(p._id.toString())) {
      finalPermissions.push({
        permission: p._id,
        grantedBy:  req.user._id,
        source:     'role'
      });
      seen.add(p._id.toString());
    }
  }
}

    // ── Step 2: extra direct overrides → source: 'direct' ───────────────────
    if (Object.keys(moduleAccess).length > 0) {
      const directIds = await resolvePermissionIds(moduleAccess, pageAccess, req.user._id);
      for (const id of directIds) {
        if (!seen.has(id.toString())) {
          finalPermissions.push({
            permission: id,
            grantedBy:  req.user._id,
            source:     'direct'
          });
          seen.add(id.toString());
        }
      }
    }

    // ── Step 3: create user with final merged permission list ────────────────
    const user = await User.create({
      Username:     Username.toLowerCase().trim(),
      Email:        Email.toLowerCase().trim(),
      PasswordHash: Password,
      RoleID,
      Status,
      permissions:  finalPermissions
    });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        _id:              user._id,
        Username:         user.Username,
        Email:            user.Email,
        RoleName:         role.RoleName,
        isSuperAdmin:     role.isSuperAdmin,
        Status:           user.Status,
        permissionsCount: finalPermissions.length
      }
    });

  } catch (err) {
    console.error('register:', err);
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'Username or Email already exists' });
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: Object.values(err.errors).map(e => e.message).join(', ') });
    }
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ Email: email.toLowerCase().trim() })
      .select('+PasswordHash')
      .populate({ path: 'RoleID', select: 'RoleName isSuperAdmin IsActive' });

    if (!user)           return res.status(401).json({ success: false, message: 'Invalid email or password' });
    if (user.isLocked()) return res.status(401).json({ success: false, message: 'Account locked — try again later' });
    if (user.Status !== 'active') return res.status(401).json({ success: false, message: 'Account inactive — contact admin' });
    if (!user.RoleID?.IsActive)   return res.status(401).json({ success: false, message: 'Assigned role is inactive' });

    const valid = await user.comparePassword(password);
    if (!valid) {
      await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    await user.resetLoginAttempts();
    user.LastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Reads directly from user.permissions — no role lookup
    const allPerms     = await user.getAllPermissions();
    const token        = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    await User.findByIdAndUpdate(user._id, { RefreshToken: refreshToken });

    return res.status(200).json({
      success: true,
      token,
      refreshToken,
      user: {
        _id:          user._id,
        Username:     user.Username,
        Email:        user.Email,
        Status:       user.Status,
        LastLogin:    user.LastLogin,
        isSuperAdmin: user.RoleID.isSuperAdmin,
        role: {
          _id:          user.RoleID._id,
          RoleName:     user.RoleID.RoleName,
          isSuperAdmin: user.RoleID.isSuperAdmin
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
    console.error('login:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ME
// GET /api/auth/me
// Reads only from user.permissions — exact list saved at creation time
// ─────────────────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
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
    console.error('getMe:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE PASSWORD
// PUT /api/auth/change-password
// ─────────────────────────────────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
    }

    const user = await User.findById(req.user._id).select('+PasswordHash');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    user.PasswordHash = newPassword;
    await user.save();

    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('changePassword:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $unset: { RefreshToken: 1 } });
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('logout:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE USER PERMISSIONS
// PATCH /api/auth/users/:id/permissions
// grant / revoke permission IDs directly on user.permissions
// ─────────────────────────────────────────────────────────────────────────────
exports.updateUserPermissions = async (req, res) => {
  try {
    const {
      grant        = [],
      revoke       = [],
      moduleAccess = {},
      pageAccess   = {}
    } = req.body;

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    // ── Resolve grants ────────────────────────────────────────────────────────
    let grantIds = [];

    if (Object.keys(moduleAccess).length > 0) {
      grantIds = await resolvePermissionIds(moduleAccess, pageAccess, req.user._id);
    } else if (grant.length > 0) {
      const valid = await Permission.find({ _id: { $in: grant }, is_active: true });
      if (valid.length !== grant.length) {
        return res.status(400).json({ success: false, message: 'One or more permission IDs are invalid' });
      }
      grantIds = valid.map(p => p._id);
    }

    if (grantIds.length > 0) {
      const existing = new Set(target.permissions.map(e => e.permission.toString()));
      for (const id of grantIds) {
        if (!existing.has(id.toString())) {
          target.permissions.push({ permission: id, grantedBy: req.user._id, source: 'direct' });
        }
      }
    }

    // ── Revokes ───────────────────────────────────────────────────────────────
    if (revoke.length > 0) {
      const rSet = new Set(revoke.map(String));
      target.permissions = target.permissions.filter(e => !rSet.has(e.permission.toString()));
    }

    await target.save();

    return res.status(200).json({
      success: true,
      message: 'Permissions updated',
      permissionsCount: target.permissions.length
    });
  } catch (err) {
    console.error('updateUserPermissions:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};