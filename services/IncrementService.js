const mongoose = require('mongoose');
const Employee = require('../models/HR/Employee');
const Salary = require('../models/HR/Salary');
const PerformanceReview = require('../models/HR/PerformanceReview');
const Increment = require('../models/HR/Increment');
const IncrementPolicy = require('../models/HR/IncrementPolicy');
const AttendanceProcessed = require('../models/HR/AttendanceProcessed');
const Production = require('../models/HR/Production');
const Accident = require('../models/HR/Accident');

class IncrementService {
  
  /**
   * Get complete increment dashboard for an employee
   */
  async getIncrementDashboard(employeeId, year = new Date().getFullYear()) {
    console.log(`\n📊 Generating increment dashboard for employee: ${employeeId}, Year: ${year}`);

    // Get employee with all details
    const employee = await Employee.findById(employeeId)
      .populate('DepartmentID')
      .populate('DesignationID');

    if (!employee) {
      throw new Error('Employee not found');
    }

    // Get current salary
    const currentSalary = await this.getCurrentSalary(employeeId);

    // Get or create performance review for the year
    let performanceReview = await PerformanceReview.findOne({
      employeeId,
      reviewYear: year
    });

    if (!performanceReview) {
      // Auto-generate performance review from existing data
      performanceReview = await this.generatePerformanceReview(employeeId, year);
    }

    // Get attendance summary
    const attendanceSummary = await this.getAttendanceSummary(employeeId, year);

    // Get increment history
    const incrementHistory = await this.getIncrementHistory(employeeId);

    // Get safety record
    const safetyRecord = await this.getSafetyRecord(employeeId, year);

    // Get active policy
    const policy = await IncrementPolicy.getActivePolicy();

    // Calculate recommended increment
    const recommendation = await this.calculateRecommendedIncrement(
      employee,
      performanceReview,
      attendanceSummary,
      safetyRecord,
      policy
    );

    // Check eligibility
    const eligibility = await this.checkEligibility(employee, performanceReview, year);

    // Build complete dashboard
    const dashboard = {
      employee: {
        id: employee._id,
        employeeId: employee.EmployeeID,
        name: `${employee.FirstName} ${employee.LastName}`,
        department: employee.DepartmentID?.DepartmentName,
        designation: employee.DesignationID?.DesignationName,
        dateOfJoining: employee.DateOfJoining,
        tenure: this.calculateTenure(employee.DateOfJoining),
        employmentType: employee.EmploymentType,
        skillLevel: employee.SkillLevel,
        status: employee.EmploymentStatus
      },

      currentSalary: {
        basic: currentSalary.basic,
        hra: currentSalary.hra,
        conveyance: currentSalary.conveyance,
        medical: currentSalary.medical,
        special: currentSalary.special,
        total: currentSalary.total,
        ctc: currentSalary.total * 12,
        monthly: currentSalary.total
      },

      performanceReview: {
        exists: !!performanceReview,
        ...performanceReview?.toObject(),
        scores: performanceReview?.calculatedScores
      },

      attendanceSummary: {
        year,
        ...attendanceSummary
      },

      incrementHistory: incrementHistory.map(inc => ({
        year: inc.incrementYear,
        date: inc.effectiveFrom,
        oldSalary: inc.previousSalary.total,
        newSalary: inc.newSalary.total,
        percentage: inc.incrementPercentage.overall,
        amount: inc.incrementAmount.monthly,
        type: inc.incrementType
      })),

      safetyRecord: {
        year,
        ...safetyRecord
      },

      eligibility,

      recommendation: {
        ...recommendation,
        suggestedRange: `${recommendation.minPercentage}% - ${recommendation.maxPercentage}%`,
        suggestedAmount: Math.round(currentSalary.total * (recommendation.suggestedPercentage / 100)),
        newSalary: currentSalary.total + Math.round(currentSalary.total * (recommendation.suggestedPercentage / 100))
      },

      policy: {
        name: policy?.name,
        effectiveFrom: policy?.effectiveFrom,
        maxIncrement: policy?.maxIncrementPercentage
      }
    };

    return dashboard;
  }

