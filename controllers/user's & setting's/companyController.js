const Company = require('../../models/user\'s & setting\'s/Company');
const fs = require('fs');
const path = require('path');

// @desc    Get all companies
// @route   GET /api/companies
// @access  Public
const getCompanies = async (req, res) => {
  try {
    const companies = await Company.find({ is_active: true })
      .sort({ company_name: 1 })
      .select('-__v');
    
    // Add logo URL to each company
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const companiesWithLogoUrl = companies.map(company => {
      const companyObj = company.toObject();
      if (companyObj.logo_path) {
        companyObj.logo_url = `${baseUrl}/${companyObj.logo_path.replace(/\\/g, '/')}`;
      }
      return companyObj;
    });
    
    res.json({ 
      success: true, 
      data: companiesWithLogoUrl,
      count: companies.length 
    });
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};

// @desc    Get single company
// @route   GET /api/companies/:id
// @access  Public
const getCompany = async (req, res) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid company ID format' 
      });
    }

    const company = await Company.findById(req.params.id)
      .select('-__v');
    
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }
    
    // Add logo URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const companyObj = company.toObject();
    if (companyObj.logo_path) {
      companyObj.logo_url = `${baseUrl}/${companyObj.logo_path.replace(/\\/g, '/')}`;
    }
    
    res.json({ 
      success: true, 
      data: companyObj 
    });
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};

// @desc    Create company with logo
// @route   POST /api/companies
// @access  Public
const createCompany = async (req, res) => {
  try {
    console.log('Create company request body:', req.body);
    console.log('Create company file:', req.file);

    // Parse bank_details if it's a string (for FormData)
    let bankDetails = req.body.bank_details;
    if (typeof bankDetails === 'string') {
      try {
        bankDetails = JSON.parse(bankDetails);
      } catch (e) {
        console.error('Error parsing bank_details:', e);
        bankDetails = {};
      }
    }

    // Prepare company data from form fields
    const companyData = {
      company_id: req.body.company_id,
      company_name: req.body.company_name,
      gstin: req.body.gstin,
      pan: req.body.pan,
      address: req.body.address,
      state: req.body.state,
      state_code: parseInt(req.body.state_code),
      phone: req.body.phone,
      email: req.body.email,
      is_active: req.body.is_active === 'true' || req.body.is_active === true,
      created_by: req.body.created_by,
      updated_by: req.body.updated_by,
      // Handle bank_details as a nested object
      bank_details: {
        bank_name: bankDetails?.bank_name || '',
        account_no: bankDetails?.account_no || '',
        ifsc: bankDetails?.ifsc || '',
        branch: bankDetails?.branch || ''
      }
    };

    // Handle logo if uploaded
    if (req.file) {
      companyData.logo_path = req.file.path.replace(/\\/g, '/');
    }

    const company = await Company.create(companyData);
    
    // Add logo URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const companyObj = company.toObject();
    if (companyObj.logo_path) {
      companyObj.logo_url = `${baseUrl}/${companyObj.logo_path}`;
    }
    
    res.status(201).json({ 
      success: true, 
      data: companyObj,
      message: 'Company created successfully' 
    });
  } catch (error) {
    console.error('Create company error:', error);
    
    // Delete uploaded file if error occurs
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        success: false, 
        message: `Company with this ${field} already exists` 
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
        success: false, 
        message: messages.join(', ') 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};

// @desc    Update company with logo
// @route   PUT /api/companies/:id
// @access  Public
const updateCompany = async (req, res) => {
  try {
    console.log('Update company request body:', req.body);
    console.log('Update company file:', req.file);

    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid company ID format' 
      });
    }

    // Find existing company
    const existingCompany = await Company.findById(req.params.id);
    if (!existingCompany) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    // Parse bank_details if it's a string (for FormData)
    let bankDetails = req.body.bank_details;
    if (typeof bankDetails === 'string') {
      try {
        bankDetails = JSON.parse(bankDetails);
      } catch (e) {
        console.error('Error parsing bank_details:', e);
        bankDetails = {};
      }
    }

    // Prepare update data from form fields
    const updateData = {};

    // Only update fields that are provided
    if (req.body.company_id) updateData.company_id = req.body.company_id;
    if (req.body.company_name) updateData.company_name = req.body.company_name;
    if (req.body.gstin) updateData.gstin = req.body.gstin;
    if (req.body.pan) updateData.pan = req.body.pan;
    if (req.body.address) updateData.address = req.body.address;
    if (req.body.state) updateData.state = req.body.state;
    if (req.body.state_code) updateData.state_code = parseInt(req.body.state_code);
    if (req.body.phone) updateData.phone = req.body.phone;
    if (req.body.email) updateData.email = req.body.email;
    if (req.body.is_active !== undefined) {
      updateData.is_active = req.body.is_active === 'true' || req.body.is_active === true;
    }
    if (req.body.updated_by) updateData.updated_by = req.body.updated_by;

    // Handle bank_details if provided
    if (bankDetails && (bankDetails.bank_name || bankDetails.account_no || bankDetails.ifsc || bankDetails.branch)) {
      updateData.bank_details = {
        bank_name: bankDetails.bank_name || existingCompany.bank_details?.bank_name || '',
        account_no: bankDetails.account_no || existingCompany.bank_details?.account_no || '',
        ifsc: bankDetails.ifsc || existingCompany.bank_details?.ifsc || '',
        branch: bankDetails.branch || existingCompany.bank_details?.branch || ''
      };
    }

    // Handle logo if uploaded
    if (req.file) {
      // Delete old logo if exists
      if (existingCompany.logo_path) {
        const oldLogoPath = path.join(__dirname, '..', existingCompany.logo_path);
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
          console.log('Old logo deleted:', oldLogoPath);
        }
      }
      updateData.logo_path = req.file.path.replace(/\\/g, '/');
    }

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      updateData,
      { 
        new: true,
        runValidators: true,
        context: 'query'
      }
    ).select('-__v');
    
    // Add logo URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const companyObj = company.toObject();
    if (companyObj.logo_path) {
      companyObj.logo_url = `${baseUrl}/${companyObj.logo_path}`;
    }
    
    res.json({ 
      success: true, 
      data: companyObj,
      message: 'Company updated successfully' 
    });
  } catch (error) {
    console.error('Update company error:', error);
    
    // Delete uploaded file if error occurs
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    // Handle duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        success: false, 
        message: `Company with this ${field} already exists` 
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
        success: false, 
        message: messages.join(', ') 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};

