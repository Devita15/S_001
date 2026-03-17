// controllers/salaryController.js
const Salary = require('../../models/HR/Salary');
const Employee = require('../../models/HR/Employee');
const mongoose = require('mongoose');

class SalaryController {
  
  // ==================== MANUAL SALARY ENTRY ====================
  
 /**
 * Create individual salary record (MANUAL ENTRY)
 * POST /api/salaries
 * 
 * This is the main API for manual salary entry.
 * Allows HR to enter all salary components manually.
 */
async createSalary(req, res) {
  try {
    const {
      employee,
      payrollPeriod,
      earnings,
      reimbursements,  // NEW: reimbursements field
      deductions,
      calculationRules,
      workingDays = 26,
      paidDays = 26,
      leaveDays = 0,
      lopDays = 0,
      overtimeHours,
      overtimeRate,
      performanceBonus,
      incentives,
      advanceDeductions,
      paymentMode = 'BANK_TRANSFER',
      remarks
    } = req.body;

    // Validate required fields
    if (!employee || !payrollPeriod || !payrollPeriod.month || !payrollPeriod.year) {
      return res.status(400).json({
        success: false,
        message: 'Employee, month, and year are required'
      });
    }

    // Check if employee exists and is active
    const employeeRecord = await Employee.findById(employee);
    if (!employeeRecord) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    if (employeeRecord.EmploymentStatus !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot create salary for inactive employee'
      });
    }

    // Check for duplicate salary for same period
    const existingSalary = await Salary.findOne({
      employee,
      'payrollPeriod.month': parseInt(payrollPeriod.month),
      'payrollPeriod.year': parseInt(payrollPeriod.year)
    });

    if (existingSalary) {
      return res.status(400).json({
        success: false,
        message: `Salary already exists for this employee for ${payrollPeriod.month}/${payrollPeriod.year}`
      });
    }

    // Process earnings (convert object to Map)
    const earningsMap = new Map();
    if (earnings && typeof earnings === 'object') {
      Object.entries(earnings).forEach(([key, value]) => {
        if (value !== undefined && value !== null && !isNaN(parseFloat(value))) {
          earningsMap.set(key, Number(value));
        }
      });
    }

    // NEW: Process reimbursements
    const reimbursementsMap = new Map();
    if (reimbursements && typeof reimbursements === 'object') {
      Object.entries(reimbursements).forEach(([key, value]) => {
        if (value !== undefined && value !== null && !isNaN(parseFloat(value))) {
          reimbursementsMap.set(key, Number(value));
        }
      });
    }

    // Process deductions (convert object to Map)
    const deductionsMap = new Map();
    if (deductions && typeof deductions === 'object') {
      Object.entries(deductions).forEach(([key, value]) => {
        if (value !== undefined && value !== null && !isNaN(parseFloat(value))) {
          deductionsMap.set(key, Number(value));
        }
      });
    }

