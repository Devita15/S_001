const Process = require('../../models/HR/Process');

// @desc    Get all processes
// @route   GET /api/processes
// @access  Private
const getProcesses = async (req, res) => {
  try {
    const { page = 1, limit = 10, is_active, category, rate_type } = req.query;
    
    const query = {};
    if (is_active !== undefined) query.is_active = is_active === 'true';
    if (category) query.category = category;
    if (rate_type) query.rate_type = rate_type;
    
    const processes = await Process.find(query)
      .populate('created_by', 'username email')
      .populate('updated_by', 'username email')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ category: 1, process_name: 1 });
    
    const total = await Process.countDocuments(query);
    
    res.json({
      success: true,
      data: processes,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get processes error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get processes grouped by category
// @route   GET /api/processes/by-category
// @access  Private
const getProcessesByCategory = async (req, res) => {
  try {
    const processes = await Process.find({ is_active: true })
      .select('process_id process_name category rate_type')
      .sort({ category: 1, process_name: 1 });
    
    const grouped = {
      Core: processes.filter(p => p.category === 'Core'),
      Finishing: processes.filter(p => p.category === 'Finishing'),
      Packing: processes.filter(p => p.category === 'Packing'),
      Other: processes.filter(p => p.category === 'Other')
    };
    
    res.json({
      success: true,
      data: grouped
    });
  } catch (error) {
    console.error('Get processes by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single process
// @route   GET /api/processes/:id
// @access  Private
const getProcess = async (req, res) => {
  try {
    const process = await Process.findById(req.params.id)
      .populate('created_by', 'username email')
      .populate('updated_by', 'username email');
    
    if (!process) {
      return res.status(404).json({
        success: false,
        message: 'Process not found'
      });
    }
    
    res.json({
      success: true,
      data: process
    });
  } catch (error) {
    console.error('Get process error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Process not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create process
// @route   POST /api/processes
// @access  Private
const createProcess = async (req, res) => {
  try {
    const processData = {
      ...req.body,
      process_id: req.body.process_id || `PROC-${Date.now()}`,
      created_by: req.user._id,
      updated_by: req.user._id
    };
    
    const process = await Process.create(processData);
    
    const populatedProcess = await Process.findById(process._id)
      .populate('created_by', 'username email');
    
    res.status(201).json({
      success: true,
      data: populatedProcess,
      message: 'Process created successfully'
    });
  } catch (error) {
    console.error('Create process error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`
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

// @desc    Update process
// @route   PUT /api/processes/:id
// @access  Private
const updateProcess = async (req, res) => {
  try {
    const process = await Process.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        updated_by: req.user._id
      },
      { new: true, runValidators: true }
    ).populate('created_by', 'username email')
     .populate('updated_by', 'username email');
    
    if (!process) {
      return res.status(404).json({
        success: false,
        message: 'Process not found'
      });
    }
    
    res.json({
      success: true,
      data: process,
      message: 'Process updated successfully'
    });
  } catch (error) {
    console.error('Update process error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`
      });
    }
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Process not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete process (soft delete)
// @route   DELETE /api/processes/:id
// @access  Private
const deleteProcess = async (req, res) => {
  try {
    const process = await Process.findById(req.params.id);
    
    if (!process) {
      return res.status(404).json({
        success: false,
        message: 'Process not found'
      });
    }
    
    process.is_active = false;
    process.updated_by = req.user._id;
    await process.save();
    
    res.json({
      success: true,
      message: 'Process deactivated successfully'
    });
  } catch (error) {
    console.error('Delete process error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Process not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get processes for dropdown
// @route   GET /api/processes/dropdown
// @access  Private
const getProcessesDropdown = async (req, res) => {
  try {
    const { category } = req.query;
    
    const query = { is_active: true };
    if (category) query.category = category;
    
    const processes = await Process.find(query)
      .select('process_id process_name category rate_type')
      .sort({ process_name: 1 });
    
    res.json({
      success: true,
      data: processes
    });
  } catch (error) {
    console.error('Get processes dropdown error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getProcesses,
  getProcess,
  createProcess,
  updateProcess,
  deleteProcess,
  getProcessesDropdown,
  getProcessesByCategory
};