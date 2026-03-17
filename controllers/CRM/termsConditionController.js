const TermsCondition = require('../../models/CRM/TermsCondition');

const getTermsConditions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search 
    } = req.query;
    
    // Build query
    const query = {};
    
    // Add search functionality if search parameter is provided
    if (search) {
      query.$or = [
        { Title: new RegExp(search, 'i') },
        { Description: new RegExp(search, 'i') }
      ];
    }
    
    // Get total count for pagination
    const total = await TermsCondition.countDocuments(query);
    
    // Fetch terms conditions with pagination
    const termsConditions = await TermsCondition.find(query)
      .sort({ Sequence: 1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    res.json({ 
      success: true, 
      data: termsConditions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

const getTermsCondition = async (req, res) => {
  try {
    const termsCondition = await TermsCondition.findById(req.params.id);
    
    if (!termsCondition) {
      return res.status(404).json({ 
        success: false, 
        message: 'Terms & condition not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: termsCondition 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

const createTermsCondition = async (req, res) => {
  try {
    const termsCondition = await TermsCondition.create(req.body);
    
    res.status(201).json({ 
      success: true, 
      data: termsCondition,
      message: 'Terms & condition created successfully' 
    });
  } catch (error) {
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

const updateTermsCondition = async (req, res) => {
  try {
    const termsCondition = await TermsCondition.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!termsCondition) {
      return res.status(404).json({ 
        success: false, 
        message: 'Terms & condition not found' 
      });
    }
    
    res.json({ 
      success: true, 
      data: termsCondition,
      message: 'Terms & condition updated successfully' 
    });
  } catch (error) {
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

const deleteTermsCondition = async (req, res) => {
  try {
    const termsCondition = await TermsCondition.findById(req.params.id);
    
    if (!termsCondition) {
      return res.status(404).json({ 
        success: false, 
        message: 'Terms & condition not found' 
      });
    }
    
    await TermsCondition.findByIdAndDelete(req.params.id);
    
    res.json({ 
      success: true, 
      message: 'Terms & condition deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

module.exports = {
  getTermsConditions,
  getTermsCondition,
  createTermsCondition,
  updateTermsCondition,
  deleteTermsCondition
};