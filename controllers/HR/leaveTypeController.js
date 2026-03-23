const LeaveType = require('../../models/HR/LeaveType');
// @desc    Get all leave types
// @route   GET /api/leavetypes
// @access  Public
const getLeaveTypes = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, isActive } = req.query;
    
    const query = {};
    
    if (search) {
      query.Name = { $regex: search, $options: 'i' };
    }
    
    if (isActive !== undefined) {
      query.IsActive = isActive === 'true';
    }
    
    const leaveTypes = await LeaveType.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ CreatedAt: -1 });
    
    const total = await LeaveType.countDocuments(query);
    
    res.json({
      success: true,
      data: leaveTypes,
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

// @desc    Get single leave type
// @route   GET /api/leavetypes/:id
// @access  Public
const getLeaveType = async (req, res) => {
  try {
    const leaveType = await LeaveType.findById(req.params.id);
    
    if (!leaveType) {
      return res.status(404).json({ 
        success: false, 
        message: 'Leave type not found' 
      });
    }
    
    res.json({
      success: true,
      data: leaveType
    });
    
  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Leave type not found' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Create leave type
// @route   POST /api/leavetypes
// @access  Public
const createLeaveType = async (req, res) => {
  try {
    const { Name, MaxDaysPerYear, Description, IsActive = true } = req.body;
    
    // Check if leave type already exists
    const existingLeaveType = await LeaveType.findOne({ 
      Name: { $regex: new RegExp(`^${Name}$`, 'i') } 
    });
    
    if (existingLeaveType) {
      return res.status(400).json({ 
        success: false, 
        message: 'Leave type already exists' 
      });
    }
    
    const leaveType = await LeaveType.create({
      Name,
      MaxDaysPerYear,
      Description,
      IsActive
    });
    
    res.status(201).json({
      success: true,
      data: leaveType,
      message: 'Leave type created successfully'
    });
    
  } catch (error) {
    console.error(error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Leave type already exists' 
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

// @desc    Update leave type
// @route   PUT /api/leavetypes/:id
// @access  Public
const updateLeaveType = async (req, res) => {
  try {
    let leaveType = await LeaveType.findById(req.params.id);
    
    if (!leaveType) {
      return res.status(404).json({ 
        success: false, 
        message: 'Leave type not found' 
      });
    }
    
    // Check if leave type name is being changed and if new name already exists
    if (req.body.Name && req.body.Name !== leaveType.Name) {
      const existingLeaveType = await LeaveType.findOne({ 
        Name: { $regex: new RegExp(`^${req.body.Name}$`, 'i') },
        _id: { $ne: leaveType._id }
      });
      
      if (existingLeaveType) {
        return res.status(400).json({ 
          success: false, 
          message: 'Leave type name already exists' 
        });
      }
    }
    
    leaveType = await LeaveType.findByIdAndUpdate(
      req.params.id,
      { ...req.body, UpdatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      data: leaveType,
      message: 'Leave type updated successfully'
    });
    
  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Leave type not found' 
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Leave type name already exists' 
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

// @desc    Delete leave type (HARD DELETE)
// @route   DELETE /api/leavetypes/:id
// @access  Public
const deleteLeaveType = async (req, res) => {
  try {
    const leaveType = await LeaveType.findById(req.params.id);
    
    if (!leaveType) {
      return res.status(404).json({ 
        success: false, 
        message: 'Leave type not found' 
      });
    }
    
    // Check if leave type has any leave records
    const Leave = require('../../models/HR/Leave');
    const leaveCount = await Leave.countDocuments({ LeaveTypeID: leaveType._id });
    
    if (leaveCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete leave type. ${leaveCount} leave record(s) are using this leave type.` 
      });
    }
    
    // HARD DELETE - permanently remove from database
    await LeaveType.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Leave type deleted successfully'
    });
    
  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Leave type not found' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

module.exports = {
  getLeaveTypes,
  getLeaveType,
  createLeaveType,
  updateLeaveType,
  deleteLeaveType
};