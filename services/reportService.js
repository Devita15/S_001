// services/reportService.js
const Employee = require('../models/Employee');
const EmployeeIncrement = require('../models/EmployeeIncrement');
const EmployeeBehavior = require('../models/EmployeeBehavior');
const Department = require('../models/Department');
const mongoose = require('mongoose');

class ReportService {
  
  /**
   * Get employees eligible for increment
   * @param {number} year - The increment year
   * @param {number} probationMonths - Number of months for probation period (default: 6)
   */
  async getEligibleEmployees(year, probationMonths = 6) {
    try {
      const startDate = new Date(year, 0, 1); // Jan 1 of the year
      const cutoffDate = new Date(startDate);
      cutoffDate.setMonth(cutoffDate.getMonth() - probationMonths);
      
      const employees = await Employee.find({
        EmploymentStatus: 'active',
        DateOfJoining: { $lte: cutoffDate }
      })
      .select('EmployeeID FirstName LastName DepartmentID DesignationID DateOfJoining')
      .populate('DepartmentID', 'DepartmentName')
      .populate('DesignationID', 'DesignationName')
      .lean();
      
      // Check if they already have increment for this year
      const existingIncrements = await EmployeeIncrement.find({
        incrementYear: year,
        employee: { $in: employees.map(e => e._id) }
      }).select('employee status').lean();
      
      const existingMap = {};
      existingIncrements.forEach(inc => {
        existingMap[inc.employee.toString()] = inc.status;
      });
      
      // Add increment status to each employee
      const result = employees.map(emp => ({
        ...emp,
        FullName: `${emp.FirstName} ${emp.LastName}`,
        DepartmentName: emp.DepartmentID?.DepartmentName,
        DesignationName: emp.DesignationID?.DesignationName,
        incrementStatus: existingMap[emp._id.toString()] || 'NOT_STARTED',
        hasExistingIncrement: !!existingMap[emp._id.toString()]
      }));
      
      return {
        year,
        probationMonths,
        totalEligible: result.length,
        withIncrement: result.filter(e => e.hasExistingIncrement).length,
        withoutIncrement: result.filter(e => !e.hasExistingIncrement).length,
        employees: result
      };
      
    } catch (error) {
      console.error('Error in getEligibleEmployees:', error);
      throw error;
    }
  }
  