    // Process calculation rules
    const calculationRulesMap = new Map();
    if (calculationRules && typeof calculationRules === 'object') {
      Object.entries(calculationRules).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          calculationRulesMap.set(key, value);
        }
      });
    }

    // Ensure basic salary is provided (minimum requirement)
    if (!earningsMap.has('basic') || earningsMap.get('basic') === 0) {
      return res.status(400).json({
        success: false,
        message: 'Basic salary is required in earnings and must be greater than 0'
      });
    }

    // ========== VALIDATION: Ensure deductions don't exceed earnings ==========
    
    // Calculate total earnings
    let totalEarnings = 0;
    earningsMap.forEach(value => {
      totalEarnings += (value || 0);
    });
    
    // Add overtime to earnings if provided separately
    const overtimeAmount = (overtimeHours && overtimeRate) ? overtimeHours * overtimeRate : 0;
    if (overtimeAmount > 0 && !earningsMap.has('overtime')) {
      totalEarnings += overtimeAmount;
    }
    
    // Add performance bonus if provided separately
    if (performanceBonus && performanceBonus > 0 && !earningsMap.has('performanceBonus')) {
      totalEarnings += parseFloat(performanceBonus);
    }
    
    // Add incentives if provided separately
    if (incentives && incentives > 0 && !earningsMap.has('incentives')) {
      totalEarnings += parseFloat(incentives);
    }
    
    // Calculate total deductions
    let totalDeductions = 0;
    deductionsMap.forEach(value => {
      totalDeductions += (value || 0);
    });
    
    // Add advance deductions if provided
    if (advanceDeductions && advanceDeductions > 0) {
      totalDeductions += parseFloat(advanceDeductions);
    }
    
    // VALIDATION 1: Total deductions cannot exceed total earnings
    if (totalDeductions > totalEarnings) {
      return res.status(400).json({
        success: false,
        message: 'Total deductions cannot exceed total earnings',
        details: {
          totalEarnings,
          totalDeductions,
          excess: totalDeductions - totalEarnings
        }
      });
    }
    
    // VALIDATION 2: Individual deduction validation (if needed for specific deductions)
    const basicSalary = earningsMap.get('basic') || 0;
    
    // PF deduction should not exceed statutory limits (example: 12% of basic, max 1800)
    if (deductionsMap.has('pf')) {
      const pfAmount = deductionsMap.get('pf') || 0;
      const maxPf = Math.min(basicSalary * 0.12, 1800); // Example: 12% of basic or 1800 cap
      
      if (pfAmount > maxPf) {
        return res.status(400).json({
          success: false,
          message: 'PF deduction exceeds allowable limit',
          details: {
            provided: pfAmount,
            maximumAllowed: maxPf,
            suggestion: `PF should not exceed ${maxPf} (12% of basic or ₹1800 cap)`
          }
        });
      }
    }
    
    // ESI deduction validation (example: 0.75% of gross, subject to limit)
    if (deductionsMap.has('esi')) {
      const esiAmount = deductionsMap.get('esi') || 0;
      const maxEsi = totalEarnings * 0.0075; // 0.75% of gross
      
      if (esiAmount > maxEsi) {
        return res.status(400).json({
          success: false,
          message: 'ESI deduction exceeds allowable limit',
          details: {
            provided: esiAmount,
            maximumAllowed: maxEsi.toFixed(2),
            suggestion: `ESI should not exceed ${maxEsi.toFixed(2)} (0.75% of gross earnings)`
          }
        });
      }
    }
    
    // Professional tax validation (state-specific limits)
    if (deductionsMap.has('professionalTax')) {
      const ptAmount = deductionsMap.get('professionalTax') || 0;
      const maxPt = 200; // Example: ₹200 per month (varies by state)
      
      if (ptAmount > maxPt) {
        return res.status(400).json({
          success: false,
          message: 'Professional Tax exceeds allowable limit',
          details: {
            provided: ptAmount,
            maximumAllowed: maxPt,
            suggestion: `Professional Tax should not exceed ₹${maxPt} per month`
          }
        });
      }
    }
    
    // TDS validation - cannot exceed net pay (but we don't know net pay yet)
    // We'll do a basic check that TDS isn't unreasonably high
    if (deductionsMap.has('tds')) {
      const tdsAmount = deductionsMap.get('tds') || 0;
      
      if (tdsAmount > totalEarnings * 0.3) { // TDS shouldn't exceed 30% of earnings
        return res.status(400).json({
          success: false,
          message: 'TDS amount seems unusually high',
          details: {
            provided: tdsAmount,
            percentageOfEarnings: ((tdsAmount / totalEarnings) * 100).toFixed(2) + '%',
            suggestion: 'Please verify TDS amount'
          }
        });
      }
    }
    
    // VALIDATION 3: Net pay should be positive (after considering reimbursements)
    // We'll calculate approximate net pay
    const totalReimbursements = Array.from(reimbursementsMap.values()).reduce((sum, val) => sum + (val || 0), 0);
    const approximateNetPay = (totalEarnings + totalReimbursements) - totalDeductions;
    
    if (approximateNetPay < 0) {
      return res.status(400).json({
        success: false,
        message: 'Net pay cannot be negative',
        details: {
          totalEarnings,
          totalReimbursements,
          totalDeductions,
          calculatedNetPay: approximateNetPay,
          suggestion: 'Reduce deductions or increase earnings/reimbursements'
        }
      });
    }
    
    // VALIDATION 4: Individual deduction amounts should be positive
    const negativeDeductions = [];
    deductionsMap.forEach((value, key) => {
      if (value < 0) negativeDeductions.push(key);
    });
    
    if (negativeDeductions.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Deduction amounts cannot be negative',
        details: {
          negativeFields: negativeDeductions
        }
      });
    }

    // Create salary record
    const salaryData = {
      employee,
      payrollPeriod: {
        month: parseInt(payrollPeriod.month),
        year: parseInt(payrollPeriod.year)
      },
      earnings: earningsMap,
      reimbursements: reimbursementsMap,  // NEW: include reimbursements
      deductions: deductionsMap,
      calculationRules: calculationRulesMap,
      workingDays: parseInt(workingDays) || 26,
      paidDays: parseInt(paidDays) || 26,
      leaveDays: parseInt(leaveDays) || 0,
      lopDays: parseInt(lopDays) || 0,
      overtimeHours: overtimeHours ? parseFloat(overtimeHours) : 0,
      overtimeRate: overtimeRate ? parseFloat(overtimeRate) : 0,
      performanceBonus: performanceBonus ? parseFloat(performanceBonus) : 0,
      incentives: incentives ? parseFloat(incentives) : 0,
      advanceDeductions: advanceDeductions ? parseFloat(advanceDeductions) : 0,
      paymentMode,
      employmentType: employeeRecord.EmploymentType,
      remarks: remarks || '',
      paymentStatus: 'PENDING',
      createdBy: req.user._id
    };

    const salary = new Salary(salaryData);
    await salary.save();

    const populatedSalary = await Salary.findById(salary._id)
      .populate({
        path: 'employee',
        select: 'EmployeeID FirstName LastName Email DepartmentID DesignationID',
        populate: [
          { path: 'DepartmentID', select: 'DepartmentName' },
          { path: 'DesignationID', select: 'DesignationName' }
        ]
      })
      .populate('createdBy', 'FirstName LastName Email');

    res.status(201).json({
      success: true,
      message: 'Salary record created successfully',
      data: populatedSalary
    });
  } catch (error) {
    console.error('Create salary error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: messages
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate salary entry for this employee and period'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
}
  
 /**
 * Update salary record (MANUAL ENTRY UPDATE)
 * PUT /api/salaries/:id
 */
async updateSalary(req, res) {
  try {
    const salary = await Salary.findById(req.params.id);

    if (!salary) {
      return res.status(404).json({
        success: false,
        message: 'Salary record not found'
      });
    }

    // Prevent updating if locked or paid
    if (salary.isLocked) {
      return res.status(400).json({
        success: false,
        message: 'Salary record is locked and cannot be modified'
      });
    }

    if (salary.paymentStatus === 'PAID') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update paid salary record'
      });
    }

    if (salary.paymentStatus === 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update approved salary record. Please contact approver to unlock.'
      });
    }

    const updateData = req.body;

    // Don't allow changing employee or payroll period
    if (updateData.employee && updateData.employee !== salary.employee.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change employee for existing salary record'
      });
    }

    if (updateData.payrollPeriod) {
      if (updateData.payrollPeriod.month && updateData.payrollPeriod.month !== salary.payrollPeriod.month) {
        return res.status(400).json({
          success: false,
          message: 'Cannot change payroll month for existing salary record'
        });
      }
      if (updateData.payrollPeriod.year && updateData.payrollPeriod.year !== salary.payrollPeriod.year) {
        return res.status(400).json({
          success: false,
          message: 'Cannot change payroll year for existing salary record'
        });
      }
    }

    // Update earnings if provided (merge with existing)
    if (updateData.earnings && typeof updateData.earnings === 'object') {
      Object.entries(updateData.earnings).forEach(([key, value]) => {
        if (value !== undefined && value !== null && !isNaN(parseFloat(value))) {
          salary.earnings.set(key, Number(value));
        }
      });
    }

    // NEW: Update reimbursements if provided
    if (updateData.reimbursements && typeof updateData.reimbursements === 'object') {
      Object.entries(updateData.reimbursements).forEach(([key, value]) => {
        if (value !== undefined && value !== null && !isNaN(parseFloat(value))) {
          salary.reimbursements.set(key, Number(value));
        }
      });
    }

    // Update deductions if provided (merge with existing)
    if (updateData.deductions && typeof updateData.deductions === 'object') {
      Object.entries(updateData.deductions).forEach(([key, value]) => {
        if (value !== undefined && value !== null && !isNaN(parseFloat(value))) {
          salary.deductions.set(key, Number(value));
        }
      });
    }

    // Update calculation rules if provided (merge with existing)
    if (updateData.calculationRules && typeof updateData.calculationRules === 'object') {
      Object.entries(updateData.calculationRules).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          salary.calculationRules.set(key, value);
        }
      });
    }

    // Update other numeric fields
    const numericFields = [
      'workingDays', 'paidDays', 'leaveDays', 'lopDays',
      'overtimeHours', 'overtimeRate', 'performanceBonus',
      'incentives', 'advanceDeductions'
    ];

    numericFields.forEach(field => {
      if (updateData[field] !== undefined) {
        salary[field] = parseFloat(updateData[field]) || 0;
      }
    });

    // ========== VALIDATION: Ensure deductions don't exceed earnings ==========
    
    // Calculate total earnings from the updated Map
    let totalEarnings = 0;
    salary.earnings.forEach(value => {
      totalEarnings += (value || 0);
    });
    
    // Add overtime to earnings if provided
    const overtimeAmount = (salary.overtimeHours && salary.overtimeRate) ? 
      salary.overtimeHours * salary.overtimeRate : 0;
    if (overtimeAmount > 0 && !salary.earnings.has('overtime')) {
      totalEarnings += overtimeAmount;
    }
    
    // Add performance bonus if provided
    if (salary.performanceBonus && salary.performanceBonus > 0 && !salary.earnings.has('performanceBonus')) {
      totalEarnings += salary.performanceBonus;
    }
    
    // Add incentives if provided
    if (salary.incentives && salary.incentives > 0 && !salary.earnings.has('incentives')) {
      totalEarnings += salary.incentives;
    }
    
    // Calculate total deductions from the updated Map
    let totalDeductions = 0;
    salary.deductions.forEach(value => {
      totalDeductions += (value || 0);
    });
    
    // Add advance deductions if provided
    if (salary.advanceDeductions && salary.advanceDeductions > 0) {
      totalDeductions += salary.advanceDeductions;
    }
    
    // VALIDATION 1: Total deductions cannot exceed total earnings
    if (totalDeductions > totalEarnings) {
      return res.status(400).json({
        success: false,
        message: 'Total deductions cannot exceed total earnings',
        details: {
          totalEarnings,
          totalDeductions,
          excess: totalDeductions - totalEarnings
        }
      });
    }
    
    // VALIDATION 2: Individual deduction validation
    const basicSalary = salary.earnings.get('basic') || 0;
    
    // PF deduction should not exceed statutory limits
    if (salary.deductions.has('pf')) {
      const pfAmount = salary.deductions.get('pf') || 0;
      const maxPf = Math.min(basicSalary * 0.12, 1800); // 12% of basic or 1800 cap
      
      if (pfAmount > maxPf) {
        return res.status(400).json({
          success: false,
          message: 'PF deduction exceeds allowable limit',
          details: {
            provided: pfAmount,
            maximumAllowed: maxPf,
            suggestion: `PF should not exceed ${maxPf} (12% of basic or ₹1800 cap)`
          }
        });
      }
    }
    
    // ESI deduction validation
    if (salary.deductions.has('esi')) {
      const esiAmount = salary.deductions.get('esi') || 0;
      const maxEsi = totalEarnings * 0.0075; // 0.75% of gross
      
      if (esiAmount > maxEsi) {
        return res.status(400).json({
          success: false,
          message: 'ESI deduction exceeds allowable limit',
          details: {
            provided: esiAmount,
            maximumAllowed: maxEsi.toFixed(2),
            suggestion: `ESI should not exceed ${maxEsi.toFixed(2)} (0.75% of gross earnings)`
          }
        });
      }
    }
    
    // Professional tax validation
    if (salary.deductions.has('professionalTax')) {
      const ptAmount = salary.deductions.get('professionalTax') || 0;
      const maxPt = 200; // Example: ₹200 per month
      
      if (ptAmount > maxPt) {
        return res.status(400).json({
          success: false,
          message: 'Professional Tax exceeds allowable limit',
          details: {
            provided: ptAmount,
            maximumAllowed: maxPt,
            suggestion: `Professional Tax should not exceed ₹${maxPt} per month`
          }
        });
      }
    }
    
    // TDS validation
    if (salary.deductions.has('tds')) {
      const tdsAmount = salary.deductions.get('tds') || 0;
      
      if (tdsAmount > totalEarnings * 0.3) { // TDS shouldn't exceed 30% of earnings
        return res.status(400).json({
          success: false,
          message: 'TDS amount seems unusually high',
          details: {
            provided: tdsAmount,
            percentageOfEarnings: ((tdsAmount / totalEarnings) * 100).toFixed(2) + '%',
            suggestion: 'Please verify TDS amount'
          }
        });
      }
    }
    
    // VALIDATION 3: Net pay should be positive
    const totalReimbursements = Array.from(salary.reimbursements.values()).reduce((sum, val) => sum + (val || 0), 0);
    const approximateNetPay = (totalEarnings + totalReimbursements) - totalDeductions;
    
    if (approximateNetPay < 0) {
      return res.status(400).json({
        success: false,
        message: 'Net pay cannot be negative',
        details: {
          totalEarnings,
          totalReimbursements,
          totalDeductions,
          calculatedNetPay: approximateNetPay,
          suggestion: 'Reduce deductions or increase earnings/reimbursements'
        }
      });
    }
    
    // VALIDATION 4: Individual deduction amounts should be positive
    const negativeDeductions = [];
    salary.deductions.forEach((value, key) => {
      if (value < 0) negativeDeductions.push(key);
    });
    
    if (negativeDeductions.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Deduction amounts cannot be negative',
        details: {
          negativeFields: negativeDeductions
        }
      });
    }

    // Update other fields
    const stringFields = [
      'paymentMode', 'transactionId', 'chequeNumber', 'remarks', 'paymentStatus'
    ];

    stringFields.forEach(field => {
      if (updateData[field] !== undefined) {
        salary[field] = updateData[field];
      }
    });

    salary.updatedBy = req.user._id;
    salary.version += 1;
    
    // Recalculate totals (triggered by pre-save middleware)
    await salary.save();

    const populatedSalary = await Salary.findById(salary._id)
      .populate({
        path: 'employee',
        select: 'EmployeeID FirstName LastName Email DepartmentID DesignationID',
        populate: [
          { path: 'DepartmentID', select: 'DepartmentName' },
          { path: 'DesignationID', select: 'DesignationName' }
        ]
      })
      .populate('createdBy', 'FirstName LastName Email')
      .populate('updatedBy', 'FirstName LastName Email');

    res.status(200).json({
      success: true,
      message: 'Salary updated successfully',
      data: populatedSalary
    });
  } catch (error) {
    console.error('Update salary error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
}
  /**
   * Delete salary record
   * DELETE /api/salaries/:id
   */
  async deleteSalary(req, res) {
    try {
      const salary = await Salary.findById(req.params.id);

      if (!salary) {
        return res.status(404).json({
          success: false,
          message: 'Salary record not found'
        });
      }

      // Prevent deletion if locked or paid
      if (salary.isLocked) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete locked salary record'
        });
      }

      if (salary.paymentStatus === 'PAID') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete paid salary record'
        });
      }

      if (salary.paymentStatus === 'APPROVED') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete approved salary record'
        });
      }

      await salary.deleteOne();

      res.status(200).json({
        success: true,
        message: 'Salary record deleted successfully'
      });
    } catch (error) {
      console.error('Delete salary error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }
  
  /**
   * Bulk manual payroll entry
   * POST /api/salaries/bulk-manual
   */
  async bulkManualPayroll(req, res) {
    try {
      const {
        month,
        year,
        employeeIds,
        commonEarnings = {},
        commonReimbursements = {},  // NEW: common reimbursements
        commonDeductions = {},
        commonCalculationRules = {},
        workingDays = 26,
        paidDays = 26
      } = req.body;

      if (!month || !year || !employeeIds || !Array.isArray(employeeIds)) {
        return res.status(400).json({
          success: false,
          message: 'Month, year, and employeeIds array are required'
        });
      }

      if (employeeIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one employee ID is required'
        });
      }

      const processedSalaries = [];
      const errors = [];
      const skippedEmployees = [];

      // Process each employee sequentially
      for (const employeeId of employeeIds) {
        try {
          // Check if salary already exists
          const existingSalary = await Salary.findOne({
            employee: employeeId,
            'payrollPeriod.month': parseInt(month),
            'payrollPeriod.year': parseInt(year)
          });

          if (existingSalary) {
            skippedEmployees.push({
              employeeId,
              reason: `Salary already exists for ${month}/${year}`
            });
            continue;
          }

          // Get employee details
          const employee = await Employee.findById(employeeId);
          if (!employee) {
            errors.push(`Employee ${employeeId} not found`);
            continue;
          }

          if (employee.EmploymentStatus !== 'active') {
            errors.push(`Employee ${employee.EmployeeID || employeeId} is inactive`);
            continue;
          }

          // Create earnings Map with common values
          const earningsMap = new Map();
          Object.entries(commonEarnings).forEach(([key, value]) => {
            if (value !== undefined && value !== null && !isNaN(parseFloat(value))) {
              earningsMap.set(key, Number(value));
            }
          });

          // NEW: Create reimbursements Map
          const reimbursementsMap = new Map();
          Object.entries(commonReimbursements).forEach(([key, value]) => {
            if (value !== undefined && value !== null && !isNaN(parseFloat(value))) {
              reimbursementsMap.set(key, Number(value));
            }
          });

          // Create deductions Map
          const deductionsMap = new Map();
          Object.entries(commonDeductions).forEach(([key, value]) => {
            if (value !== undefined && value !== null && !isNaN(parseFloat(value))) {
              deductionsMap.set(key, Number(value));
            }
          });

          // Create calculation rules Map
          const calculationRulesMap = new Map();
          Object.entries(commonCalculationRules).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              calculationRulesMap.set(key, value);
            }
          });

          // Ensure basic salary exists
          if (!earningsMap.has('basic') || earningsMap.get('basic') === 0) {
            errors.push(`Basic salary not provided for employee ${employee.EmployeeID || employeeId}`);
            continue;
          }

          // Create salary record
          const salaryData = {
            employee: employeeId,
            payrollPeriod: {
              month: parseInt(month),
              year: parseInt(year)
            },
            earnings: earningsMap,
            reimbursements: reimbursementsMap,  // NEW
            deductions: deductionsMap,
            calculationRules: calculationRulesMap,
            workingDays: parseInt(workingDays) || 26,
            paidDays: parseInt(paidDays) || 26,
            paymentStatus: 'PENDING',
            employmentType: employee.EmploymentType,
            remarks: 'Bulk manual payroll entry',
            createdBy: req.user._id
          };

          const salary = new Salary(salaryData);
          await salary.save();
          
          processedSalaries.push({
            id: salary._id,
            employeeId,
            employeeName: `${employee.FirstName} ${employee.LastName}`,
            employeeCode: employee.EmployeeID,
            grossSalary: salary.grossSalary,
            totalReimbursements: salary.totalReimbursements,
            totalDeductions: salary.totalDeductions,
            netPay: salary.netPay
          });
        } catch (error) {
          console.error(`Error processing employee ${employeeId}:`, error);
          errors.push(`Error processing employee ${employeeId}: ${error.message}`);
        }
      }

      // Check if any processing actually happened
      if (processedSalaries.length === 0 && errors.length === 0 && skippedEmployees.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No salaries were processed. Please check employee IDs and ensure employees exist.'
        });
      }

      const totalGross = processedSalaries.reduce((sum, s) => sum + (s.grossSalary || 0), 0);
      const totalReimbursements = processedSalaries.reduce((sum, s) => sum + (s.totalReimbursements || 0), 0);
      const totalDeductions = processedSalaries.reduce((sum, s) => sum + (s.totalDeductions || 0), 0);
      const totalNetPay = processedSalaries.reduce((sum, s) => sum + (s.netPay || 0), 0);

      res.status(200).json({
        success: true,
        message: `Payroll processed. Success: ${processedSalaries.length}, Skipped: ${skippedEmployees.length}, Errors: ${errors.length}`,
        summary: {
          processedCount: processedSalaries.length,
          skippedCount: skippedEmployees.length,
          errorCount: errors.length,
          totalGross,
          totalReimbursements,
          totalDeductions,
          totalNetPay
        },
        processedSalaries,
        skippedEmployees: skippedEmployees.length > 0 ? skippedEmployees : undefined,
        errors: errors.length > 0 ? errors : undefined
      });
      
    } catch (error) {
      console.error('Bulk manual payroll error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
  
  // ==================== SALARY QUERIES ====================
  
  /**
   * Get all salaries with filters
   * GET /api/salaries
   */
  async getAllSalaries(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        month,
        year,
        employeeId,
        departmentId,
        designationId,
        paymentStatus,
        employmentType,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const query = {};

      // Filter by payroll period
      if (month && year) {
        query['payrollPeriod.month'] = parseInt(month);
        query['payrollPeriod.year'] = parseInt(year);
      } else if (year) {
        query['payrollPeriod.year'] = parseInt(year);
      } else if (month) {
        query['payrollPeriod.month'] = parseInt(month);
      }

      // Filter by employee
      if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
        query.employee = employeeId;
      }

      // Filter by department
      if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
        const employees = await Employee.find({ DepartmentID: departmentId }).select('_id');
        if (employees.length > 0) {
          query.employee = { $in: employees.map(emp => emp._id) };
        } else {
          // No employees in this department, return empty result
          return res.status(200).json({
            success: true,
            count: 0,
            total: 0,
            totalPages: 0,
            currentPage: parseInt(page),
            data: []
          });
        }
      }

      // Filter by designation
      if (designationId && mongoose.Types.ObjectId.isValid(designationId)) {
        const employees = await Employee.find({ DesignationID: designationId }).select('_id');
        if (employees.length > 0) {
          // If department filter already exists, combine with $and
          if (query.employee) {
            query.$and = [
              { employee: query.employee },
              { employee: { $in: employees.map(emp => emp._id) } }
            ];
            delete query.employee;
          } else {
            query.employee = { $in: employees.map(emp => emp._id) };
          }
        } else {
          return res.status(200).json({
            success: true,
            count: 0,
            total: 0,
            totalPages: 0,
            currentPage: parseInt(page),
            data: []
          });
        }
      }

      if (paymentStatus) query.paymentStatus = paymentStatus;
      if (employmentType) query.employmentType = employmentType;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const salaries = await Salary.find(query)
        .populate({
          path: 'employee',
          select: 'EmployeeID FirstName LastName Email DepartmentID DesignationID',
          populate: [
            { path: 'DepartmentID', select: 'DepartmentName' },
            { path: 'DesignationID', select: 'DesignationName Level' }
          ]
        })
        .populate('approvedBy', 'FirstName LastName Email')
        .populate('createdBy', 'FirstName LastName Email')
        .sort(sort)
        .limit(parseInt(limit))
        .skip(skip);

      const total = await Salary.countDocuments(query);

      res.status(200).json({
        success: true,
        count: salaries.length,
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        data: salaries
      });
    } catch (error) {
      console.error('Get all salaries error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }
  
/**
 * Get salary by ID (For Admin/HR - no employee restriction)
 * GET /api/salaries/:id
 */
async getSalaryById(req, res) {
  try {
    const salary = await Salary.findById(req.params.id)
      .populate({
        path: 'employee',
        select: 'EmployeeID FirstName LastName Email Phone DateOfJoining BankDetails DepartmentID DesignationID',
        populate: [
          { path: 'DepartmentID', select: 'DepartmentName' },
          { path: 'DesignationID', select: 'DesignationName Level SalaryGrade' }
        ]
      })
      .populate('approvedBy', 'FirstName LastName Email Position')
      .populate('verifiedBy', 'FirstName LastName Email Position')
      .populate('createdBy', 'FirstName LastName Email')
      .populate('updatedBy', 'FirstName LastName Email');

    if (!salary) {
      return res.status(404).json({
        success: false,
        message: 'Salary record not found'
      });
    }

    // Convert Maps to objects for easier consumption
    const salaryObj = salary.toJSON();
    
    res.status(200).json({
      success: true,
      data: salaryObj
    });
  } catch (error) {
    console.error('Get salary by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
}
  /**
   * Employee gets their own salaries
   * GET /api/salaries/my-salaries
   */
  async getMySalaries(req, res) {
    try {
      const employeeId = req.user.EmployeeID?._id;
      
      if (!employeeId) {
        return res.status(400).json({
          success: false,
          message: 'No employee profile associated with this user'
        });
      }

      const { page = 1, limit = 12, year, month, status } = req.query;
      const query = { employee: employeeId };

      if (year) query['payrollPeriod.year'] = parseInt(year);
      if (month) query['payrollPeriod.month'] = parseInt(month);
      if (status) query.paymentStatus = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const salaries = await Salary.find(query)
        .select('-__v -createdBy -updatedBy -isLocked -calculationRules')
        .populate('employee', 'EmployeeID FirstName LastName DepartmentID DesignationID')
        .sort({ 'payrollPeriod.year': -1, 'payrollPeriod.month': -1 })
        .limit(parseInt(limit))
        .skip(skip);

      const total = await Salary.countDocuments(query);

      res.status(200).json({
        success: true,
        count: salaries.length,
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        data: salaries
      });
    } catch (error) {
      console.error('Get my salaries error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }
  
  /**
   * Employee gets specific salary slip
   * GET /api/salaries/my-salaries/:id
   */
  async getMySalaryById(req, res) {
    try {
      const employeeId = req.user.EmployeeID?._id;
      
      if (!employeeId) {
        return res.status(400).json({
          success: false,
          message: 'No employee profile associated with this user'
        });
      }

      const salary = await Salary.findOne({
        _id: req.params.id,
        employee: employeeId
      })
      .populate({
        path: 'employee',
        select: 'EmployeeID FirstName LastName DepartmentID DesignationID DateOfJoining BankDetails',
        populate: [
          { path: 'DepartmentID', select: 'DepartmentName' },
          { path: 'DesignationID', select: 'DesignationName Level' }
        ]
      })
      .populate('approvedBy', 'FirstName LastName Email')
      .populate('verifiedBy', 'FirstName LastName Email');

      if (!salary) {
        return res.status(404).json({
          success: false,
          message: 'Salary slip not found or access denied'
        });
      }

      // Convert to JSON to transform Maps
      const salaryObj = salary.toJSON();

      res.status(200).json({
        success: true,
        data: salaryObj
      });
    } catch (error) {
      console.error('Get my salary by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }
  
  /**
   * Search salaries
   * GET /api/salaries/search
   */
  async searchSalaries(req, res) {
    try {
      const { q, page = 1, limit = 20 } = req.query;

      if (!q) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Search in employee names and IDs
      const employees = await Employee.find({
        $or: [
          { FirstName: { $regex: q, $options: 'i' } },
          { LastName: { $regex: q, $options: 'i' } },
          { EmployeeID: { $regex: q, $options: 'i' } },
          { Email: { $regex: q, $options: 'i' } }
        ]
      }).select('_id');

      const employeeIds = employees.map(emp => emp._id);

      const query = {
        $or: [
          { employee: { $in: employeeIds } },
          { transactionId: { $regex: q, $options: 'i' } },
          { chequeNumber: { $regex: q, $options: 'i' } },
          { remarks: { $regex: q, $options: 'i' } }
        ]
      };

      const salaries = await Salary.find(query)
        .populate({
          path: 'employee',
          select: 'EmployeeID FirstName LastName Email DepartmentID DesignationID',
          populate: [
            { path: 'DepartmentID', select: 'DepartmentName' },
            { path: 'DesignationID', select: 'DesignationName' }
          ]
        })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip);

      const total = await Salary.countDocuments(query);

      res.status(200).json({
        success: true,
        count: salaries.length,
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        data: salaries
      });
    } catch (error) {
      console.error('Search salaries error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }

  // ==================== SALARY ACTIONS ====================
  
  /**
   * Approve salary
   * PUT /api/salaries/:id/approve
   */
  async approveSalary(req, res) {
    try {
      const salary = await Salary.findById(req.params.id);

      if (!salary) {
        return res.status(404).json({
          success: false,
          message: 'Salary record not found'
        });
      }

      if (salary.paymentStatus === 'PAID') {
        return res.status(400).json({
          success: false,
          message: 'Cannot approve paid salary'
        });
      }

      if (salary.paymentStatus === 'APPROVED') {
        return res.status(400).json({
          success: false,
          message: 'Salary already approved'
        });
      }

      await salary.approve(req.user._id);

      res.status(200).json({
        success: true,
        message: 'Salary approved successfully',
        data: salary
      });
    } catch (error) {
      console.error('Approve salary error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }

  /**
   * Mark salary as paid
   * PUT /api/salaries/:id/mark-paid
   */
  async markAsPaid(req, res) {
    try {
      const { paymentMode, transactionId, chequeNumber, paymentDate } = req.body;

      const salary = await Salary.findById(req.params.id);

      if (!salary) {
        return res.status(404).json({
          success: false,
          message: 'Salary record not found'
        });
      }

      if (salary.paymentStatus === 'PAID') {
        return res.status(400).json({
          success: false,
          message: 'Salary already marked as paid'
        });
      }

      const paymentDetails = {
        paymentMode: paymentMode || salary.paymentMode,
        transactionId,
        chequeNumber,
        paymentDate: paymentDate || new Date()
      };

      await salary.markAsPaid(paymentDetails, req.user._id);

      res.status(200).json({
        success: true,
        message: 'Salary marked as paid successfully',
        data: salary
      });
    } catch (error) {
      console.error('Mark as paid error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }

  /**
   * Lock salary (prevent further edits)
   * PUT /api/salaries/:id/lock
   */
  async lockSalary(req, res) {
    try {
      const salary = await Salary.findById(req.params.id);

      if (!salary) {
        return res.status(404).json({
          success: false,
          message: 'Salary record not found'
        });
      }

      if (salary.isLocked) {
        return res.status(400).json({
          success: false,
          message: 'Salary already locked'
        });
      }

      await salary.lock(req.user._id);

      res.status(200).json({
        success: true,
        message: 'Salary locked successfully',
        data: salary
      });
    } catch (error) {
      console.error('Lock salary error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }

  /**
   * Unlock salary (allow edits)
   * PUT /api/salaries/:id/unlock
   */
  async unlockSalary(req, res) {
    try {
      const salary = await Salary.findById(req.params.id);

      if (!salary) {
        return res.status(404).json({
          success: false,
          message: 'Salary record not found'
        });
      }

      if (!salary.isLocked) {
        return res.status(400).json({
          success: false,
          message: 'Salary is not locked'
        });
      }

      if (salary.paymentStatus === 'PAID') {
        return res.status(400).json({
          success: false,
          message: 'Cannot unlock paid salary'
        });
      }

      await salary.unlock(req.user._id);

      res.status(200).json({
        success: true,
        message: 'Salary unlocked successfully',
        data: salary
      });
    } catch (error) {
      console.error('Unlock salary error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }

  // ==================== SUMMARY REPORTS ====================
  
  /**
   * Get payroll summary for a period
   * GET /api/salaries/summary
   */
  async getPayrollSummary(req, res) {
    try {
      const { month, year, departmentId } = req.query;

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: 'Month and year are required'
        });
      }

      const matchStage = {
        'payrollPeriod.month': parseInt(month),
        'payrollPeriod.year': parseInt(year)
      };

      // If department filter is provided
      let employeeIds = [];
      if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
        const employees = await Employee.find({ DepartmentID: departmentId }).select('_id');
        employeeIds = employees.map(emp => emp._id);
        if (employeeIds.length > 0) {
          matchStage.employee = { $in: employeeIds };
        }
      }

      const summary = await Salary.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalEmployees: { $sum: 1 },
            totalGrossSalary: { $sum: '$grossSalary' },
            totalReimbursements: { $sum: '$totalReimbursements' },
            totalDeductions: { $sum: '$totalDeductions' },
            totalNetPay: { $sum: '$netPay' },
            pendingCount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'PENDING'] }, 1, 0] }
            },
            processedCount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'PROCESSED'] }, 1, 0] }
            },
            approvedCount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'APPROVED'] }, 1, 0] }
            },
            paidCount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'PAID'] }, 1, 0] }
            },
            avgNetPay: { $avg: '$netPay' },
            maxNetPay: { $max: '$netPay' },
            minNetPay: { $min: '$netPay' }
          }
        },
        {
          $project: {
            _id: 0,
            period: { month: parseInt(month), year: parseInt(year) },
            totalEmployees: 1,
            totalGrossSalary: { $round: ['$totalGrossSalary', 2] },
            totalReimbursements: { $round: ['$totalReimbursements', 2] },
            totalDeductions: { $round: ['$totalDeductions', 2] },
            totalNetPay: { $round: ['$totalNetPay', 2] },
            statusBreakdown: {
              pending: '$pendingCount',
              processed: '$processedCount',
              approved: '$approvedCount',
              paid: '$paidCount'
            },
            statistics: {
              averageNetPay: { $round: ['$avgNetPay', 2] },
              maxNetPay: { $round: ['$maxNetPay', 2] },
              minNetPay: { $round: ['$minNetPay', 2] }
            }
          }
        }
      ]);

      // If no data, return empty summary
      if (summary.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            period: { month: parseInt(month), year: parseInt(year) },
            totalEmployees: 0,
            totalGrossSalary: 0,
            totalReimbursements: 0,
            totalDeductions: 0,
            totalNetPay: 0,
            statusBreakdown: {
              pending: 0,
              processed: 0,
              approved: 0,
              paid: 0
            },
            statistics: {
              averageNetPay: 0,
              maxNetPay: 0,
              minNetPay: 0
            }
          }
        });
      }

      res.status(200).json({
        success: true,
        data: summary[0]
      });
    } catch (error) {
      console.error('Payroll summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }

  /**
   * Get department-wise payroll summary
   * GET /api/salaries/department-summary
   */
  async getDepartmentWiseSummary(req, res) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: 'Month and year are required'
        });
      }

      const summary = await Salary.aggregate([
        {
          $match: {
            'payrollPeriod.month': parseInt(month),
            'payrollPeriod.year': parseInt(year)
          }
        },
        {
          $lookup: {
            from: 'employees',
            localField: 'employee',
            foreignField: '_id',
            as: 'employeeInfo'
          }
        },
        { $unwind: '$employeeInfo' },
        {
          $lookup: {
            from: 'departments',
            localField: 'employeeInfo.DepartmentID',
            foreignField: '_id',
            as: 'department'
          }
        },
        { $unwind: '$department' },
        {
          $group: {
            _id: '$department._id',
            departmentName: { $first: '$department.DepartmentName' },
            employeeCount: { $sum: 1 },
            totalGrossSalary: { $sum: '$grossSalary' },
            totalReimbursements: { $sum: '$totalReimbursements' },
            totalDeductions: { $sum: '$totalDeductions' },
            totalNetPay: { $sum: '$netPay' },
            paidCount: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'PAID'] }, 1, 0] }
            }
          }
        },
        {
          $project: {
            _id: 1,
            departmentName: 1,
            employeeCount: 1,
            totalGrossSalary: { $round: ['$totalGrossSalary', 2] },
            totalReimbursements: { $round: ['$totalReimbursements', 2] },
            totalDeductions: { $round: ['$totalDeductions', 2] },
            totalNetPay: { $round: ['$totalNetPay', 2] },
            paidCount: 1,
            pendingCount: { $subtract: ['$employeeCount', '$paidCount'] }
          }
        },
        { $sort: { departmentName: 1 } }
      ]);

      res.status(200).json({
        success: true,
        count: summary.length,
        data: summary
      });
    } catch (error) {
      console.error('Department summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Server Error',
        error: error.message
      });
    }
  }
}

module.exports = new SalaryController();