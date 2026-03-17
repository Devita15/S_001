const Customer = require('../../models/CRM/Customer');
// @desc    Get all customers
// @route   GET /api/customers
// @access  Public
const getCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, state } = req.query;
    
    const query = { IsActive: true };
    
    if (search) {
      query.$or = [
        { CustomerCode: new RegExp(search, 'i') },
        { CustomerName: new RegExp(search, 'i') },
        { GSTIN: new RegExp(search, 'i') },
        { ContactPerson: new RegExp(search, 'i') }
      ];
    }
    
    if (state) {
      query.State = new RegExp(state, 'i');
    }
    
    const customers = await Customer.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ CustomerName: 1 });
    
    const total = await Customer.countDocuments(query);
    
    res.json({ 
      success: true, 
      data: customers,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: Number(limit)
      }
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Public
const getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: customer 
    });
  } catch (error) {
    console.error('Get customer error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// @desc    Create customer
// @route   POST /api/customers
// @access  Public
const createCustomer = async (req, res) => {
  try {
    const customer = await Customer.create(req.body);
    
    res.status(201).json({ 
      success: true, 
      data: customer,
      message: 'Customer created successfully' 
    });
  } catch (error) {
    console.error('Create customer error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer with this code or GSTIN already exists' 
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

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Public
const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { ...req.body, UpdatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: customer,
      message: 'Customer updated successfully' 
    });
  } catch (error) {
    console.error('Update customer error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Customer with this code or GSTIN already exists' 
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

// @desc    Delete customer (HARD DELETE)
// @route   DELETE /api/customers/:id
// @access  Public
const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    // Check if customer is used in quotations
    const Quotation = require('../../models/CRM/Quotation');
    const quotationCount = await Quotation.countDocuments({ CustomerID: customer._id });
    
    if (quotationCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete customer. ${quotationCount} quotation(s) are associated with this customer.` 
      });
    }
    
    // HARD DELETE
    await Customer.findByIdAndDelete(req.params.id);
    
    res.json({ 
      success: true, 
      message: 'Customer deleted successfully' 
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

module.exports = {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer
};