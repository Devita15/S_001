const User = require('../../models/user\'s & setting\'s/User');
const Employee = require('../../models/HR/Employee');
const Role = require('../../models/user\'s & setting\'s/Role');
const { generateToken } = require('../../middleware/authMiddleware');

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { 
      Username, 
      Email, 
      Password, 
      RoleID, 
      EmployeeID,
      Status = 'active' 
    } = req.body;

    // Validate required fields
    if (!Username || !Email || !Password || !RoleID) {
      return res.status(400).json({ 
        success: false,
        message: 'Username, Email, Password and RoleID are required' 
      });
    }

    // Check if user already exists
    const userExists = await User.findOne({ 
      $or: [
        { Username: Username }, 
        { Email: Email }
      ] 
    });

    if (userExists) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists with this username or email' 
      });
    }

    // Check if role exists and is valid
    const role = await Role.findById(RoleID);
    if (!role) {
      return res.status(404).json({ 
        success: false,
        message: 'Role not found' 
      });
    }

    // For SuperAdmin role, ensure no EmployeeID is linked
    if (role.RoleName === 'SuperAdmin' && EmployeeID) {
      return res.status(400).json({ 
        success: false,
        message: 'SuperAdmin cannot be linked to an employee' 
      });
    }

    // For non-SuperAdmin roles, check if employee exists (if provided)
    let employeeObject = null;
    if (EmployeeID && role.RoleName !== 'SuperAdmin') {
      const employeeExists = await Employee.findById(EmployeeID);
      if (!employeeExists) {
        return res.status(404).json({ 
          success: false,
          message: 'Employee not found' 
        });
      }
      employeeObject = employeeExists;
    }

    // Create user
    const user = await User.create({
      Username,
      Email,
      PasswordHash: Password, // Will be hashed by pre-save middleware
      RoleID,
      EmployeeID: role.RoleName === 'SuperAdmin' ? null : (employeeObject ? employeeObject._id : null),
      Status
    });

    // Generate token
    const token = generateToken(user); 

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        Username: user.Username,
        Email: user.Email,
        RoleID: user.RoleID,
        RoleName: role.RoleName,
        EmployeeID: user.EmployeeID,
        Status: user.Status,
        token
      },
      message: 'User registered successfully'
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
        success: false, 
        message: messages.join(', ') 
      });
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Username or Email already exists'
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
};

// @desc    Login user with email and password
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide email and password' 
      });
    }

    // Find user by email
    const user = await User.findOne({ Email: email.toLowerCase().trim() })
      .populate('RoleID', 'RoleName Description')
      .populate('EmployeeID', 'FirstName LastName Email');

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Check if account is locked
    if (user.isLocked()) {
      return res.status(401).json({ 
        success: false,
        message: 'Account is locked. Try again later.' 
      });
    }

    // Check if account is active
    if (user.Status !== 'active') {
      return res.status(401).json({ 
        success: false,
        message: 'Account is not active. Please contact administrator.' 
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      // Increment login attempts
      await user.incLoginAttempts();
      
      return res.status(401).json({ 
        success: false,
        message: 'Invalid email or password' 
      });
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Update last login
    user.LastLogin = Date.now();
    await user.save();

    // Generate token
    const token = generateToken(user);

    res.json({
      success: true,
      data: {
        _id: user._id,
        Username: user.Username,
        Email: user.Email,
        EmployeeID: user.EmployeeID,
        RoleID: user.RoleID,
        RoleName: user.RoleID ? user.RoleID.RoleName : null,
        Status: user.Status,
        LastLogin: user.LastLogin,
        token
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-PasswordHash')
      .populate('RoleID', 'RoleName Description')
      .populate({
        path: 'EmployeeID',
        populate: [
          { path: 'DepartmentID', select: 'DepartmentName' },
          { path: 'DesignationID', select: 'DesignationName Level' },
          { path: 'ReportingManagerID', select: 'FirstName LastName Email' }
        ]
      });

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Current password and new password are required' 
      });
    }

    // Get user
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: 'Current password is incorrect' 
      });
    }

    // Update password
    user.PasswordHash = newPassword; // Will be hashed by pre-save middleware
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res) => {
  try {
    // In a JWT system, logout is handled client-side by removing the token
    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  changePassword,
  logout
};