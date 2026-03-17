const Vendor = require('../../models/CRM/Vendor');

// @desc    Get all vendors
// @route   GET /api/vendors
// @access  Private
const getVendors = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      is_active, 
      vendor_type,
      search,
      state_code 
    } = req.query;
    
    const query = {};
    if (is_active !== undefined) query.is_active = is_active === 'true';
    if (vendor_type) query.vendor_type = vendor_type;
    if (state_code) query.state_code = state_code;
    
    if (search) {
      query.$or = [
        { vendor_name: new RegExp(search, 'i') },
        { vendor_code: new RegExp(search, 'i') },
        { gstin: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }
    
    const vendors = await Vendor.find(query)
      .populate('created_by', 'username email')
      .populate('updated_by', 'username email')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ vendor_name: 1 });
    
    const total = await Vendor.countDocuments(query);
    
    res.json({
      success: true,
      data: vendors,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single vendor
// @route   GET /api/vendors/:id
// @access  Private
const getVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id)
      .populate('created_by', 'username email')
      .populate('updated_by', 'username email');
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    res.json({
      success: true,
      data: vendor
    });
  } catch (error) {
    console.error('Get vendor error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create vendor
// @route   POST /api/vendors
// @access  Private
const createVendor = async (req, res) => {
  try {
    const vendorCode = req.body.vendor_code || `VEN-${Date.now().toString().slice(-6)}`;
    
    const vendorData = {
      ...req.body,
      vendor_id: `VEN-${Date.now()}`,
      vendor_code: vendorCode,
      created_by: req.user._id,
      updated_by: req.user._id
    };
    
    const vendor = await Vendor.create(vendorData);
    
    const populatedVendor = await Vendor.findById(vendor._id)
      .populate('created_by', 'username email');
    
    res.status(201).json({
      success: true,
      data: populatedVendor,
      message: 'Vendor created successfully'
    });
  } catch (error) {
    console.error('Create vendor error:', error);
    
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

// @desc    Update vendor
// @route   PUT /api/vendors/:id
// @access  Private
const updateVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        updated_by: req.user._id
      },
      { new: true, runValidators: true }
    ).populate('created_by', 'username email')
     .populate('updated_by', 'username email');
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    res.json({
      success: true,
      data: vendor,
      message: 'Vendor updated successfully'
    });
  } catch (error) {
    console.error('Update vendor error:', error);
    
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
        message: 'Vendor not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete vendor (soft delete)
// @route   DELETE /api/vendors/:id
// @access  Private
const deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    
    vendor.is_active = false;
    vendor.updated_by = req.user._id;
    await vendor.save();
    
    res.json({
      success: true,
      message: 'Vendor deactivated successfully'
    });
  } catch (error) {
    console.error('Delete vendor error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get vendors for dropdown
// @route   GET /api/vendors/dropdown
// @access  Private
const getVendorsDropdown = async (req, res) => {
  try {
    const { vendor_type } = req.query;
    
    const query = { is_active: true };
    if (vendor_type) {
      query.vendor_type = { $in: [vendor_type, 'Both'] };
    }
    
    const vendors = await Vendor.find(query)
      .select('vendor_id vendor_code vendor_name vendor_type gstin state state_code')
      .sort({ vendor_name: 1 });
    
    res.json({
      success: true,
      data: vendors
    });
  } catch (error) {
    console.error('Get vendors dropdown error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
  getVendorsDropdown
};