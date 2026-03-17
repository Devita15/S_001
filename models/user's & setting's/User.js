const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  EmployeeID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    sparse: true
  },
  Username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 50
  },
  Email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  PasswordHash: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6
  },
  RoleID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
  LastLogin: {
    type: Date
  },
  Status: {
    type: String,
    required: true,
    enum: ['active', 'inactive', 'blocked'],
    default: 'active'
  },
  RefreshToken: String,
  ResetPasswordToken: String,
  ResetPasswordExpire: Date,
  LoginAttempts: {
    type: Number,
    default: 0
  },
  LockUntil: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'CreatedAt', updatedAt: 'UpdatedAt' }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('PasswordHash')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.PasswordHash = await bcrypt.hash(this.PasswordHash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.PasswordHash);
};

// Check if account is locked
userSchema.methods.isLocked = function() {
  return !!(this.LockUntil && this.LockUntil > Date.now());
};

// Increment login attempts
userSchema.methods.incLoginAttempts = async function() {
  if (this.LockUntil && this.LockUntil < Date.now()) {
    this.LoginAttempts = 1;
    this.LockUntil = undefined;
    return await this.save();
  }
  
  this.LoginAttempts += 1;
  
  if (this.LoginAttempts >= 5 && !this.isLocked()) {
    this.LockUntil = Date.now() + 60 * 60 * 1000; // 1 hour
  }
  
  return await this.save();
};

// Reset login attempts
userSchema.methods.resetLoginAttempts = async function() {
  this.LoginAttempts = 0;
  this.LockUntil = undefined;
  return await this.save();
};

module.exports = mongoose.model('User', userSchema);