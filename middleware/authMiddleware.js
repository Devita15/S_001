


// middleware/authMiddleware.js
'use strict';

const jwt  = require('jsonwebtoken');
const User = require('../models/user\'s & setting\'s/User');
const { AsyncLocalStorage } = require('async_hooks');

// ── Request-scoped storage — no shared global state between requests ──────────
const als = new AsyncLocalStorage();

const getCurrentUser = () => {
  const store = als.getStore();
  return store ? store.get('user') : null;
};

// ── Token helpers ─────────────────────────────────────────────────────────────
const generateToken = (user) =>
  jwt.sign(
    { id: user._id, username: user.Username, email: user.Email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '8h' }
  );

const generateRefreshToken = (user) =>
  jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh',
    { expiresIn: '30d' }
  );

// ═══════════════════════════════════════════════════════════════════════════════
// protect  —  verify JWT, attach user to req
// ═══════════════════════════════════════════════════════════════════════════════
const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authorized — no token provided' });
    }

    const token   = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Always re-read from DB — stale tokens can't grant access after role/status change
    const user = await User.findById(decoded.id)
      .select('-PasswordHash -RefreshToken -ResetPasswordToken -ResetPasswordExpire')
      .populate({ path: 'RoleID', select: 'RoleName isSuperAdmin IsActive' });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }
    if (user.Status !== 'active') {
      return res.status(401).json({ success: false, message: 'Account is inactive — contact admin' });
    }
    if (user.RoleID && !user.RoleID.IsActive) {
      return res.status(401).json({ success: false, message: 'Assigned role is inactive' });
    }

    // Convenience shortcuts
    user.RoleName = user.RoleID?.RoleName || null;
    user._isSA    = !!(user.RoleID?.isSuperAdmin);

    req.user = user;

    // Store in ALS so getCurrentUser() works anywhere in this request
    const store = new Map();
    store.set('user', user);
    als.run(store, () => next());

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired — please log in again' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    console.error('protect error:', err);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// authorize  —  role-name gate
// Usage:  router.get('/admin', protect, authorize('SuperAdmin', 'HR Manager'), handler)
// ═══════════════════════════════════════════════════════════════════════════════
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authorized' });
  if (req.user._isSA) return next();   // SuperAdmin always passes

  if (!allowedRoles.includes(req.user.RoleName)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required role(s): ${allowedRoles.join(', ')}`
    });
  }
  next();
};

// ═══════════════════════════════════════════════════════════════════════════════
// can  —  module + page + action gate (mirrors frontend hasSafePagePermission)
//
// Usage:
//   protect, can('COMPANY_MASTER', 'Organization / Company', 'VIEW')
//   protect, can('EMPLOYEE_MASTER', 'Employee Registry', 'DELETE')
//   protect, can('QUOTATION_MASTER', 'Quotation', 'APPROVE')
// ═══════════════════════════════════════════════════════════════════════════════
const can = (module, page, action) => async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authorized' });
    if (req.user._isSA) return next();

    const allowed = await req.user.can(module, page, action);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: `Access denied — missing permission: ${module} → ${page} → ${action}`
      });
    }
    next();
  } catch (err) {
    console.error('can middleware error:', err);
    return res.status(500).json({ success: false, message: 'Permission check error' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// requireSuperAdmin  —  hard gate, only isSuperAdmin role passes
// ═══════════════════════════════════════════════════════════════════════════════
const requireSuperAdmin = (req, res, next) => {
  if (!req.user)     return res.status(401).json({ success: false, message: 'Not authorized' });
  if (!req.user._isSA) return res.status(403).json({ success: false, message: 'SuperAdmin access required' });
  next();
};

module.exports = {
  protect,
  authorize,
  can,
  requireSuperAdmin,
  generateToken,
  generateRefreshToken,
  getCurrentUser
};