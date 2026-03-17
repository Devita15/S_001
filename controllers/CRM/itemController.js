const Item = require('../../models/CRM/Item');
// @desc    Get all items
// @route   GET /api/items
// @access  Private
const getItems = async (req, res) => {
  try {
    const { page = 1, limit = 10, is_active, search } = req.query;
    
    const query = {};
    if (is_active !== undefined) query.is_active = is_active === 'true';
    
    if (search) {
      query.$or = [
        { part_no: new RegExp(search, 'i') },
        { part_description: new RegExp(search, 'i') },
        { drawing_no: new RegExp(search, 'i') },
        { rm_grade: new RegExp(search, 'i') },
        { item_no: new RegExp(search, 'i') },
        { material: new RegExp(search, 'i') },
        { rm_source: new RegExp(search, 'i') },
        { rm_type: new RegExp(search, 'i') },
        { rm_spec: new RegExp(search, 'i') }
      ];
    }
    
    const items = await Item.find(query)
      .populate('created_by', 'username email')
      .populate('updated_by', 'username email')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ part_no: 1 });
    
    const total = await Item.countDocuments(query);
    
    res.json({
      success: true,
      data: items,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single item
// @route   GET /api/items/:id
// @access  Private
const getItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate('created_by', 'username email')
      .populate('updated_by', 'username email');
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }
    
    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error('Get item error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create item
// @route   POST /api/items
// @access  Private
const createItem = async (req, res) => {
  try {
    const itemData = {
      ...req.body,
      item_id: `ITEM-${Date.now()}`,
      part_no: req.body.part_no.toUpperCase(),
      created_by: req.user._id,
      updated_by: req.user._id
    };
    
    const item = await Item.create(itemData);
    
    const populatedItem = await Item.findById(item._id)
      .populate('created_by', 'username email');
    
    res.status(201).json({
      success: true,
      data: populatedItem,
      message: 'Item created successfully'
    });
  } catch (error) {
    console.error('Create item error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Item with this part number already exists'
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

// @desc    Update item
// @route   PUT /api/items/:id
// @access  Private
const updateItem = async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updated_by: req.user._id
    };
    
    // Only uppercase part_no if it's being updated
    if (req.body.part_no) {
      updateData.part_no = req.body.part_no.toUpperCase();
    }
    
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('created_by', 'username email')
     .populate('updated_by', 'username email');
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }
    
    res.json({
      success: true,
      data: item,
      message: 'Item updated successfully'
    });
  } catch (error) {
    console.error('Update item error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Item with this part number already exists'
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
        message: 'Item not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete item (soft delete)
// @route   DELETE /api/items/:id
// @access  Private
const deleteItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }
    
    item.is_active = false;
    item.updated_by = req.user._id;
    await item.save();
    
    res.json({
      success: true,
      message: 'Item deactivated successfully'
    });
  } catch (error) {
    console.error('Delete item error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get items for dropdown
// @route   GET /api/items/dropdown
// @access  Private
const getItemsDropdown = async (req, res) => {
  try {
    const items = await Item.find({ is_active: true })
      .select('item_id part_no part_description density unit item_no material rm_grade')
      .sort({ part_no: 1 });
    
    res.json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error('Get items dropdown error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  getItemsDropdown
};