  /**
   * Generate performance review from existing data
   */
  async generatePerformanceReview(employeeId, year) {
    console.log(`Generating performance review for ${employeeId}, year ${year}`);

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    const employee = await Employee.findById(employeeId);

    // Get production data - FIXED with 'new'
    const productionData = await Production.aggregate([
      {
        $match: {
          EmployeeID: new mongoose.Types.ObjectId(employeeId),
          Date: { $gte: startDate, $lte: endDate },
          Status: { $in: ['Approved', 'Verified'] }
        }
      },
      {
        $group: {
          _id: null,
          totalUnits: { $sum: '$TotalUnits' },
          goodUnits: { $sum: '$GoodUnits' },
          rejectedUnits: { $sum: '$RejectedUnits' },
          totalAmount: { $sum: '$TotalAmount' }
        }
      }
    ]);

    // Get attendance data - FIXED with 'new'
    const attendanceData = await AttendanceProcessed.aggregate([
      {
        $match: {
          EmployeeID: new mongoose.Types.ObjectId(employeeId),
          Date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalDays: { $sum: 1 },
          presentDays: {
            $sum: { $cond: [{ $eq: ['$Status', 'Present'] }, 1, 0] }
          },
          absentDays: {
            $sum: { $cond: [{ $eq: ['$Status', 'Absent'] }, 1, 0] }
          },
          leaveDays: {
            $sum: { $cond: [{ $eq: ['$Status', 'Leave'] }, 1, 0] }
          },
          lateDays: {
            $sum: { $cond: [{ $eq: ['$AttendanceStatus', 'Late'] }, 1, 0] }
          },
          overtimeHours: { $sum: '$OvertimeHours' }
        }
      }
    ]);

    // Get safety data
    const accidentCount = await Accident.countDocuments({
      employee: employeeId,
      date: { $gte: startDate, $lte: endDate }
    });

    // Calculate metrics
    const production = productionData[0] || { totalUnits: 0, goodUnits: 0, rejectedUnits: 0 };
    const attendance = attendanceData[0] || { totalDays: 0, presentDays: 0, absentDays: 0, leaveDays: 0, lateDays: 0 };
    
    const qualityPercentage = production.totalUnits > 0 
      ? (production.goodUnits / production.totalUnits) * 100 
      : 100;

    const attendancePercentage = attendance.totalDays > 0
      ? (attendance.presentDays / attendance.totalDays) * 100
      : 0;

    // Create performance review
    const performanceReview = new PerformanceReview({
      employeeId,
      reviewYear: year,
      reviewPeriod: { from: startDate, to: endDate },
      
      managerRatings: {
        jobKnowledge: 3.5,
        qualityOfWork: 3.5,
        productivity: 3.5,
        teamwork: 3.5,
        initiative: 3.5,
        problemSolving: 3.5,
        overall: 3.5
      },

      productionMetrics: {
        totalUnits: production.totalUnits,
        goodUnits: production.goodUnits,
        rejectedUnits: production.rejectedUnits,
        qualityPercentage,
        achievementPercentage: 100,
        overtimeHours: attendance.overtimeHours || 0
      },

      attendanceMetrics: {
        workingDays: attendance.totalDays,
        presentDays: attendance.presentDays,
        absentDays: attendance.absentDays,
        leaveDays: attendance.leaveDays,
        lateDays: attendance.lateDays,
        attendancePercentage
      },

      skillMetrics: {
        currentSkillLevel: employee.SkillLevel,
        previousSkillLevel: employee.SkillLevel,
        skillUpgraded: false,
        trainingHours: 0
      },

      safetyMetrics: {
        accidentsInvolved: accidentCount,
        safetyTrainingCompleted: false,
        safetyScore: accidentCount === 0 ? 100 : 80,
        warningsIssued: 0
      },

      status: 'DRAFT',
      createdBy: new mongoose.Types.ObjectId() // FIXED with 'new'
    });

    await performanceReview.save();
    return performanceReview;
  }

