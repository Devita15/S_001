const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id)
        .select('-PasswordHash -RefreshToken -ResetPasswordToken -ResetPasswordExpire')
        .populate('RoleID', 'RoleName Permissions');

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      if (req.user.Status !== 'active') {
        return res.status(401).json({
          success: false,
          message: 'Account is inactive. Please contact administrator.'
        });
      }

      // Add role name and permissions to user object
      req.user.RoleName = req.user.RoleID ? req.user.RoleID.RoleName : null;
      req.user.Permissions = req.user.RoleID ? req.user.RoleID.Permissions : [];

      next();
    } catch (error) {
      console.error('Auth error:', error);
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token'
    });
  }
};

// Role-based authorization - CEO/SuperAdmin have all access
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const userRole = req.user.RoleName;
    
    // SuperAdmin (CEO) has access to everything
    if (userRole === 'SuperAdmin' || userRole === 'CEO') {
      return next();
    }
    
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${roles.join(', ')}`
      });
    }

    next();
  };
};

// Permission-based authorization
const hasPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // SuperAdmin (CEO) has all permissions
    if (req.user.RoleName === 'SuperAdmin' || req.user.RoleName === 'CEO') {
      return next();
    }

    if (!req.user.Permissions || !req.user.Permissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permission: ${permission}`
      });
    }

    next();
  };
};

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      username: user.Username,
      email: user.Email,
      role: user.RoleName
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET + user.PasswordHash,
    { expiresIn: '30d' }
  );
};

module.exports = {
  protect,
  authorize,
  hasPermission,
  generateToken,
  generateRefreshToken
};