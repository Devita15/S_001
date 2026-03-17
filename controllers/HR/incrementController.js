const EmployeeIncrement = require('../models/EmployeeIncrement');
const Employee = require('../models/Employee');
const PieceRateMaster = require('../../models/HR/PieceRateMaster');
const incrementCalculationService = require('../../services/incrementCalculationService');
const mongoose = require('mongoose');

const incrementController = {
  
  // Preview increments for an employee
  async previewEmployeeIncrement(req, res) {
    try {
      const { employeeId } = req.params;
      const { year, policyId } = req.query;
      
      if (!year) {
        return res.status(400).json({
          success: false,
          message: 'Year is required'
        });
      }
      
      const result = await incrementCalculationService.calculateEmployeeIncrement(
        employeeId,
        parseInt(year),
        policyId,
        { checkPromotion: false }
      );
      
      res.json({
        success: true,
        data: result
      });
      
    } catch (error) {
      console.error('Preview increment error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Preview batch increments
  async previewBatchIncrements(req, res) {
    try {
      const { employeeIds, year, policyId } = req.body;
      
      if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Employee IDs array is required'
        });
      }
      
      if (!year) {
        return res.status(400).json({
          success: false,
          message: 'Year is required'
        });
      }
      
      const results = await incrementCalculationService.calculateBatchIncrements(
        employeeIds,
        parseInt(year),
        policyId,
        { skipProbation: true }
      );
      
      // Calculate summary
      const summary = {
        totalEmployees: results.length,
        processed: results.filter(r => !r.skipped && !r.error).length,
        skipped: results.filter(r => r.skipped).length,
        errors: results.filter(r => r.error).length,
        totalIncrementAmount: results
          .filter(r => !r.skipped && !r.error)
          .reduce((sum, r) => sum + (r.incrementAmount || 0), 0),
        averageIncrementPercent: 0
      };
      
      const processed = results.filter(r => !r.skipped && !r.error);
      if (processed.length > 0) {
        summary.averageIncrementPercent = 
          processed.reduce((sum, r) => sum + (r.incrementPercent || 0), 0) / processed.length;
      }
      
      res.json({
        success: true,
        summary,
        data: results
      });
      
    } catch (error) {
      console.error('Preview batch increments error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Create increment record (DRAFT)
  async createIncrement(req, res) {
    try {
      const {
        employeeId,
        incrementYear,
        cycleName,
        policyId,
        behaviorScore,
        behaviorCategory,
        behaviorSummary,
        previousSalary,
        incrementPercent,
        incrementAmount,
        newSalary,
        pieceRateUpdates,
        promotion,
        effectiveFrom,
        remarks
      } = req.body;
      
      // Check if increment already exists for this employee/year
      const existing = await EmployeeIncrement.findOne({
        employee: employeeId,
        incrementYear
      });
      
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Increment already exists for employee for year ${incrementYear}`
        });
      }
      
      const incrementData = {
        employee: employeeId,
        incrementYear,
        cycleName,
        policyId,
        behaviorScore,
        behaviorCategory,
        behaviorSummary,
        previousSalary,
        incrementPercent,
        incrementAmount,
        newSalary,
        effectiveFrom: new Date(effectiveFrom),
        remarks,
        createdBy: req.user._id,
        status: 'DRAFT'
      };
      
      if (pieceRateUpdates) {
        incrementData.pieceRateUpdates = pieceRateUpdates;
      }
      
      if (promotion) {
        incrementData.promotion = promotion;
      }
      
      const increment = await EmployeeIncrement.create(incrementData);
      
      await increment.populate([
        { path: 'employee', select: 'EmployeeID FirstName LastName' },
        { path: 'policyId', select: 'year name' },
        { path: 'createdBy', select: 'Username' }
      ]);
      
      res.status(201).json({
        success: true,
        data: increment,
        message: 'Increment draft created successfully'
      });
      
    } catch (error) {
      console.error('Create increment error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Get increments with filters
  async getIncrements(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        year,
        department,
        status,
        employeeId
      } = req.query;
      
      const filter = {};
      
      if (year) filter.incrementYear = parseInt(year);
      if (status) filter.status = status;
      if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
        filter.employee = employeeId;
      }
      
      // Department filter
      if (department && mongoose.Types.ObjectId.isValid(department)) {
        const employees = await Employee.find({ DepartmentID: department }).select('_id');
        filter.employee = { $in: employees.map(e => e._id) };
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const increments = await EmployeeIncrement.find(filter)
        .populate('employee', 'EmployeeID FirstName LastName DepartmentID DesignationID')
        .populate('policyId', 'year name')
        .populate('createdBy', 'Username')
        .populate('hrReviewedBy', 'Username')
        .populate('departmentApprovedBy', 'Username')
        .populate('financeApprovedBy', 'Username')
        .populate('appliedBy', 'Username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      const total = await EmployeeIncrement.countDocuments(filter);
      
      res.json({
        success: true,
        count: increments.length,
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        data: increments
      });
      
    } catch (error) {
      console.error('Get increments error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Get single increment
  async getIncrementById(req, res) {
    try {
      const { id } = req.params;
      
      const increment = await EmployeeIncrement.findById(id)
        .populate('employee')
        .populate('policyId')
        .populate('createdBy', 'Username')
        .populate('hrReviewedBy', 'Username')
        .populate('departmentApprovedBy', 'Username')
        .populate('financeApprovedBy', 'Username')
        .populate('appliedBy', 'Username')
        .populate('promotion.oldDesignation')
        .populate('promotion.newDesignation');
      
      if (!increment) {
        return res.status(404).json({
          success: false,
          message: 'Increment record not found'
        });
      }
      
      res.json({
        success: true,
        data: increment
      });
      
    } catch (error) {
      console.error('Get increment error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Update increment (DRAFT only)
  async updateIncrement(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const increment = await EmployeeIncrement.findById(id);
      
      if (!increment) {
        return res.status(404).json({
          success: false,
          message: 'Increment record not found'
        });
      }
      
      if (increment.status !== 'DRAFT') {
        return res.status(400).json({
          success: false,
          message: 'Only draft increments can be updated'
        });
      }
      
      // Remove fields that shouldn't be updated
      delete updates._id;
      delete updates.createdBy;
      delete updates.createdAt;
      
      Object.assign(increment, updates);
      increment.version += 1;
      
      await increment.save();
      
      res.json({
        success: true,
        data: increment,
        message: 'Increment updated successfully'
      });
      
    } catch (error) {
      console.error('Update increment error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // HR Review
  async hrReview(req, res) {
    try {
      const { id } = req.params;
      const { hrRemarks } = req.body;
      
      const increment = await EmployeeIncrement.findById(id);
      
      if (!increment) {
        return res.status(404).json({
          success: false,
          message: 'Increment record not found'
        });
      }
      
      if (increment.status !== 'DRAFT') {
        return res.status(400).json({
          success: false,
          message: 'Increment must be in DRAFT status for HR review'
        });
      }
      
      increment.status = 'HR_REVIEW';
      increment.hrReviewedBy = req.user._id;
      increment.hrReviewedAt = new Date();
      increment.hrRemarks = hrRemarks || increment.hrRemarks;
      
      await increment.save();
      
      res.json({
        success: true,
        data: increment,
        message: 'HR review completed'
      });
      
    } catch (error) {
      console.error('HR review error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Department Approval
  async departmentApprove(req, res) {
    try {
      const { id } = req.params;
      const { departmentRemarks } = req.body;
      
      const increment = await EmployeeIncrement.findById(id);
      
      if (!increment) {
        return res.status(404).json({
          success: false,
          message: 'Increment record not found'
        });
      }
      
      if (increment.status !== 'HR_REVIEW') {
        return res.status(400).json({
          success: false,
          message: 'Increment must be HR reviewed before department approval'
        });
      }
      
      increment.status = 'DEPARTMENT_APPROVED';
      increment.departmentApprovedBy = req.user._id;
      increment.departmentApprovedAt = new Date();
      increment.departmentRemarks = departmentRemarks || increment.departmentRemarks;
      
      await increment.save();
      
      res.json({
        success: true,
        data: increment,
        message: 'Department approved'
      });
      
    } catch (error) {
      console.error('Department approve error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Finance Approval
  async financeApprove(req, res) {
    try {
      const { id } = req.params;
      const { financeRemarks } = req.body;
      
      const increment = await EmployeeIncrement.findById(id);
      
      if (!increment) {
        return res.status(404).json({
          success: false,
          message: 'Increment record not found'
        });
      }
      
      if (increment.status !== 'DEPARTMENT_APPROVED') {
        return res.status(400).json({
          success: false,
          message: 'Increment must be department approved before finance approval'
        });
      }
      
      increment.status = 'FINANCE_APPROVED';
      increment.financeApprovedBy = req.user._id;
      increment.financeApprovedAt = new Date();
      increment.financeRemarks = financeRemarks || increment.financeRemarks;
      
      await increment.save();
      
      res.json({
        success: true,
        data: increment,
        message: 'Finance approved'
      });
      
    } catch (error) {
      console.error('Finance approve error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Apply increment (final step)
  async applyIncrement(req, res) {
    try {
      const { id } = req.params;
      
      const increment = await EmployeeIncrement.findById(id);
      
      if (!increment) {
        return res.status(404).json({
          success: false,
          message: 'Increment record not found'
        });
      }
      
      if (increment.status !== 'FINANCE_APPROVED') {
        return res.status(400).json({
          success: false,
          message: 'Increment must be finance approved before applying'
        });
      }
      
      // Update employee salary
      const employee = await Employee.findById(increment.employee);
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }
      
      // Apply new salary
      employee.BasicSalary = increment.newSalary.BasicSalary || employee.BasicSalary;
      employee.HRA = increment.newSalary.HRA || employee.HRA;
      employee.ConveyanceAllowance = increment.newSalary.ConveyanceAllowance || employee.ConveyanceAllowance;
      employee.MedicalAllowance = increment.newSalary.MedicalAllowance || employee.MedicalAllowance;
      employee.SpecialAllowance = increment.newSalary.SpecialAllowance || employee.SpecialAllowance;
      employee.HourlyRate = increment.newSalary.HourlyRate || employee.HourlyRate;
      
      // Update promotion if any
      if (increment.promotion?.isPromoted && increment.promotion.newDesignation) {
        employee.DesignationID = increment.promotion.newDesignation;
      }
      
      await employee.save();
      
      // Update piece rates if any
      if (increment.pieceRateUpdates && increment.pieceRateUpdates.length > 0) {
        for (const update of increment.pieceRateUpdates) {
          await PieceRateMaster.findOneAndUpdate(
            {
              employee: increment.employee,
              productType: update.productType,
              operation: update.operation
            },
            {
              ratePerUnit: update.newRate,
              $push: {
                revisionHistory: {
                  oldRate: update.oldRate,
                  newRate: update.newRate,
                  changedBy: req.user._id,
                  changedAt: new Date(),
                  reason: 'Annual Increment',
                  incrementId: increment._id
                }
              }
            }
          );
        }
      }
      
      // Mark increment as applied
      increment.status = 'APPLIED';
      increment.appliedBy = req.user._id;
      increment.appliedAt = new Date();
      increment.isLocked = true;
      
      await increment.save();
      
      res.json({
        success: true,
        data: increment,
        message: 'Increment applied successfully'
      });
      
    } catch (error) {
      console.error('Apply increment error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Reject increment
  async rejectIncrement(req, res) {
    try {
      const { id } = req.params;
      const { remarks } = req.body;
      
      const increment = await EmployeeIncrement.findById(id);
      
      if (!increment) {
        return res.status(404).json({
          success: false,
          message: 'Increment record not found'
        });
      }
      
      if (increment.status === 'APPLIED') {
        return res.status(400).json({
          success: false,
          message: 'Applied increments cannot be rejected'
        });
      }
      
      increment.status = 'REJECTED';
      increment.remarks = remarks || increment.remarks;
      
      await increment.save();
      
      res.json({
        success: true,
        data: increment,
        message: 'Increment rejected'
      });
      
    } catch (error) {
      console.error('Reject increment error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },
  
  // Get summary statistics
  async getIncrementSummary(req, res) {
    try {
      const { year } = req.params;
      
      const summary = await EmployeeIncrement.aggregate([
        {
          $match: {
            incrementYear: parseInt(year)
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalIncrementAmount: { $sum: '$incrementAmount' },
            avgIncrementPercent: { $avg: '$incrementPercent' }
          }
        }
      ]);
      
      const categorySummary = await EmployeeIncrement.aggregate([
        {
          $match: {
            incrementYear: parseInt(year),
            status: 'APPLIED'
          }
        },
        {
          $group: {
            _id: '$behaviorCategory',
            count: { $sum: 1 },
            avgIncrementPercent: { $avg: '$incrementPercent' }
          }
        }
      ]);
      
      res.json({
        success: true,
        data: {
          byStatus: summary,
          byCategory: categorySummary,
          totalEmployees: summary.reduce((sum, s) => sum + s.count, 0),
          year: parseInt(year)
        }
      });
      
    } catch (error) {
      console.error('Increment summary error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};

/**
 * Get eligible employees report
 * GET /api/increments/reports/eligible/:year
 */
async function getEligibleEmployeesReport(req, res) {
  try {
    const { year } = req.params;
    const { probationMonths = 6 } = req.query;
    
    const reportService = require('../../services/reportService');
    const result = await reportService.getEligibleEmployees(
      parseInt(year), 
      parseInt(probationMonths)
    );
    
    await auditService.log(
      'VIEW',
      'IncrementReport',
      null,
      req.user,
      { action: 'view_eligible_report', year, probationMonths },
      req
    );
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Eligible employees report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * Get increment impact report
 * GET /api/increments/reports/impact/:year
 */
async function getImpactReport(req, res) {
  try {
    const { year } = req.params;
    
    const reportService = require('../../services/reportService');
    const result = await reportService.getIncrementImpactReport(parseInt(year));
    
    await auditService.log(
      'VIEW',
      'IncrementReport',
      null,
      req.user,
      { action: 'view_impact_report', year },
      req
    );
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Impact report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * Get behavior correlation report
 * GET /api/increments/reports/correlation/:year
 */
async function getCorrelationReport(req, res) {
  try {
    const { year } = req.params;
    
    const reportService = require('../../services/reportService');
    const result = await reportService.getBehaviorCorrelationReport(parseInt(year));
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Correlation report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * Get employee increment history
 * GET /api/increments/reports/employee-history/:employeeId
 */
async function getEmployeeHistoryReport(req, res) {
  try {
    const { employeeId } = req.params;
    
    const reportService = require('../../services/reportService');
    const result = await reportService.getEmployeeIncrementHistory(employeeId);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Employee history report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * Get department increment summary
 * GET /api/increments/reports/department-summary/:year
 */
async function getDepartmentSummaryReport(req, res) {
  try {
    const { year } = req.params;
    
    const reportService = require('../../services/reportService');
    const result = await reportService.getDepartmentIncrementSummary(parseInt(year));
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Department summary report error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

// Export the new methods
module.exports = {
  ...incrementController, // your existing exports
  getEligibleEmployeesReport,
  getImpactReport,
  getCorrelationReport,
  getEmployeeHistoryReport,
  getDepartmentSummaryReport
};
