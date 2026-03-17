// controllers/employeeHistoryController.js
const employeeHistoryService = require('../../services/employeeHistoryService');
const mongoose = require('mongoose');

class EmployeeHistoryController {
  
  /**
   * Get employee history
   * GET /api/employees/:employeeId/history
   */
  async getEmployeeHistory(req, res) {
    try {
      const { employeeId } = req.params;
      
      const history = await employeeHistoryService.getEmployeeHistory(employeeId);
      
      return res.status(200).json({
        success: true,
        data: history
      });
      
    } catch (error) {
      console.error('Error in getEmployeeHistory:', error);
      
      if (error.message === 'Employee not found') {
        return res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch employee history',
        error: error.message
      });
    }
  }

  /**
   * Get employee history summary only
   * GET /api/employees/:employeeId/history/summary
   */
  async getEmployeeHistorySummary(req, res) {
    try {
      const { employeeId } = req.params;
      
      const history = await employeeHistoryService.getEmployeeHistory(employeeId);
      
      // Return only summary
      return res.status(200).json({
        success: true,
        data: {
          employee: history.employee,
          summary: history.summary,
          yearsOfService: history.metadata.yearsOfService
        }
      });
      
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch employee summary',
        error: error.message
      });
    }
  }

  /**
   * Get employee salary history only
   * GET /api/employees/:employeeId/history/salary
   */
  async getSalaryHistory(req, res) {
    try {
      const { employeeId } = req.params;
      const { year, limit = 12 } = req.query;
      
      // Find employee first
      const Employee = require('../../models/HR/Employee');
      let employee;
      
      if (mongoose.Types.ObjectId.isValid(employeeId)) {
        employee = await Employee.findById(employeeId);
      } else {
        employee = await Employee.findOne({ EmployeeID: employeeId });
      }
      
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }
      
      // Build query
      const query = { employee: employee._id };
      if (year) {
        query['payrollPeriod.year'] = parseInt(year);
      }
      
      const salaries = await Salary.find(query)
        .sort({ 'payrollPeriod.year': -1, 'payrollPeriod.month': -1 })
        .limit(parseInt(limit))
        .select({
          'payrollPeriod': 1,
          'netPay': 1,
          'grossSalary': 1,
          'totalDeductions': 1,
          'paymentStatus': 1,
          'paymentDate': 1
        });
      
      const formattedSalaries = salaries.map(s => ({
        period: {
          month: s.payrollPeriod.month,
          year: s.payrollPeriod.year,
          display: `${s.monthName} ${s.payrollPeriod.year}`
        },
        netPay: s.netPay,
        grossSalary: s.grossSalary,
        deductions: s.totalDeductions,
        status: s.paymentStatus,
        paymentDate: s.paymentDate
      }));
      
      return res.status(200).json({
        success: true,
        data: formattedSalaries
      });
      
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch salary history',
        error: error.message
      });
    }
  }
}

module.exports = new EmployeeHistoryController();