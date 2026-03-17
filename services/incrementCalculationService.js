const Employee = require('../models/HR/Employee');
const PieceRateMaster = require('../models/HR/PieceRateMaster');
const IncrementPolicy = require('../models/HR/IncrementPolicy');
const behaviorScoreService = require('./behaviorScoreService');

class IncrementCalculationService {
  
  /**
   * Calculate increment for a single employee
   */
  async calculateEmployeeIncrement(employeeId, year, policyId = null, options = {}) {
    try {
      // Get employee
      const employee = await Employee.findById(employeeId)
        .populate('DepartmentID')
        .populate('DesignationID');
      
      if (!employee) {
        throw new Error('Employee not found');
      }
      
      // Skip if probation (optional)
      if (options.skipProbation && this.isOnProbation(employee)) {
        return {
          employeeId,
          skipped: true,
          reason: 'Employee on probation'
        };
      }
      
      // Skip if inactive
      if (employee.EmploymentStatus !== 'active') {
        return {
          employeeId,
          skipped: true,
          reason: `Employee status: ${employee.EmploymentStatus}`
        };
      }
      
      // Get behavior score
      const behaviorResult = await behaviorScoreService.calculateYearlyScore(
        employeeId, year, policyId
      );
      
      // Get policy
      const policy = policyId ? 
        await IncrementPolicy.findById(policyId) :
        await IncrementPolicy.findOne({ year, status: 'ACTIVE' });
      
      if (!policy) {
        throw new Error(`No active increment policy found for year ${year}`);
      }
      
      // Find matching increment rule
      let incrementPercent = 0;
      let behaviorCategory = 'Average';
      
      for (const rule of policy.rules) {
        if (behaviorResult.score >= rule.minScore && behaviorResult.score <= rule.maxScore) {
          incrementPercent = rule.incrementPercent;
          behaviorCategory = rule.category;
          break;
        }
      }
      
      // Apply caps
      incrementPercent = Math.min(incrementPercent, policy.maxIncrementPercent);
      incrementPercent = Math.max(incrementPercent, policy.minIncrementPercent);
      
      // Check for promotion
      let isPromoted = false;
      let promotionData = null;
      
      if (options.checkPromotion && options.newDesignationId) {
        isPromoted = true;
        if (policy.promotionOverride?.enabled) {
          incrementPercent = Math.max(
            incrementPercent,
            policy.promotionOverride.minIncrementPercent
          );
        }
        
        promotionData = {
          isPromoted: true,
          oldDesignation: employee.DesignationID,
          newDesignation: options.newDesignationId
        };
      }
      
      // Calculate increment amount based on applyOn
      let incrementAmount = 0;
      let newSalary = { ...employee.toObject() };
      
      if (policy.applyOn === 'BASIC') {
        incrementAmount = (employee.BasicSalary || 0) * (incrementPercent / 100);
        newSalary.BasicSalary = (employee.BasicSalary || 0) + incrementAmount;
        
        // Recalculate HRA (assuming HRA is percentage of Basic)
        if (employee.HRA > 0 && employee.BasicSalary > 0) {
          const hraPercentage = (employee.HRA / employee.BasicSalary) * 100;
          newSalary.HRA = newSalary.BasicSalary * (hraPercentage / 100);
        }
        
        // Recalculate total fixed salary
        newSalary.TotalFixedSalary = (
          newSalary.BasicSalary +
          newSalary.HRA +
          (newSalary.ConveyanceAllowance || 0) +
          (newSalary.MedicalAllowance || 0) +
          (newSalary.SpecialAllowance || 0)
        );
      } else {
        // Apply on Gross
        const gross = employee.TotalFixedSalary || 0;
        incrementAmount = gross * (incrementPercent / 100);
        newSalary.TotalFixedSalary = gross + incrementAmount;
        
        // Distribute proportionally (simplified)
        if (employee.BasicSalary > 0) {
          const ratio = employee.BasicSalary / gross;
          newSalary.BasicSalary = employee.BasicSalary + (incrementAmount * ratio);
        }
      }
      
      // Handle piece rate employees
      let pieceRateUpdates = [];
      if (employee.EmploymentType === 'PieceRate') {
        const pieceRates = await PieceRateMaster.find({
          employee: employeeId,
          isActive: true
        });
        
        pieceRateUpdates = pieceRates.map(pr => ({
          productType: pr.productType,
          operation: pr.operation,
          oldRate: pr.ratePerUnit,
          newRate: pr.ratePerUnit * (1 + incrementPercent / 100),
          uom: pr.uom
        }));
      }
      
      return {
        employeeId,
        employee: {
          _id: employee._id,
          EmployeeID: employee.EmployeeID,
          FirstName: employee.FirstName,
          LastName: employee.LastName,
          DepartmentID: employee.DepartmentID,
          DesignationID: employee.DesignationID,
          EmploymentType: employee.EmploymentType
        },
        behaviorScore: behaviorResult.score,
        behaviorCategory,
        behaviorSummary: behaviorResult.summary,
        incrementPercent,
        incrementAmount,
        previousSalary: {
          BasicSalary: employee.BasicSalary,
          HRA: employee.HRA,
          ConveyanceAllowance: employee.ConveyanceAllowance,
          MedicalAllowance: employee.MedicalAllowance,
          SpecialAllowance: employee.SpecialAllowance,
          HourlyRate: employee.HourlyRate,
          TotalFixedSalary: employee.TotalFixedSalary
        },
        newSalary: {
          BasicSalary: newSalary.BasicSalary,
          HRA: newSalary.HRA,
          ConveyanceAllowance: newSalary.ConveyanceAllowance,
          MedicalAllowance: newSalary.MedicalAllowance,
          SpecialAllowance: newSalary.SpecialAllowance,
          HourlyRate: newSalary.HourlyRate,
          TotalFixedSalary: newSalary.TotalFixedSalary
        },
        pieceRateUpdates: pieceRateUpdates.length > 0 ? pieceRateUpdates : undefined,
        promotion: promotionData,
        effectiveFrom: policy.effectiveFrom
      };
      
    } catch (error) {
      console.error('Increment calculation error:', error);
      throw error;
    }
  }
  
  /**
   * Calculate increments for multiple employees
   */
  async calculateBatchIncrements(employeeIds, year, policyId = null, options = {}) {
    const results = [];
    
    for (const employeeId of employeeIds) {
      try {
        const result = await this.calculateEmployeeIncrement(
          employeeId, year, policyId, options
        );
        results.push(result);
      } catch (error) {
        results.push({
          employeeId,
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  /**
   * Check if employee is on probation (simplified - adjust based on your logic)
   */
  isOnProbation(employee) {
    // Example: if joined less than 6 months ago
    const joinDate = new Date(employee.DateOfJoining);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    return joinDate > sixMonthsAgo;
  }
}

module.exports = new IncrementCalculationService();