  /**
   * Get increment impact report by department
   * @param {number} year - The increment year
   */
  async getIncrementImpactReport(year) {
    try {
      const increments = await EmployeeIncrement.aggregate([
        {
          $match: {
            incrementYear: year,
            status: 'APPLIED'
          }
        },
        {
          $lookup: {
            from: 'employees',
            localField: 'employee',
            foreignField: '_id',
            as: 'emp'
          }
        },
        { $unwind: '$emp' },
        {
          $group: {
            _id: '$emp.DepartmentID',
            employeeCount: { $sum: 1 },
            totalIncrementAmount: { $sum: '$incrementAmount' },
            avgIncrementPercent: { $avg: '$incrementPercent' },
            totalOldSalary: { 
              $sum: { 
                $ifNull: ['$previousSalary.TotalFixedSalary', 0] 
              } 
            },
            totalNewSalary: { 
              $sum: { 
                $ifNull: ['$newSalary.TotalFixedSalary', 0] 
              } 
            },
            minIncrement: { $min: '$incrementPercent' },
            maxIncrement: { $max: '$incrementPercent' },
            // Behavior category breakdown
            excellentCount: {
              $sum: { $cond: [{ $eq: ['$behaviorCategory', 'Excellent'] }, 1, 0] }
            },
            goodCount: {
              $sum: { $cond: [{ $eq: ['$behaviorCategory', 'Good'] }, 1, 0] }
            },
            averageCount: {
              $sum: { $cond: [{ $eq: ['$behaviorCategory', 'Average'] }, 1, 0] }
            },
            belowAverageCount: {
              $sum: { $cond: [{ $eq: ['$behaviorCategory', 'Below Average'] }, 1, 0] }
            },
            poorCount: {
              $sum: { $cond: [{ $eq: ['$behaviorCategory', 'Poor'] }, 1, 0] }
            }
          }
        },
        {
          $lookup: {
            from: 'departments',
            localField: '_id',
            foreignField: '_id',
            as: 'dept'
          }
        },
        { $unwind: '$dept' },
        {
          $project: {
            departmentId: '$_id',
            departmentName: '$dept.DepartmentName',
            employeeCount: 1,
            totalIncrementAmount: { $round: ['$totalIncrementAmount', 2] },
            avgIncrementPercent: { $round: ['$avgIncrementPercent', 2] },
            minIncrement: { $round: ['$minIncrement', 2] },
            maxIncrement: { $round: ['$maxIncrement', 2] },
            totalOldSalary: { $round: ['$totalOldSalary', 2] },
            totalNewSalary: { $round: ['$totalNewSalary', 2] },
            totalIncrease: { 
              $round: [
                { $subtract: ['$totalNewSalary', '$totalOldSalary'] }, 
                2
              ] 
            },
            percentageIncrease: {
              $round: [
                {
                  $multiply: [
                    {
                      $divide: [
                        { $subtract: ['$totalNewSalary', '$totalOldSalary'] },
                        { $ifNull: ['$totalOldSalary', 1] }
                      ]
                    },
                    100
                  ]
                },
                2
              ]
            },
            behaviorBreakdown: {
              excellent: '$excellentCount',
              good: '$goodCount',
              average: '$averageCount',
              belowAverage: '$belowAverageCount',
              poor: '$poorCount'
            },
            _id: 0
          }
        },
        { $sort: { departmentName: 1 } }
      ]);
      
      // Get overall totals
      const overall = await EmployeeIncrement.aggregate([
        {
          $match: {
            incrementYear: year,
            status: 'APPLIED'
          }
        },
        {
          $group: {
            _id: null,
            totalEmployees: { $sum: 1 },
            totalIncrementAmount: { $sum: '$incrementAmount' },
            overallAvgPercent: { $avg: '$incrementPercent' },
            totalOldSalary: { $sum: '$previousSalary.TotalFixedSalary' },
            totalNewSalary: { $sum: '$newSalary.TotalFixedSalary' }
          }
        },
        {
          $project: {
            _id: 0,
            totalEmployees: 1,
            totalIncrementAmount: { $round: ['$totalIncrementAmount', 2] },
            overallAvgPercent: { $round: ['$overallAvgPercent', 2] },
            totalOldSalary: { $round: ['$totalOldSalary', 2] },
            totalNewSalary: { $round: ['$totalNewSalary', 2] },
            totalIncrease: {
              $round: [{ $subtract: ['$totalNewSalary', '$totalOldSalary'] }, 2]
            },
            overallPercentageIncrease: {
              $round: [
                {
                  $multiply: [
                    {
                      $divide: [
                        { $subtract: ['$totalNewSalary', '$totalOldSalary'] },
                        { $ifNull: ['$totalOldSalary', 1] }
                      ]
                    },
                    100
                  ]
                },
                2
              ]
            }
          }
        }
      ]);
      
      return {
        year,
        generatedAt: new Date(),
        summary: overall[0] || {
          totalEmployees: 0,
          totalIncrementAmount: 0,
          overallAvgPercent: 0,
          totalOldSalary: 0,
          totalNewSalary: 0,
          totalIncrease: 0,
          overallPercentageIncrease: 0
        },
        departments: increments
      };
      
    } catch (error) {
      console.error('Error in getIncrementImpactReport:', error);
      throw error;
    }
  }
  
  /**
   * Get behavior vs increment correlation report
   * @param {number} year - The increment year
   */
  async getBehaviorCorrelationReport(year) {
    try {
      const report = await EmployeeIncrement.aggregate([
        {
          $match: {
            incrementYear: year,
            status: 'APPLIED'
          }
        },
        {
          $group: {
            _id: '$behaviorCategory',
            count: { $sum: 1 },
            avgIncrementPercent: { $avg: '$incrementPercent' },
            avgBehaviorScore: { $avg: '$behaviorScore' },
            totalIncrementAmount: { $sum: '$incrementAmount' },
            minIncrement: { $min: '$incrementPercent' },
            maxIncrement: { $max: '$incrementPercent' }
          }
        },
        {
          $project: {
            category: '$_id',
            count: 1,
            avgIncrementPercent: { $round: ['$avgIncrementPercent', 2] },
            avgBehaviorScore: { $round: ['$avgBehaviorScore', 2] },
            totalIncrementAmount: { $round: ['$totalIncrementAmount', 2] },
            minIncrement: 1,
            maxIncrement: 1,
            _id: 0
          }
        },
        { $sort: { avgBehaviorScore: -1 } }
      ]);
      
      // Get scatter plot data (for charts)
      const scatterData = await EmployeeIncrement.aggregate([
        {
          $match: {
            incrementYear: year,
            status: 'APPLIED'
          }
        },
        {
          $project: {
            employee: 1,
            behaviorScore: 1,
            incrementPercent: 1,
            behaviorCategory: 1,
            _id: 0
          }
        },
        {
          $lookup: {
            from: 'employees',
            localField: 'employee',
            foreignField: '_id',
            as: 'emp'
          }
        },
        { $unwind: '$emp' },
        {
          $project: {
            employeeId: '$emp.EmployeeID',
            employeeName: { $concat: ['$emp.FirstName', ' ', '$emp.LastName'] },
            behaviorScore: 1,
            incrementPercent: 1,
            behaviorCategory: 1
          }
        },
        { $sort: { behaviorScore: -1 } }
      ]);
      
      return {
        year,
        categoryBreakdown: report,
        scatterData
      };
      
    } catch (error) {
      console.error('Error in getBehaviorCorrelationReport:', error);
      throw error;
    }
  }
  
