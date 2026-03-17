const IncrementPolicy = require('../models/IncrementPolicy');
const mongoose = require('mongoose');

const incrementPolicyController = {
  
  // Create new policy
  async createPolicy(req, res) {
    try {
      const {
        year,
        name,
        rules,
        categoryWeights,
        maxIncrementPercent,
        minIncrementPercent,
        penaltyRules,
        applyOn,
        proRataForPartialYear,
        probationExclude,
        budgetControl,
        promotionOverride,
        effectiveFrom
      } = req.body;
      
      // Check if year already exists
      const existing = await IncrementPolicy.findOne({ year });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Policy for year ${year} already exists`
        });
      }
      
      const policyData = {
        year,
        name: name || `Annual Increment ${year}`,
        rules,
        categoryWeights: new Map(Object.entries(categoryWeights || {})),
        maxIncrementPercent,
        minIncrementPercent,
        penaltyRules,
        applyOn: applyOn || 'BASIC',
        proRataForPartialYear: proRataForPartialYear !== false,
        probationExclude: probationExclude !== false,
        budgetControl,
        promotionOverride,
        effectiveFrom: new Date(effectiveFrom),
        createdBy: req.user._id
      };
      
      const policy = await IncrementPolicy.create(policyData);
      
      res.status(201).json({
        success: true,
        data: policy,
        message: 'Increment policy created successfully'
      });
      
    } catch (error) {
      console.error('Create policy error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Get all policies
  async getPolicies(req, res) {
    try {
      const policies = await IncrementPolicy.find()
        .populate('createdBy', 'Username')
        .populate('updatedBy', 'Username')
        .sort('-year');
      
      res.json({
        success: true,
        data: policies
      });
      
    } catch (error) {
      console.error('Get policies error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Get active policy for a year
  async getActivePolicy(req, res) {
    try {
      const { year } = req.params;
      
      const policy = await IncrementPolicy.findOne({
        year: parseInt(year),
        status: 'ACTIVE'
      });
      
      if (!policy) {
        return res.status(404).json({
          success: false,
          message: `No active policy found for year ${year}`
        });
      }
      
      res.json({
        success: true,
        data: policy
      });
      
    } catch (error) {
      console.error('Get active policy error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Update policy
  async updatePolicy(req, res) {
    try {
      const { id } = req.params;
      
      const policy = await IncrementPolicy.findById(id);
      if (!policy) {
        return res.status(404).json({
          success: false,
          message: 'Policy not found'
        });
      }
      
      const updates = req.body;
      
      // Convert Maps if present
      if (updates.categoryWeights) {
        updates.categoryWeights = new Map(Object.entries(updates.categoryWeights));
      }
      
      updates.updatedBy = req.user._id;
      
      Object.assign(policy, updates);
      await policy.save();
      
      res.json({
        success: true,
        data: policy,
        message: 'Policy updated successfully'
      });
      
    } catch (error) {
      console.error('Update policy error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Activate policy
  async activatePolicy(req, res) {
    try {
      const { id } = req.params;
      
      // Deactivate all other policies for this year
      await IncrementPolicy.updateMany(
        { year: (await IncrementPolicy.findById(id)).year },
        { status: 'ARCHIVED' }
      );
      
      const policy = await IncrementPolicy.findByIdAndUpdate(
        id,
        { status: 'ACTIVE', updatedBy: req.user._id },
        { new: true }
      );
      
      res.json({
        success: true,
        data: policy,
        message: 'Policy activated successfully'
      });
      
    } catch (error) {
      console.error('Activate policy error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};

module.exports = incrementPolicyController;