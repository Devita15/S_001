const Material = require('../../models/CRM/Material');
// @desc    Get all materials
// @route   GET /api/materials
// @access  Private
const getMaterials = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, isActive } = req.query;
    
    const query = {};
    
    if (isActive !== undefined) {
      query.IsActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { MaterialCode: new RegExp(search, 'i') },
        { MaterialName: new RegExp(search, 'i') },
        { material_id: new RegExp(search, 'i') },
        { Description: new RegExp(search, 'i') }
      ];
    }
    
    const materials = await Material.find(query)
      .populate('CreatedBy', 'Username Email')
      .populate('UpdatedBy', 'Username Email')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ MaterialName: 1 });
    
    const total = await Material.countDocuments(query);
    
    res.json({
      success: true,
      data: materials,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get materials error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single material
// @route   GET /api/materials/:id
// @access  Private
const getMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id)
      .populate('CreatedBy', 'Username Email')
      .populate('UpdatedBy', 'Username Email');
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }
    
    res.json({
      success: true,
      data: material
    });
  } catch (error) {
    console.error('Get material error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create material
// @route   POST /api/materials
// @access  Private
const createMaterial = async (req, res) => {
  try {
    const materialData = {
      ...req.body,
      material_id: req.body.material_id || `MAT-${Date.now()}`,
      CreatedBy: req.user._id,
      UpdatedBy: req.user._id
    };
    
    const material = await Material.create(materialData);
    
    const populatedMaterial = await Material.findById(material._id)
      .populate('CreatedBy', 'Username Email');
    
    res.status(201).json({
      success: true,
      data: populatedMaterial,
      message: 'Material created successfully'
    });
  } catch (error) {
    console.error('Create material error:', error);
    
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

// @desc    Update material
// @route   PUT /api/materials/:id
// @access  Private
const updateMaterial = async (req, res) => {
  try {
    const material = await Material.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        UpdatedBy: req.user._id
      },
      { new: true, runValidators: true }
    ).populate('CreatedBy', 'Username Email')
     .populate('UpdatedBy', 'Username Email');
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }
    
    res.json({
      success: true,
      data: material,
      message: 'Material updated successfully'
    });
  } catch (error) {
    console.error('Update material error:', error);
    
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
        message: 'Material not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete material (soft delete)
// @route   DELETE /api/materials/:id
// @access  Private
const deleteMaterial = async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }
    
    // Check if material is used in items
    const Item = require('../../models/CRM/Item');
    const itemCount = await Item.countDocuments({ MaterialID: req.params.id, IsActive: true });
    
    if (itemCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete material. It is used in ${itemCount} active item(s).`
      });
    }
    
    material.IsActive = false;
    material.UpdatedBy = req.user._id;
    await material.save();
    
    res.json({
      success: true,
      message: 'Material deactivated successfully'
    });
  } catch (error) {
    console.error('Delete material error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get materials for dropdown
// @route   GET /api/materials/dropdown
// @access  Private
const getMaterialsDropdown = async (req, res) => {
  try {
    const materials = await Material.find({ IsActive: true })
      .select('material_id MaterialCode MaterialName Density Unit EffectiveRate')
      .sort({ MaterialName: 1 });
    
    res.json({
      success: true,
      data: materials
    });
  } catch (error) {
    console.error('Get materials dropdown error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getMaterials,
  getMaterial,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getMaterialsDropdown
};