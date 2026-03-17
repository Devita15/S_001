const Designation = require('../models/Designation');

// @desc    Get all designations
// @route   GET /api/designations
// @access  Public
const getDesignations = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    
    const query = {};
    
    if (search) {
      query.DesignationName = { $regex: search, $options: 'i' };
    }
    
    const designations = await Designation.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ CreatedAt: -1 }); // Sort by createdAt desc first, then Level and Name
    
    const total = await Designation.countDocuments(query);
    
    res.json({
      success: true,
      data: designations,
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

// @desc    Get single designation
// @route   GET /api/designations/:id
// @access  Public
const getDesignation = async (req, res) => {
  try {
    const designation = await Designation.findById(req.params.id);
    
    if (!designation) {
      return res.status(404).json({ 
        success: false, 
        message: 'Designation not found' 
      });
    }
    
    res.json({
      success: true,
      data: designation
    });
    
  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Designation not found' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Create designation
// @route   POST /api/designations
// @access  Public
const createDesignation = async (req, res) => {
  try {
    const { DesignationName, Level, Description } = req.body;
    
    // Check if designation already exists
    const existingDesignation = await Designation.findOne({ 
      DesignationName: { $regex: new RegExp(`^${DesignationName}$`, 'i') } 
    });
    
    if (existingDesignation) {
      return res.status(400).json({ 
        success: false, 
        message: 'Designation already exists' 
      });
    }
    
    const designation = await Designation.create({
      DesignationName,
      Level,
      Description
    });
    
    res.status(201).json({
      success: true,
      data: designation,
      message: 'Designation created successfully'
    });
    
  } catch (error) {
    console.error(error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Designation already exists' 
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

// @desc    Update designation
// @route   PUT /api/designations/:id
// @access  Public
const updateDesignation = async (req, res) => {
  try {
    let designation = await Designation.findById(req.params.id);
    
    if (!designation) {
      return res.status(404).json({ 
        success: false, 
        message: 'Designation not found' 
      });
    }
    
    // Check if designation name is being changed and if new name already exists
    if (req.body.DesignationName && req.body.DesignationName !== designation.DesignationName) {
      const existingDesignation = await Designation.findOne({ 
        DesignationName: { $regex: new RegExp(`^${req.body.DesignationName}$`, 'i') },
        _id: { $ne: designation._id }
      });
      
      if (existingDesignation) {
        return res.status(400).json({ 
          success: false, 
          message: 'Designation name already exists' 
        });
      }
    }
    
    designation = await Designation.findByIdAndUpdate(
      req.params.id,
      { ...req.body, UpdatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      data: designation,
      message: 'Designation updated successfully'
    });
    
  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Designation not found' 
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Designation name already exists' 
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

// @desc    Delete designation (HARD DELETE)
// @route   DELETE /api/designations/:id
// @access  Public
const deleteDesignation = async (req, res) => {
  try {
    const designation = await Designation.findById(req.params.id);
    
    if (!designation) {
      return res.status(404).json({ 
        success: false, 
        message: 'Designation not found' 
      });
    }
    
    // Check if designation has employees
    const Employee = require('../models/Employee');
    const employeeCount = await Employee.countDocuments({ DesignationID: designation._id });
    
    if (employeeCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete designation. ${employeeCount} employee(s) have this designation.` 
      });
    }
    
    // HARD DELETE - permanently remove from database
    await Designation.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Designation deleted successfully'
    });
    
  } catch (error) {
    console.error(error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Designation not found' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

module.exports = {
  getDesignations,
  getDesignation,
  createDesignation,
  updateDesignation,
  deleteDesignation
};