  /**
   * Get current salary for employee
   */
  async getCurrentSalary(employeeId) {
    // Get latest salary record
    const latestSalary = await Salary.findOne({
      employee: employeeId
    }).sort({ 'payrollPeriod.year': -1, 'payrollPeriod.month': -1 });

    if (latestSalary) {
      return {
        basic: latestSalary.earnings.get('basic') || 0,
        hra: latestSalary.earnings.get('hra') || 0,
        conveyance: latestSalary.earnings.get('conveyance') || 0,
        medical: latestSalary.earnings.get('medical') || 0,
        special: latestSalary.earnings.get('specialAllowance') || 0,
        total: latestSalary.grossSalary || 0
      };
    }

    // Fallback to employee master
    const employee = await Employee.findById(employeeId);
    return {
      basic: employee.BasicSalary || 0,
      hra: employee.HRA || 0,
      conveyance: employee.ConveyanceAllowance || 0,
      medical: employee.MedicalAllowance || 0,
      special: employee.SpecialAllowance || 0,
      total: (employee.BasicSalary || 0) +
             (employee.HRA || 0) +
             (employee.ConveyanceAllowance || 0) +
             (employee.MedicalAllowance || 0) +
             (employee.SpecialAllowance || 0)
    };
  }

  /**
   * Get attendance summary for a year
   */
  async getAttendanceSummary(employeeId, year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    const attendance = await AttendanceProcessed.aggregate([
      {
        $match: {
          EmployeeID: new mongoose.Types.ObjectId(employeeId), // FIXED with 'new'
          Date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalDays: { $sum: 1 },
          presentDays: {
            $sum: { $cond: [{ $eq: ['$Status', 'Present'] }, 1, 0] }
          },
          absentDays: {
            $sum: { $cond: [{ $eq: ['$Status', 'Absent'] }, 1, 0] }
          },
          leaveDays: {
            $sum: { $cond: [{ $eq: ['$Status', 'Leave'] }, 1, 0] }
          },
          holidayDays: {
            $sum: { $cond: [{ $eq: ['$Status', 'Holiday'] }, 1, 0] }
          },
          halfDays: {
            $sum: { $cond: [{ $eq: ['$Status', 'Half-Day'] }, 1, 0] }
          },
          lateDays: {
            $sum: { $cond: [{ $eq: ['$AttendanceStatus', 'Late'] }, 1, 0] }
          },
          overtimeHours: { $sum: '$OvertimeHours' }
        }
      }
    ]);

    const result = attendance[0] || {
      totalDays: 0,
      presentDays: 0,
      absentDays: 0,
      leaveDays: 0,
      holidayDays: 0,
      halfDays: 0,
      lateDays: 0,
      overtimeHours: 0
    };

    result.attendancePercentage = result.totalDays > 0
      ? Math.round((result.presentDays / result.totalDays) * 100 * 10) / 10
      : 0;

    return result;
  }

  /**
   * Get increment history
   */
  async getIncrementHistory(employeeId) {
    return await Increment.find({
      employeeId,
      'workflow.status': 'APPROVED'
    })
    .sort({ effectiveFrom: -1 })
    .limit(5);
  }

  /**
   * Get safety record for a year
   */
  async getSafetyRecord(employeeId, year) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    const accidentCount = await Accident.countDocuments({
      employee: employeeId,
      date: { $gte: startDate, $lte: endDate }
    });

    const accidents = await Accident.find({
      employee: employeeId,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: -1 });

