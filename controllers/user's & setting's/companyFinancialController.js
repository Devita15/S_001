const CompanyFinancial = require('../../models/CRM/CompanyFinancial');
const Company = require('../../models/user\'s & setting\'s/Company');

// @desc    Get company financial settings
// @route   GET /api/company-financial
// @access  Private
const getCompanyFinancial = async (req, res) => {
  try {
    const { companyId } = req.query;
    
    const query = { IsActive: true };
    
    if (companyId) {
      query.CompanyID = companyId;
    } else {
      // Get first active company if no companyId provided
      const company = await Company.findOne({ IsActive: true });
      if (company) {
        query.CompanyID = company._id;
      }
    }
    
    let companyFinancial = await CompanyFinancial.findOne(query)
      .populate('CompanyID', 'CompanyName GSTIN State')
      .populate('CreatedBy', 'Username Email')
      .populate('UpdatedBy', 'Username Email');
    
    // If no financial settings found, create default ones
    if (!companyFinancial && query.CompanyID) {
      companyFinancial = await CompanyFinancial.create({
        CompanyID: query.CompanyID,
        CreatedBy: req.user?.id
      });
      
      companyFinancial = await CompanyFinancial.findById(companyFinancial._id)
        .populate('CompanyID', 'CompanyName GSTIN State')
        .populate('CreatedBy', 'Username Email');
    }
    
    res.json({
      success: true,
      data: companyFinancial || {}
    });
  } catch (error) {
    console.error('Get company financial error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create or update company financial settings
// @route   POST /api/company-financial
// @access  Private
const createOrUpdateCompanyFinancial = async (req, res) => {
    try {
      const userId = req.user.id;
      const {
        CompanyID,
        CreditOnInputMaterialDays,
        WIPFGInventoryDays,
        CreditGivenToCustomerDays,
        CostOfCapital,
        OHPPercentage,
        ProfitPercentage,
        ScrapRecoveryPercentage,
        EffectiveScrapRateMultiplier,
        InspectionCost,
        ToolMaintenanceCost,
        PlatingRatePerKG
      } = req.body;
      
      // Validate company exists
      const company = await Company.findById(CompanyID);
      if (!company) {
        return res.status(404).json({
          success: false,
          message: 'Company not found'
        });
      }
      
      // Check if financial settings already exist for this company
      let companyFinancial = await CompanyFinancial.findOne({ CompanyID });
      
      if (companyFinancial) {
        // Update existing - include all fields
        companyFinancial = await CompanyFinancial.findByIdAndUpdate(
          companyFinancial._id,
          {
            CreditOnInputMaterialDays,
            WIPFGInventoryDays,
            CreditGivenToCustomerDays,
            CostOfCapital,
            OHPPercentage,
            ProfitPercentage,
            ScrapRecoveryPercentage,
            EffectiveScrapRateMultiplier,
            InspectionCost,
            ToolMaintenanceCost,
            PlatingRatePerKG,
            UpdatedBy: userId,
            UpdatedAt: Date.now()
          },
          { new: true, runValidators: true }
        );
        
        var message = 'Company financial settings updated successfully';
      } else {
        // Create new - include all fields
        companyFinancial = await CompanyFinancial.create({
          CompanyID,
          CreditOnInputMaterialDays,
          WIPFGInventoryDays,
          CreditGivenToCustomerDays,
          CostOfCapital,
          OHPPercentage,
          ProfitPercentage,
          ScrapRecoveryPercentage,
          EffectiveScrapRateMultiplier,
          InspectionCost,
          ToolMaintenanceCost,
          PlatingRatePerKG,
          CreatedBy: userId,
          UpdatedBy: userId
        });
        
        var message = 'Company financial settings created successfully';
      }
      
      // Populate response
      const populatedFinancial = await CompanyFinancial.findById(companyFinancial._id)
        .populate('CompanyID', 'CompanyName GSTIN State')
        .populate('CreatedBy', 'Username Email')
        .populate('UpdatedBy', 'Username Email');
      
      res.status(201).json({
        success: true,
        data: populatedFinancial,
        message
      });
    } catch (error) {
      console.error('Create/update company financial error:', error);
      
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

// @desc    Update company financial settings
// @route   PUT /api/company-financial/:id
// @access  Private
const updateCompanyFinancial = async (req, res) => {
    try {
      const userId = req.user.id;
      
      const companyFinancial = await CompanyFinancial.findByIdAndUpdate(
        req.params.id,
        {
          ...req.body,  // This will now include all new fields
          UpdatedBy: userId,
          UpdatedAt: Date.now()
        },
        { new: true, runValidators: true }
      )
      .populate('CompanyID', 'CompanyName GSTIN State')
      .populate('CreatedBy', 'Username Email')
      .populate('UpdatedBy', 'Username Email');
      
      if (!companyFinancial) {
        return res.status(404).json({
          success: false,
          message: 'Company financial settings not found'
        });
      }
      
      res.json({
        success: true,
        data: companyFinancial,
        message: 'Company financial settings updated successfully'
      });
    } catch (error) {
      console.error('Update company financial error:', error);
      
      if (error.kind === 'ObjectId') {
        return res.status(404).json({
          success: false,
          message: 'Company financial settings not found'
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

// @desc    Delete company financial settings (soft delete)
// @route   DELETE /api/company-financial/:id
// @access  Private
const deleteCompanyFinancial = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const companyFinancial = await CompanyFinancial.findById(req.params.id);
    
    if (!companyFinancial) {
      return res.status(404).json({
        success: false,
        message: 'Company financial settings not found'
      });
    }
    
    // Soft delete
    companyFinancial.IsActive = false;
    companyFinancial.UpdatedBy = userId;
    await companyFinancial.save();
    
    res.json({
      success: true,
      message: 'Company financial settings deleted successfully'
    });
  } catch (error) {
    console.error('Delete company financial error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Company financial settings not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get company financial statistics
// @route   GET /api/company-financial/stats
// @access  Private
const getCompanyFinancialStats = async (req, res) => {
  try {
    const stats = await CompanyFinancial.aggregate([
      { $match: { IsActive: true } },
      {
        $group: {
          _id: null,
          totalSettings: { $sum: 1 },
          avgCreditDays: { $avg: '$CreditOnInputMaterialDays' },
          avgWIPDays: { $avg: '$WIPFGInventoryDays' },
          avgCustomerCreditDays: { $avg: '$CreditGivenToCustomerDays' },
          avgCostOfCapital: { $avg: '$CostOfCapital' },
          avgOHP: { $avg: '$OHPPercentage' },
          avgProfit: { $avg: '$ProfitPercentage' }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: stats[0] || {
        totalSettings: 0,
        avgCreditDays: 0,
        avgWIPDays: 0,
        avgCustomerCreditDays: 0,
        avgCostOfCapital: 0,
        avgOHP: 0,
        avgProfit: 0
      }
    });
  } catch (error) {
    console.error('Get company financial stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getCompanyFinancial,
  createOrUpdateCompanyFinancial,
  updateCompanyFinancial,
  deleteCompanyFinancial,
  getCompanyFinancialStats
};