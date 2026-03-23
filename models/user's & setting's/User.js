// models/user's & setting's/User.js
'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    Username: {
      type:      String,
      required:  [true, 'Username is required'],
      unique:    true,
      trim:      true,
      lowercase: true,
      minlength: 3,
      maxlength: 50
    },
    Email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
      match:     [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    PasswordHash: {
      type:      String,
      required:  [true, 'Password is required'],
      minlength: 6,
      select:    false
    },
    RoleID: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Role',
      required: true
    },

    // Final resolved permissions — set at creation time.
    // This is the single source of truth. No dynamic role lookup at runtime.
    permissions: [
      {
        permission: {
          type:     mongoose.Schema.Types.ObjectId,
          ref:      'Permission',
          required: true
        },
        grantedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref:  'User'
        },
        source: {
          type:    String,
          enum:    ['role', 'direct', 'superadmin'],
          default: 'role'
        },
        expiresAt: {
          type:    Date,
          default: null
        }
      }
    ],

    LastLogin:           { type: Date },
    Status: {
      type:     String,
      required: true,
      enum:     ['active', 'inactive', 'blocked'],
      default:  'active'
    },
    RefreshToken:        { type: String, select: false },
    ResetPasswordToken:  { type: String, select: false },
    ResetPasswordExpire: { type: Date,   select: false },
    LoginAttempts:       { type: Number, default: 0 },
    LockUntil:           { type: Date }
  },
  {
    timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' },
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true }
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
userSchema.index({ Email: 1 });
userSchema.index({ Username: 1 });
userSchema.index({ Status: 1 });

// ── Hash password on change ───────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('PasswordHash')) return next();
  const salt        = await bcrypt.genSalt(10);
  this.PasswordHash = await bcrypt.hash(this.PasswordHash, salt);
  next();
});

// ═════════════════════════════════════════════════════════════════════════════
// INSTANCE METHODS
// ═════════════════════════════════════════════════════════════════════════════

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.PasswordHash);
};

userSchema.methods.isLocked = function () {
  return !!(this.LockUntil && this.LockUntil > Date.now());
};

userSchema.methods.incLoginAttempts = async function () {
  if (this.LockUntil && this.LockUntil < Date.now()) {
    this.LoginAttempts = 1;
    this.LockUntil     = undefined;
    return this.save();
  }
  this.LoginAttempts += 1;
  if (this.LoginAttempts >= 5 && !this.isLocked()) {
    this.LockUntil = Date.now() + 60 * 60 * 1000;
  }
  return this.save();
};

userSchema.methods.resetLoginAttempts = function () {
  this.LoginAttempts = 0;
  this.LockUntil     = undefined;
  return this.save();
};

// ── SuperAdmin check ──────────────────────────────────────────────────────────
userSchema.methods.isSuperAdminUser = async function () {
  if (this.populated('RoleID') && this.RoleID) return !!this.RoleID.isSuperAdmin;
  const Role = mongoose.model('Role');
  const role = await Role.findById(this.RoleID).select('isSuperAdmin').lean();
  return !!(role && role.isSuperAdmin);
};

// ── Get all permissions ───────────────────────────────────────────────────────
// SuperAdmin → always returns ALL active permissions dynamically (bypass)
// Normal user → reads exactly what was saved at creation time
userSchema.methods.getAllPermissions = async function () {
  const now = new Date();

  // ── SuperAdmin bypass ─────────────────────────────────────────────────────
  // Regardless of what is saved on user.permissions,
  // SuperAdmin always gets ALL active permissions dynamically
  const isSuperAdmin = await this.isSuperAdminUser();
  if (isSuperAdmin) {
    const Permission = mongoose.model('Permission');
    const all        = await Permission.find({ is_active: true }).lean();
    return all.map(p => ({
      _id:    p._id,
      module: p.module,
      page:   p.page,
      action: p.action,
      name:   p.name,
      source: 'superadmin'
    }));
  }

  // ── Normal user — read exactly what was saved at creation time ────────────
  const user = await mongoose.model('User')
    .findById(this._id)
    .select('permissions')
    .populate({
      path:  'permissions.permission',
      match: { is_active: true }
    })
    .lean();

  if (!user) return [];

  return user.permissions
    .filter(e => e.permission)
    .filter(e => !e.expiresAt || e.expiresAt > now)
    .map(e => ({
      _id:    e.permission._id,
      module: e.permission.module,
      page:   e.permission.page,
      action: e.permission.action,
      name:   e.permission.name,
      source: e.source || 'role'
    }));
};

// ── Fine-grained check ────────────────────────────────────────────────────────
userSchema.methods.can = async function (module, page, action) {
  const perms = await this.getAllPermissions();
  return perms.some(
    p =>
      p.module === module.toUpperCase() &&
      p.page   === page &&
      p.action === action.toUpperCase()
  );
};

// ── Coarse check — "MODULE.ACTION" ───────────────────────────────────────────
userSchema.methods.hasPermission = async function (key) {
  const [mod, act] = key.toUpperCase().split('.');
  const perms      = await this.getAllPermissions();
  return perms.some(p => p.module === mod && p.action === act);
};

module.exports = mongoose.model('User', userSchema);