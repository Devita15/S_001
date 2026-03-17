// controllers/processDetailController.js
const ProcessDetail = require('../../models/CRM/ProcessDetail');
const Item = require('../../models/CRM/Item');
// @desc    Get all process details
// @route   GET /api/process-details
// @access  Private
const getProcessDetails = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      partNo,
      operation,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const query = { IsActive: true };
    
    if (partNo) {
      query.PartNo = partNo.toUpperCase();
    }
    
    if (operation) {
      query.Operation = new RegExp(operation, 'i');
    }
    
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const processDetails = await ProcessDetail.find(query)
      .populate('CreatedBy', 'Username Email')
      .populate('UpdatedBy', 'Username Email')
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    // Get item details for each process
    const populatedProcesses = await Promise.all(
      processDetails.map(async (process) => {
        const item = await Item.findOne({ PartNo: process.PartNo })
          .select('PartNo PartName Description DrawingNo');
        
        return {
          ...process.toObject(),
          Item: item || null
        };
      })
    );
    
    const total = await ProcessDetail.countDocuments(query);
    
    res.json({
      success: true,
      data: populatedProcesses,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get process details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single process detail
// @route   GET /api/process-details/:id
// @access  Private
const getProcessDetail = async (req, res) => {
  try {
    const processDetail = await ProcessDetail.findById(req.params.id)
      .populate('CreatedBy', 'Username Email')
      .populate('UpdatedBy', 'Username Email');
    
    if (!processDetail) {
      return res.status(404).json({
        success: false,
        message: 'Process detail not found'
      });
    }
    
    // Get item details
    const item = await Item.findOne({ PartNo: processDetail.PartNo })
      .populate('MaterialID', 'MaterialName MaterialCode Density');
    
    res.json({
      success: true,
      data: {
        ...processDetail.toObject(),
        Item: item || null,
        Calculations: {
          TotalAmount: processDetail.Manday * processDetail.Rate,
          AmountPerPiece: processDetail.Amount
        }
      }
    });
  } catch (error) {
    console.error('Get process detail error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Process detail not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get process details by part number
// @route   GET /api/process-details/part/:partNo
// @access  Private
const getProcessDetailsByPart = async (req, res) => {
  try {
    const { partNo } = req.params;
    
    const processes = await ProcessDetail.find({ 
      PartNo: partNo.toUpperCase(),
      IsActive: true 
    }).sort({ createdAt: 1 });
    
    // Calculate total process cost
    const totalCost = processes.reduce((sum, p) => sum + p.Amount, 0);
    
    res.json({
      success: true,
      data: processes,
      summary: {
        totalProcesses: processes.length,
        totalCost: totalCost.toFixed(2)
      }
    });
  } catch (error) {
    console.error('Get processes by part error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create process detail
// @route   POST /api/process-details
// @access  Private
const createProcessDetail = async (req, res) => {
  try {
    const userId = req.user.id;
    const { PartNo, OperationDescription, Operation, Machine, Manday, Rate } = req.body;
    
    // Check if item exists
    const item = await Item.findOne({ 
      PartNo: PartNo.toUpperCase(),
      IsActive: true 
    });
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found or inactive'
      });
    }
    
    const processDetail = await ProcessDetail.create({
      PartNo: PartNo.toUpperCase(),
      OperationDescription,
      Operation,
      Machine,
      Manday,
      Rate,
      CreatedBy: userId,
      UpdatedBy: userId
    });
    
    // Calculate amount (will be auto-calculated by pre-save hook)
    const amount = Manday * Rate;
    
    res.status(201).json({
      success: true,
      data: {
        ...processDetail.toObject(),
        CalculatedAmount: amount.toFixed(2)
      },
      message: 'Process detail created successfully'
    });
  } catch (error) {
    console.error('Create process detail error:', error);
    
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

// @desc    Update process detail
// @route   PUT /api/process-details/:id
// @access  Private
const updateProcessDetail = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const processDetail = await ProcessDetail.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        UpdatedBy: userId,
        UpdatedAt: Date.now()
      },
      { new: true, runValidators: true }
    );
    
    if (!processDetail) {
      return res.status(404).json({
        success: false,
        message: 'Process detail not found'
      });
    }
    
    res.json({
      success: true,
      data: processDetail,
      message: 'Process detail updated successfully'
    });
  } catch (error) {
    console.error('Update process detail error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Process detail not found'
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

// @desc    Delete process detail
// @route   DELETE /api/process-details/:id
// @access  Private
const deleteProcessDetail = async (req, res) => {
  try {
    const processDetail = await ProcessDetail.findById(req.params.id);
    
    if (!processDetail) {
      return res.status(404).json({
        success: false,
        message: 'Process detail not found'
      });
    }
    
    // Soft delete
    processDetail.IsActive = false;
    processDetail.UpdatedBy = req.user.id;
    await processDetail.save();
    
    res.json({
      success: true,
      message: 'Process detail deleted successfully'
    });
  } catch (error) {
    console.error('Delete process detail error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Process detail not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Bulk create process details
// @route   POST /api/process-details/bulk
// @access  Private
const bulkCreateProcessDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { processes } = req.body; // Array of process details
    
    if (!Array.isArray(processes) || processes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of processes'
      });
    }
    
    // Validate all part numbers exist
    for (const process of processes) {
      const item = await Item.findOne({ 
        PartNo: process.PartNo.toUpperCase(),
        IsActive: true 
      });
      
      if (!item) {
        return res.status(404).json({
          success: false,
          message: `Item ${process.PartNo} not found or inactive`
        });
      }
    }
    
    // Add user info to each process
    const processesWithUser = processes.map(p => ({
      ...p,
      PartNo: p.PartNo.toUpperCase(),
      CreatedBy: userId,
      UpdatedBy: userId
    }));
    
    const createdProcesses = await ProcessDetail.insertMany(processesWithUser);
    
    res.status(201).json({
      success: true,
      data: createdProcesses,
      message: `${createdProcesses.length} process details created successfully`
    });
  } catch (error) {
    console.error('Bulk create process details error:', error);
    
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

module.exports = {
  getProcessDetails,
  getProcessDetail,
  getProcessDetailsByPart,
  createProcessDetail,
  updateProcessDetail,
  deleteProcessDetail,
  bulkCreateProcessDetails
};