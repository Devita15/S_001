const Department = require('../../models/HR/Department');
// @desc    Get all departments
// @route   GET /api/departments
// @access  Public
// @desc    Get all departments (latest first)
// @route   GET /api/departments
// @access  Public
const getDepartments = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    
    const query = {};
    
    if (search) {
      query.DepartmentName = { $regex: search, $options: 'i' };
    }
    
    const departments = await Department.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ CreatedAt: -1 }); // Changed from DepartmentName: 1 to CreatedAt: -1 for latest first
    
    const total = await Department.countDocuments(query);
    
    res.json({
      success: true,
      data: departments,
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

// @desc    Get single department
// @route   GET /api/departments/:id
// @access  Public
const getDepartment = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    
    if (!department) {
      return res.status(404).json({ 
        success: false, 
        message: 'Department not found' 
      });
    }
    
    res.json({
      success: true,
      data: department
    });
    
  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Department not found' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Create department
// @route   POST /api/departments
// @access  Public
const createDepartment = async (req, res) => {
  try {
    const { DepartmentName, Description } = req.body;
    
    // Check if department already exists
    const existingDepartment = await Department.findOne({ 
      DepartmentName: { $regex: new RegExp(`^${DepartmentName}$`, 'i') } 
    });
    
    if (existingDepartment) {
      return res.status(400).json({ 
        success: false, 
        message: 'Department already exists' 
      });
    }
    
    const department = await Department.create({
      DepartmentName,
      Description
    });
    
    res.status(201).json({
      success: true,
      data: department,
      message: 'Department created successfully'
    });
    
  } catch (error) {
    console.error(error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Department already exists' 
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

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Public
const updateDepartment = async (req, res) => {
  try {
    let department = await Department.findById(req.params.id);
    
    if (!department) {
      return res.status(404).json({ 
        success: false, 
        message: 'Department not found' 
      });
    }
    
    // Check if department name is being changed and if new name already exists
    if (req.body.DepartmentName && req.body.DepartmentName !== department.DepartmentName) {
      const existingDepartment = await Department.findOne({ 
        DepartmentName: { $regex: new RegExp(`^${req.body.DepartmentName}$`, 'i') },
        _id: { $ne: department._id }
      });
      
      if (existingDepartment) {
        return res.status(400).json({ 
          success: false, 
          message: 'Department name already exists' 
        });
      }
    }
    
    department = await Department.findByIdAndUpdate(
      req.params.id,
      { ...req.body, UpdatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      data: department,
      message: 'Department updated successfully'
    });
    
  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Department not found' 
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Department name already exists' 
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

// @desc    Delete department (HARD DELETE)
// @route   DELETE /api/departments/:id
// @access  Public
const deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    
    if (!department) {
      return res.status(404).json({ 
        success: false, 
        message: 'Department not found' 
      });
    }
    
    // Check if department has employees
    const Employee = require('../../models/HR/Employee');
    const employeeCount = await Employee.countDocuments({ DepartmentID: department._id });
    
    if (employeeCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete department. ${employeeCount} employee(s) are assigned to this department.` 
      });
    }
    
    // HARD DELETE - permanently remove from database
    await Department.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Department deleted successfully'
    });
    
  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Department not found' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

module.exports = {
  getDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment
};