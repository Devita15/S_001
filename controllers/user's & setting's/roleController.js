const Role = require('../../models/user\'s & setting\'s/Role');

// @desc    Get all roles
// @route   GET /api/roles
// @access  Public
const getRoles = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      isActive,
      sortBy = 'CreatedAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    // Filter by search term
    if (search) {
      query.$or = [
        { RoleName: { $regex: search, $options: 'i' } },
        { Description: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by active status
    if (isActive !== undefined) {
      query.IsActive = isActive === 'true';
    }

    // Sort configuration
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const roles = await Role.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort(sort);

    // Get total count
    const total = await Role.countDocuments(query);

    res.json({
      success: true,
      data: roles,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: Number(limit)
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Get single role
// @route   GET /api/roles/:id
// @access  Public
const getRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found' 
      });
    }

    res.json({
      success: true,
      data: role
    });

  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found' 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Create role
// @route   POST /api/roles
// @access  Public
const createRole = async (req, res) => {
  try {
    const { RoleName, Description, IsActive = true } = req.body;

    // Check if role already exists
    const existingRole = await Role.findOne({ 
      RoleName: { $regex: new RegExp(`^${RoleName}$`, 'i') } 
    });

    if (existingRole) {
      return res.status(400).json({ 
        success: false, 
        message: 'Role name already exists' 
      });
    }

    // Create role
    const role = await Role.create({
      RoleName,
      Description,
      IsActive
    });

    res.status(201).json({
      success: true,
      data: role,
      message: 'Role created successfully'
    });

  } catch (error) {
    console.error(error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Role name already exists' 
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
        success: false, 
        message: messages.join(', ') 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Update role
// @route   PUT /api/roles/:id
// @access  Public
const updateRole = async (req, res) => {
  try {
    let role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found' 
      });
    }

    // Check if role name is being changed and if new name already exists
    if (req.body.RoleName && req.body.RoleName !== role.RoleName) {
      const existingRole = await Role.findOne({ 
        RoleName: { $regex: new RegExp(`^${req.body.RoleName}$`, 'i') },
        _id: { $ne: role._id }
      });

      if (existingRole) {
        return res.status(400).json({ 
          success: false, 
          message: 'Role name already exists' 
        });
      }
    }

    // Update role
    role = await Role.findByIdAndUpdate(
      req.params.id,
      { 
        ...req.body,
        UpdatedAt: Date.now()
      },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: role,
      message: 'Role updated successfully'
    });

  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found' 
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Role name already exists' 
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
        success: false, 
        message: messages.join(', ') 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Delete role
// @route   DELETE /api/roles/:id
// @access  Public
const deleteRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found' 
      });
    }

    // Delete role
    await role.deleteOne();

    res.json({
      success: true,
      message: 'Role deleted successfully'
    });

  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Role not found' 
      });
    }

    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Get role statistics
// @route   GET /api/roles/stats
// @access  Public
const getRoleStats = async (req, res) => {
  try {
    const totalRoles = await Role.countDocuments();
    const activeRoles = await Role.countDocuments({ IsActive: true });
    const inactiveRoles = await Role.countDocuments({ IsActive: false });

    res.json({
      success: true,
      data: {
        totalRoles,
        activeRoles,
        inactiveRoles
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Get active roles dropdown
// @route   GET /api/roles/dropdown
// @access  Public
const getRolesDropdown = async (req, res) => {
  try {
    const roles = await Role.find({ IsActive: true })
      .select('RoleName Description')
      .sort({ RoleName: 1 });

    res.json({
      success: true,
      data: roles
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
  getRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  getRoleStats,
  getRolesDropdown
};