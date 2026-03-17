const User = require('../../models/User');
const Employee = require('../models/Employee');
const Role = require('../../models/Role');
const mongoose = require('mongoose');

// @desc    Get all users with filtering and pagination
// @route   GET /api/users
// @access  Private (Admin/SuperAdmin only)
const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      roleId,
      sortBy = 'CreatedAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};

    // Search by username or email
    if (search) {
      filter.$or = [
        { Username: { $regex: search, $options: 'i' } },
        { Email: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by status
    if (status) {
      filter.Status = status;
    }

    // Filter by role
    if (roleId) {
      filter.RoleID = roleId;
    }

    // Calculate pagination
    const pageNumber = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const skip = (pageNumber - 1) * pageSize;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const [users, totalCount] = await Promise.all([
      User.find(filter)
        .select('-PasswordHash -ResetPasswordToken -ResetPasswordExpire')
        .populate('RoleID', 'RoleName Description')
        .populate({
          path: 'EmployeeID',
          select: 'FirstName LastName Email EmployeeID DepartmentID DesignationID',
          populate: [
            { path: 'DepartmentID', select: 'DepartmentName' },
            { path: 'DesignationID', select: 'DesignationName Level' }
          ]
        })
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      User.countDocuments(filter)
    ]);

    // Calculate total pages
    const totalPages = Math.ceil(totalCount / pageSize);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: pageNumber,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: pageSize,
          hasNextPage: pageNumber < totalPages,
          hasPrevPage: pageNumber > 1
        }
      },
      message: 'Users retrieved successfully'
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private (Admin/SuperAdmin only)
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const user = await User.findById(id)
      .select('-PasswordHash -ResetPasswordToken -ResetPasswordExpire')
      .populate('RoleID', 'RoleName Description Permissions')
      .populate({
        path: 'EmployeeID',
        populate: [
          { path: 'DepartmentID', select: 'DepartmentName' },
          { path: 'DesignationID', select: 'DesignationName Level' },
        ]
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user,
      message: 'User retrieved successfully'
    });

  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Update user details
// @route   PUT /api/users/:id
// @access  Private (Admin/SuperAdmin only)
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      Username,
      Email,
      RoleID,
      EmployeeID,
      Status,
      LoginAttempts,
      LockUntil
    } = req.body;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if username/email is taken by another user
    if (Username || Email) {
      const existingUserQuery = {
        _id: { $ne: id },
        $or: []
      };

      if (Username) existingUserQuery.$or.push({ Username });
      if (Email) existingUserQuery.$or.push({ Email });

      if (existingUserQuery.$or.length > 0) {
        const existingUser = await User.findOne(existingUserQuery);
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'Username or Email is already taken'
          });
        }
      }
    }

    // Validate RoleID if provided
    if (RoleID) {
      const role = await Role.findById(RoleID);
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Check SuperAdmin role restrictions
      if (role.RoleName === 'SuperAdmin' && EmployeeID) {
        return res.status(400).json({
          success: false,
          message: 'SuperAdmin cannot be linked to an employee'
        });
      }
    }

    // Validate EmployeeID if provided
    let employeeObject = null;
    if (EmployeeID) {
      // If EmployeeID is set to null or empty string, remove the link
      if (EmployeeID === null || EmployeeID === '') {
        user.EmployeeID = null;
      } else {
        // Validate employee exists
        const employeeExists = await Employee.findById(EmployeeID);
        if (!employeeExists) {
          return res.status(404).json({
            success: false,
            message: 'Employee not found'
          });
        }
        employeeObject = employeeExists;
      }
    }

    // Update fields
    const updateFields = {
      ...(Username && { Username: Username.toLowerCase().trim() }),
      ...(Email && { Email: Email.toLowerCase().trim() }),
      ...(RoleID && { RoleID }),
      ...(EmployeeID !== undefined && { 
        EmployeeID: employeeObject ? employeeObject._id : null 
      }),
      ...(Status && { Status }),
      ...(LoginAttempts !== undefined && { LoginAttempts }),
      ...(LockUntil && { LockUntil }),
      UpdatedAt: Date.now()
    };

    const updatedUser = await User.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: true }
    )
      .select('-PasswordHash -ResetPasswordToken -ResetPasswordExpire')
      .populate('RoleID', 'RoleName Description')
      .populate({
        path: 'EmployeeID',
        select: 'FirstName LastName Email EmployeeID',
        populate: [
          { path: 'DepartmentID', select: 'DepartmentName' },
          { path: 'DesignationID', select: 'DesignationName' }
        ]
      });

    res.json({
      success: true,
      data: updatedUser,
      message: 'User updated successfully'
    });

  } catch (error) {
    console.error('Update user error:', error);

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

// @desc    Delete user (soft delete by setting status to inactive)
// @route   DELETE /api/users/:id
// @access  Private (Admin/SuperAdmin only)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting SuperAdmin users (optional)
    const role = await Role.findById(user.RoleID);
    if (role && role.RoleName === 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete SuperAdmin users'
      });
    }

    // Soft delete - set status to inactive
    user.Status = 'inactive';
    user.UpdatedAt = Date.now();
    await user.save();

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser
};