  /**
   * Get increment history for an employee
   * @param {string} employeeId - Employee ID
   */
  async getEmployeeIncrementHistory(employeeId) {
    try {
      const increments = await EmployeeIncrement.find({ 
        employee: employeeId,
        status: 'APPLIED'
      })
      .sort({ incrementYear: -1 })
      .populate('policyId', 'year name')
      .populate('approvedBy', 'Username')
      .lean();
      
      // Calculate progression
      const progression = [];
      let previousSalary = 0;
      
      increments.forEach((inc, index) => {
        const oldSalary = inc.previousSalary?.TotalFixedSalary || 0;
        const newSalary = inc.newSalary?.TotalFixedSalary || 0;
        
        progression.push({
          year: inc.incrementYear,
          oldSalary,
          newSalary,
          incrementAmount: inc.incrementAmount,
          incrementPercent: inc.incrementPercent,
          behaviorScore: inc.behaviorScore,
          behaviorCategory: inc.behaviorCategory,
          cumulativeGrowth: index === 0 ? 0 : 
            ((newSalary - increments[0].previousSalary?.TotalFixedSalary) / 
             increments[0].previousSalary?.TotalFixedSalary * 100).toFixed(2)
        });
      });
      
      return {
        employeeId,
        totalIncrements: increments.length,
        firstIncrementYear: increments.length > 0 ? increments[increments.length - 1].incrementYear : null,
        lastIncrementYear: increments.length > 0 ? increments[0].incrementYear : null,
        totalSalaryGrowth: increments.length > 0 ? 
          (increments[0].newSalary?.TotalFixedSalary - increments[increments.length - 1].previousSalary?.TotalFixedSalary) : 0,
        progression,
        increments
      };
      
    } catch (error) {
      console.error('Error in getEmployeeIncrementHistory:', error);
      throw error;
    }
  }
  
  /**
   * Get department-wise increment summary
   * @param {number} year - The increment year
   */
  async getDepartmentIncrementSummary(year) {
    try {
      const summary = await EmployeeIncrement.aggregate([
        {
          $match: {
            incrementYear: year,
            status: 'APPLIED'
          }
        },
        {
          $lookup: {
            from: 'employees',
            localField: 'employee',
            foreignField: '_id',
            as: 'emp'
          }
        },
        { $unwind: '$emp' },
        {
          $group: {
            _id: '$emp.DepartmentID',
            employeeCount: { $sum: 1 },
            totalIncrementAmount: { $sum: '$incrementAmount' },
            avgIncrementPercent: { $avg: '$incrementPercent' },
            // Behavior distribution
            excellentCount: {
              $sum: { $cond: [{ $eq: ['$behaviorCategory', 'Excellent'] }, 1, 0] }
            },
            goodCount: {
              $sum: { $cond: [{ $eq: ['$behaviorCategory', 'Good'] }, 1, 0] }
            },
            averageCount: {
              $sum: { $cond: [{ $eq: ['$behaviorCategory', 'Average'] }, 1, 0] }
            },
            belowAverageCount: {
              $sum: { $cond: [{ $eq: ['$behaviorCategory', 'Below Average'] }, 1, 0] }
            },
            poorCount: {
              $sum: { $cond: [{ $eq: ['$behaviorCategory', 'Poor'] }, 1, 0] }
            }
          }
        },
        {
          $lookup: {
            from: 'departments',
            localField: '_id',
            foreignField: '_id',
            as: 'dept'
          }
        },
        { $unwind: '$dept' },
        {
          $project: {
            department: '$dept.DepartmentName',
            employeeCount: 1,
            totalIncrementAmount: { $round: ['$totalIncrementAmount', 2] },
            avgIncrementPercent: { $round: ['$avgIncrementPercent', 2] },
            behaviorDistribution: {
              excellent: '$excellentCount',
              good: '$goodCount',
              average: '$averageCount',
              belowAverage: '$belowAverageCount',
              poor: '$poorCount'
            }
          }
        },
        { $sort: { avgIncrementPercent: -1 } }
      ]);
      
      // Get company average
      const companyAvg = await EmployeeIncrement.aggregate([
        {
          $match: {
            incrementYear: year,
            status: 'APPLIED'
          }
        },
        {
          $group: {
            _id: null,
            avgPercent: { $avg: '$incrementPercent' },
            totalEmployees: { $sum: 1 }
          }
        }
      ]);
      
      return {
        year,
        companyAverage: companyAvg[0]?.avgPercent || 0,
        totalEmployeesProcessed: companyAvg[0]?.totalEmployees || 0,
        departments: summary
      };
      
    } catch (error) {
      console.error('Error in getDepartmentIncrementSummary:', error);
      throw error;
    }
  }
}

module.exports = new ReportService();