    return {
      accidentCount,
      accidents,
      hasAccidents: accidentCount > 0,
      safetyScore: accidentCount === 0 ? 100 : Math.max(0, 100 - (accidentCount * 20))
    };
  }

  /**
   * Calculate recommended increment
   */
  async calculateRecommendedIncrement(employee, performanceReview, attendance, safety, policy) {
    if (!policy) {
      return {
        suggestedPercentage: 0,
        minPercentage: 0,
        maxPercentage: 0,
        factors: []
      };
    }

    const rating = performanceReview?.calculatedScores?.rating || 'Average';
    const matrix = policy.incrementMatrix[rating] || policy.incrementMatrix.Average;

    let basePercentage = matrix.recommended;
    const factors = [];

    // Factor 1: Performance score
    factors.push({
      name: 'Performance',
      percentage: basePercentage,
      description: `Based on ${rating} rating`
    });

    // Factor 2: Tenure
    const tenureYears = this.calculateTenureYears(employee.DateOfJoining);
    const tenureBonus = policy.tenureBonuses.find(
      b => tenureYears >= b.yearsFrom && tenureYears <= b.yearsTo
    );
    if (tenureBonus) {
      basePercentage += tenureBonus.bonusPercentage;
      factors.push({
        name: 'Tenure',
        percentage: tenureBonus.bonusPercentage,
        description: `${tenureYears} years of service`
      });
    }

    // Factor 3: Attendance
    const attendanceBonus = policy.attendanceBonuses.find(
      b => attendance.attendancePercentage >= b.threshold
    );
    if (attendanceBonus) {
      basePercentage += attendanceBonus.bonusPercentage;
      factors.push({
        name: 'Attendance',
        percentage: attendanceBonus.bonusPercentage,
        description: `${attendance.attendancePercentage}% attendance`
      });
    }

    // Factor 4: Safety
    if (safety.accidentCount === 0) {
      basePercentage += policy.safetyBonuses.zeroAccidents;
      factors.push({
        name: 'Safety',
        percentage: policy.safetyBonuses.zeroAccidents,
        description: 'Zero accidents'
      });
    }

    // Apply caps
    basePercentage = Math.min(basePercentage, policy.maxIncrementPercentage);
    basePercentage = Math.max(basePercentage, policy.minIncrementPercentage);

    // Apply employment type cap
    const typeRule = policy.employmentTypeRules[employee.EmploymentType];
    if (typeRule) {
      basePercentage = Math.min(basePercentage, typeRule.maxIncrement);
    }

    return {
      suggestedPercentage: Math.round(basePercentage * 10) / 10,
      minPercentage: matrix.min,
      maxPercentage: Math.min(matrix.max, policy.maxIncrementPercentage),
      factors
    };
  }

  /**
   * Check eligibility for increment
   */
  async checkEligibility(employee, performanceReview, year) {
    const eligibility = {
      eligible: true,
      reasons: [],
      warnings: []
    };

    // Check if already got increment this year
    const existingIncrement = await Increment.findOne({
      employeeId: employee._id,
      incrementYear: year,
      'workflow.status': { $in: ['APPROVED', 'PENDING_MANAGER', 'PENDING_HR'] }
    });

    if (existingIncrement) {
      eligibility.eligible = false;
      eligibility.reasons.push('Increment already processed for this year');
    }

    // Check minimum tenure (6 months)
    const tenureMonths = this.calculateTenureMonths(employee.DateOfJoining);
    if (tenureMonths < 6) {
      eligibility.eligible = false;
      eligibility.reasons.push('Minimum 6 months service required');
    }

    // Check employment status
    if (employee.EmploymentStatus !== 'active') {
      eligibility.eligible = false;
      eligibility.reasons.push('Employee is not active');
    }

    // Check performance review exists
    if (!performanceReview) {
      eligibility.warnings.push('Performance review not found');
    }

    // Check attendance (warning if below 80%)
    const attendance = await this.getAttendanceSummary(employee._id, year);
    if (attendance.attendancePercentage < 80) {
      eligibility.warnings.push(`Low attendance: ${attendance.attendancePercentage}%`);
    }

    return eligibility;
  }

  /**
   * Create increment proposal
   */
  async createIncrement(incrementData, userId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        employeeId,
        incrementType,
        effectiveFrom,
        incrementPercentage,
        performanceReviewId,
        remarks,
        managerRemarks
      } = incrementData;

      // Get employee
      const employee = await Employee.findById(employeeId);

      // Get current salary
      const currentSalary = await this.getCurrentSalary(employeeId);

      // Calculate new salary
      const percentage = incrementPercentage / 100;
      const newSalary = {
        basic: Math.round(currentSalary.basic * (1 + percentage)),
        hra: Math.round(currentSalary.hra * (1 + percentage)),
        conveyance: Math.round(currentSalary.conveyance * (1 + percentage)),
        medical: Math.round(currentSalary.medical * (1 + percentage)),
        special: Math.round(currentSalary.special * (1 + percentage)),
        total: Math.round(currentSalary.total * (1 + percentage))
      };

      // Get performance review
      const performanceReview = await PerformanceReview.findById(performanceReviewId);

      // Create increment record
      const increment = new Increment({
        employeeId,
        incrementDate: new Date(),
        effectiveFrom,
        incrementYear: new Date(effectiveFrom).getFullYear(),
        performanceReviewId,

        previousSalary: currentSalary,
        newSalary,

        incrementType,
        incrementPercentage: {
          overall: incrementPercentage,
          basic: incrementPercentage,
          hra: incrementPercentage,
          conveyance: incrementPercentage,
          medical: incrementPercentage,
          special: incrementPercentage
        },

        incrementAmount: {
          monthly: newSalary.total - currentSalary.total,
          annual: (newSalary.total - currentSalary.total) * 12
        },

        performanceSnapshot: performanceReview ? {
          totalScore: performanceReview.calculatedScores?.totalScore,
          rating: performanceReview.calculatedScores?.rating,
          managerRating: performanceReview.managerRatings?.overall,
          attendancePercentage: performanceReview.attendanceMetrics?.attendancePercentage,
          qualityPercentage: performanceReview.productionMetrics?.qualityPercentage
        } : null,

        remarks,
        managerRemarks,

        workflow: {
          status: 'DRAFT',
          history: [{
            stage: 'creation',
            action: 'CREATED',
            performedBy: userId,
            performedAt: new Date()
          }]
        },

        createdBy: userId
      });

      await increment.save({ session });

      await session.commitTransaction();
      return increment;

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Process bulk increments for a department/year
   */
  async processBulkIncrements(year, departmentId, defaultPercentage, userId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get all active employees in department
      const query = { EmploymentStatus: 'active' };
      if (departmentId) {
        query.DepartmentID = departmentId;
      }

      const employees = await Employee.find(query).select('_id');

      const results = {
        total: employees.length,
        success: [],
        failed: []
      };

      for (const employee of employees) {
        try {
          // Get dashboard to check eligibility
          const dashboard = await this.getIncrementDashboard(employee._id, year);

          if (!dashboard.eligibility.eligible) {
            results.failed.push({
              employeeId: employee._id,
              reason: dashboard.eligibility.reasons.join(', ')
            });
            continue;
          }

          // Create increment with default percentage
          const increment = await this.createIncrement({
            employeeId: employee._id,
            incrementType: 'ANNUAL_REVIEW',
            effectiveFrom: new Date(year, 3, 1), // April 1st
            incrementPercentage: defaultPercentage || dashboard.recommendation.suggestedPercentage,
            performanceReviewId: dashboard.performanceReview?._id,
            remarks: 'Bulk increment processing'
          }, userId);

          // Submit for approval
          await increment.submitForApproval(userId);

          results.success.push({
            employeeId: employee._id,
            incrementId: increment._id,
            percentage: increment.incrementPercentage.overall
          });

        } catch (error) {
          results.failed.push({
            employeeId: employee._id,
            error: error.message
          });
        }
      }

      await session.commitTransaction();
      return results;

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Apply increment (final step after approval)
   */
  async applyIncrement(incrementId, userId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const increment = await Increment.findById(incrementId);

      if (!increment) {
        throw new Error('Increment not found');
      }

      if (increment.workflow.status !== 'APPROVED') {
        throw new Error('Increment not approved yet');
      }

      // Update employee master with new salary
      const employee = await Employee.findById(increment.employeeId);
      
      employee.BasicSalary = increment.newSalary.basic;
      employee.HRA = increment.newSalary.hra;
      employee.ConveyanceAllowance = increment.newSalary.conveyance;
      employee.MedicalAllowance = increment.newSalary.medical;
      employee.SpecialAllowance = increment.newSalary.special;

      // Update skill level if promotion
      if (increment.incrementType === 'PROMOTION' || increment.incrementType === 'SKILL_UPGRADE') {
        // Logic to upgrade skill level
        const skillLevels = ['Unskilled', 'Semi-Skilled', 'Skilled', 'Highly Skilled'];
        const currentIndex = skillLevels.indexOf(employee.SkillLevel);
        if (currentIndex < skillLevels.length - 1) {
          employee.SkillLevel = skillLevels[currentIndex + 1];
        }
      }

      await employee.save({ session });

      // Generate increment letter
      await increment.generateLetter();

      await session.commitTransaction();

      return increment;

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Get increment summary for reporting
   */
  async getIncrementSummary(year, departmentId = null) {
    const matchStage = { incrementYear: year };
    
    if (departmentId) {
      const employees = await Employee.find({ DepartmentID: departmentId }).select('_id');
      matchStage.employeeId = { $in: employees.map(e => e._id) };
    }

    const summary = await Increment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$workflow.status',
          count: { $sum: 1 },
          totalIncrementAmount: { $sum: '$incrementAmount.monthly' },
          averagePercentage: { $avg: '$incrementPercentage.overall' },
          minPercentage: { $min: '$incrementPercentage.overall' },
          maxPercentage: { $max: '$incrementPercentage.overall' }
        }
      }
    ]);

    const departmentWise = await Increment.aggregate([
      { $match: { ...matchStage, 'workflow.status': 'APPROVED' } },
      {
        $lookup: {
          from: 'employees',
          localField: 'employeeId',
          foreignField: '_id',
          as: 'employee'
        }
      },
      { $unwind: '$employee' },
      {
        $lookup: {
          from: 'departments',
          localField: 'employee.DepartmentID',
          foreignField: '_id',
          as: 'department'
        }
      },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$department.DepartmentName',
          employeeCount: { $sum: 1 },
          totalIncrement: { $sum: '$incrementAmount.monthly' },
          averagePercentage: { $avg: '$incrementPercentage.overall' }
        }
      }
    ]);

    return {
      year,
      byStatus: summary,
      departmentWise,
      totals: {
        totalEmployees: summary.reduce((sum, s) => sum + s.count, 0),
        totalIncrementCost: summary.reduce((sum, s) => sum + (s.totalIncrementAmount || 0), 0),
        overallAveragePercentage: summary.find(s => s._id === 'APPROVED')?.averagePercentage || 0
      }
    };
  }

  // ==================== HELPER METHODS ====================

  calculateTenure(doj) {
    const now = new Date();
    const diff = now - new Date(doj);
    const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
    const months = Math.floor((diff % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
    const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));

    return { years, months, days, totalMonths: years * 12 + months };
  }

  calculateTenureYears(doj) {
    return this.calculateTenure(doj).years;
  }

  calculateTenureMonths(doj) {
    return this.calculateTenure(doj).totalMonths;
  }
}

module.exports = new IncrementService();