'use strict';
const Item = require('../../models/CRM/Item');

// @desc    Get all items with pagination and search
// @route   GET /api/items
// @access  Private
const getItems = async (req, res) => {
  try {
    const { page = 1, limit = 10, is_active, search, item_category, item_type, procurement_type } = req.query;
    
    const query = {};
    if (is_active !== undefined) query.is_active = is_active === 'true';
    if (item_category) query.item_category = item_category;
    if (item_type) query.item_type = item_type;
    if (procurement_type) query.procurement_type = procurement_type;
    
    if (search) {
      query.$or = [
        { part_no: new RegExp(search, 'i') },
        { part_name: new RegExp(search, 'i') },
        { part_description: new RegExp(search, 'i') },
        { drawing_no: new RegExp(search, 'i') },
        { rm_grade: new RegExp(search, 'i') },
        { item_no: new RegExp(search, 'i') },
        { material: new RegExp(search, 'i') },
        { rm_source: new RegExp(search, 'i') },
        { rm_type: new RegExp(search, 'i') },
        { rm_spec: new RegExp(search, 'i') },
        { hsn_code: new RegExp(search, 'i') }
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
      part_no: req.body.part_no ? req.body.part_no.toUpperCase() : undefined,
      part_name: req.body.part_name ? req.body.part_name.trim() : undefined,
      part_description: req.body.part_description ? req.body.part_description.trim() : undefined,
      created_by: req.user._id,
      updated_by: req.user._id
    };
    
    // Validate required fields
    if (!itemData.part_no) {
      return res.status(400).json({
        success: false,
        message: 'part_no is required'
      });
    }
    if (!itemData.part_name) {
      return res.status(400).json({
        success: false,
        message: 'part_name is required'
      });
    }
    if (!itemData.part_description) {
      return res.status(400).json({
        success: false,
        message: 'part_description is required'
      });
    }
    if (!itemData.item_category) {
      return res.status(400).json({
        success: false,
        message: 'item_category is required'
      });
    }
    if (!itemData.unit) {
      return res.status(400).json({
        success: false,
        message: 'unit is required'
      });
    }
    if (!itemData.hsn_code) {
      return res.status(400).json({
        success: false,
        message: 'hsn_code is required'
      });
    }
    
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
    // Check if part_no is locked
    const existingItem = await Item.findById(req.params.id);
    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }
    
    if (existingItem.part_no_locked && req.body.part_no && req.body.part_no !== existingItem.part_no) {
      return res.status(400).json({
        success: false,
        message: 'Part number cannot be changed once Work Orders have been created for this item'
      });
    }
    
    const updateData = {
      ...req.body,
      updated_by: req.user._id
    };
    
    // Only uppercase part_no if it's being updated
    if (req.body.part_no) {
      updateData.part_no = req.body.part_no.toUpperCase();
    }
    
    // Ensure part_name is trimmed if provided
    if (req.body.part_name) {
      updateData.part_name = req.body.part_name.trim();
    }
    
    // Ensure part_description is trimmed if provided
    if (req.body.part_description) {
      updateData.part_description = req.body.part_description.trim();
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
    
    // Check if item is referenced in any active Sales Orders or Work Orders
    // This is a soft check - you may want to implement actual reference checks
    if (item.part_no_locked) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate item as it has active Work Orders'
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

// @desc    Get items for dropdown (includes part_name)
// @route   GET /api/items/dropdown
// @access  Private
const getItemsDropdown = async (req, res) => {
  try {
    const { item_category, search } = req.query;
    const query = { is_active: true };
    
    if (item_category) query.item_category = item_category;
    
    if (search) {
      query.$or = [
        { part_no: new RegExp(search, 'i') },
        { part_name: new RegExp(search, 'i') },
        { part_description: new RegExp(search, 'i') }
      ];
    }
    
    const items = await Item.find(query)
      .select('item_id part_no part_name part_description unit item_no material rm_grade density hsn_code gst_percentage')
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

// @desc    Bulk import items
// @route   POST /api/items/bulk
// @access  Private
const bulkCreateItems = async (req, res) => {
  try {
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'items must be a non-empty array'
      });
    }
    
    const createdItems = [];
    const errors = [];
    
    for (const itemData of items) {
      try {
        const newItem = await Item.create({
          ...itemData,
          item_id: `ITEM-${Date.now()}-${Math.random()}`,
          part_no: itemData.part_no.toUpperCase(),
          part_name: itemData.part_name.trim(),
          part_description: itemData.part_description.trim(),
          created_by: req.user._id,
          updated_by: req.user._id
        });
        createdItems.push(newItem);
      } catch (err) {
        errors.push({
          part_no: itemData.part_no,
          error: err.message
        });
      }
    }
    
    res.status(201).json({
      success: true,
      data: {
        created: createdItems,
        errors: errors,
        total_processed: items.length,
        total_created: createdItems.length,
        total_errors: errors.length
      },
      message: `${createdItems.length} items created successfully`
    });
  } catch (error) {
    console.error('Bulk create items error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get item by part number
// @route   GET /api/items/part/:part_no
// @access  Private
const getItemByPartNo = async (req, res) => {
  try {
    const item = await Item.findOne({ part_no: req.params.part_no.toUpperCase(), is_active: true })
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
    console.error('Get item by part no error:', error);
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
  getItemsDropdown,
  bulkCreateItems,
  getItemByPartNo
};