// @desc    Delete company
// @route   DELETE /api/companies/:id
// @access  Public
const deleteCompany = async (req, res) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid company ID format' 
      });
    }

    const company = await Company.findById(req.params.id);
    
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }
    
    // Check if company is used in quotations
    try {
      const Quotation = require('../../models/CRM/Quotation');
      const quotationCount = await Quotation.countDocuments({ CompanyID: company._id });
      
      if (quotationCount > 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Cannot delete company. ${quotationCount} quotation(s) are associated with this company.` 
        });
      }
    } catch (quotationError) {
      console.log('Quotation model not available, skipping reference check');
    }
    
    // Check if hard delete is requested
    const hardDelete = req.query.hard === 'true';
    
    if (hardDelete) {
      // Delete logo file if exists
      if (company.logo_path) {
        const logoPath = path.join(__dirname, '..', company.logo_path);
        if (fs.existsSync(logoPath)) {
          fs.unlinkSync(logoPath);
        }
      }
      
      // HARD DELETE
      await Company.findByIdAndDelete(req.params.id);
      res.json({ 
        success: true, 
        message: 'Company permanently deleted successfully' 
      });
    } else {
      // SOFT DELETE
      company.is_active = false;
      await company.save();
      res.json({ 
        success: true, 
        message: 'Company deactivated successfully' 
      });
    }
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
};

module.exports = {
  getCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany
};