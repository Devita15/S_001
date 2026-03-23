const RawMaterial = require('../../models/CRM/RawMaterial');
// @desc    Get all raw materials
// @route   GET /api/raw-materials
// @access  Private
const getRawMaterials = async (req, res) => {
  try {
    const { page = 1, limit = 10, materialName, grade, isActive } = req.query;
    
    const query = {};
    if (isActive !== undefined) query.IsActive = isActive === 'true';
    if (materialName) query.MaterialName = new RegExp(materialName, 'i');
    if (grade) query.Grade = new RegExp(grade, 'i');
    
    const rawMaterials = await RawMaterial.find(query)
      .populate('CreatedBy', 'Username Email')
      .populate('UpdatedBy', 'Username Email')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ MaterialName: 1, Grade: 1, DateEffective: -1 });
    
    const total = await RawMaterial.countDocuments(query);
    
    res.json({
      success: true,
      data: rawMaterials,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get raw materials error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get current raw material rates
// @route   GET /api/raw-materials/current-rates
// @access  Private
const getCurrentRates = async (req, res) => {
  try {
    const currentRates = await RawMaterial.aggregate([
      { $match: { IsActive: true } },
      { $sort: { MaterialName: 1, Grade: 1, DateEffective: -1 } },
      {
        $group: {
          _id: { material: '$MaterialName', grade: '$Grade' },
          latestRate: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: '$latestRate' } },
      { $sort: { MaterialName: 1, Grade: 1 } }
    ]);
    
    res.json({
      success: true,
      data: currentRates
    });
  } catch (error) {
    console.error('Get current rates error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single raw material
// @route   GET /api/raw-materials/:id
// @access  Private
const getRawMaterial = async (req, res) => {
  try {
    const rawMaterial = await RawMaterial.findById(req.params.id)
      .populate('CreatedBy', 'Username Email')
      .populate('UpdatedBy', 'Username Email');
    
    if (!rawMaterial) {
      return res.status(404).json({
        success: false,
        message: 'Raw material not found'
      });
    }
    
    res.json({
      success: true,
      data: rawMaterial
    });
  } catch (error) {
    console.error('Get raw material error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Raw material not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create raw material
// @route   POST /api/raw-materials
// @access  Private
const createRawMaterial = async (req, res) => {
  try {
    const rawMaterialData = {
      ...req.body,
      CreatedBy: req.user._id,
      UpdatedBy: req.user._id
    };
    
    const rawMaterial = await RawMaterial.create(rawMaterialData);
    
    const populatedRawMaterial = await RawMaterial.findById(rawMaterial._id)
      .populate('CreatedBy', 'Username Email');
    
    res.status(201).json({
      success: true,
      data: populatedRawMaterial,
      message: 'Raw material created successfully'
    });
  } catch (error) {
    console.error('Create raw material error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Raw material with this name and grade already exists'
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

// @desc    Update raw material
// @route   PUT /api/raw-materials/:id
// @access  Private
const updateRawMaterial = async (req, res) => {
  try {
    const rawMaterial = await RawMaterial.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        UpdatedAt: Date.now(),
        UpdatedBy: req.user._id
      },
      { new: true, runValidators: true }
    ).populate('CreatedBy', 'Username Email')
     .populate('UpdatedBy', 'Username Email');
    
    if (!rawMaterial) {
      return res.status(404).json({
        success: false,
        message: 'Raw material not found'
      });
    }
    
    res.json({
      success: true,
      data: rawMaterial,
      message: 'Raw material updated successfully'
    });
  } catch (error) {
    console.error('Update raw material error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Raw material with this name and grade already exists'
      });
    }
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Raw material not found'
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

// @desc    Delete raw material (soft delete)
// @route   DELETE /api/raw-materials/:id
// @access  Private
const deleteRawMaterial = async (req, res) => {
  try {
    const rawMaterial = await RawMaterial.findById(req.params.id);
    
    if (!rawMaterial) {
      return res.status(404).json({
        success: false,
        message: 'Raw material not found'
      });
    }
    
    rawMaterial.IsActive = false;
    rawMaterial.UpdatedBy = req.user._id;
    await rawMaterial.save();
    
    res.json({
      success: true,
      message: 'Raw material deactivated successfully'
    });
  } catch (error) {
    console.error('Delete raw material error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Raw material not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get raw materials for dropdown
// @route   GET /api/raw-materials/dropdown
// @access  Private
const getRawMaterialsDropdown = async (req, res) => {
  try {
    const rawMaterials = await RawMaterial.find({ IsActive: true })
      .select('MaterialName Grade RatePerKG EffectiveRate scrap_rate_per_kg profile_conversion_rate')
      .sort({ MaterialName: 1, Grade: 1 });
    
    res.json({
      success: true,
      data: rawMaterials
    });
  } catch (error) {
    console.error('Get raw materials dropdown error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Bulk create/update raw materials
// @route   POST /api/raw-materials/bulk
// @access  Private
const bulkCreateRawMaterials = async (req, res) => {
  try {
    const materials = req.body;
    const userId = req.user._id;
    
    const operations = materials.map(material => ({
      updateOne: {
        filter: { 
          MaterialName: material.MaterialName,
          Grade: material.Grade,
          DateEffective: material.DateEffective
        },
        update: {
          $set: {
            ...material,
            UpdatedBy: userId,
            UpdatedAt: Date.now()
          },
          $setOnInsert: {
            CreatedBy: userId
          }
        },
        upsert: true
      }
    }));
    
    const result = await RawMaterial.bulkWrite(operations);
    
    res.json({
      success: true,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount,
        upserted: result.upsertedCount
      },
      message: 'Bulk operation completed successfully'
    });
  } catch (error) {
    console.error('Bulk create raw materials error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getRawMaterials,
  getCurrentRates,
  getRawMaterial,
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
  getRawMaterialsDropdown,
  bulkCreateRawMaterials
};