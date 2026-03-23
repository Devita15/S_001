// services/employeeHistoryService.js
const Employee = require('../models/HR/Employee');
const Salary = require('../models/HR/Salary');
const Termination = require('../models/HR/Termination');
const Document = require('../models/HR/Document');
const mongoose = require('mongoose');

class EmployeeHistoryService {
  
  /**
   * Get complete employee history (simplified version)
   * @param {string} employeeId - Employee ID or ObjectId
   * @returns {Promise<Object>} Simplified employee history
   */
  async getEmployeeHistory(employeeId) {
    try {
      // Find employee by ID or EmployeeID
      const employee = await this.findEmployee(employeeId);
      
      if (!employee) {
        throw new Error('Employee not found');
      }

      // Fetch all related data in parallel
      const [salaryHistory, exitDetails, documents] = await Promise.all([
        this.getSalaryHistory(employee._id),
        this.getExitDetails(employee._id),
        this.getDocuments(employee._id)
      ]);

      // Calculate summary statistics
      const summary = this.calculateSummary(employee, salaryHistory);

      // Compile complete history
      const employeeHistory = {
        employee: {
          id: employee._id,
          employeeId: employee.EmployeeID,
          name: `${employee.FirstName} ${employee.LastName}`,
          department: employee.DepartmentID ? employee.DepartmentID.DepartmentName : 'N/A',
          designation: employee.DesignationID ? employee.DesignationID.DesignationName : 'N/A',
          dateOfJoining: employee.DateOfJoining,
          employmentStatus: employee.EmploymentStatus,
          employmentType: employee.EmploymentType
        },
        summary: summary,
        salaryHistory: salaryHistory,
        exitDetails: exitDetails,
        documents: documents,
        metadata: {
          generatedAt: new Date(),
          yearsOfService: this.calculateYearsOfService(employee)
        }
      };

      return employeeHistory;

    } catch (error) {
      console.error('Error fetching employee history:', error);
      throw error;
    }
  }

  /**
   * Find employee by ID or EmployeeID with populated fields
   */
  async findEmployee(employeeId) {
    let query = {};
    
    // Check if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(employeeId)) {
      query = { $or: [
        { _id: employeeId },
        { EmployeeID: employeeId }
      ]};
    } else {
      query = { EmployeeID: employeeId };
    }

    return await Employee.findOne(query)
      .populate('DepartmentID', 'DepartmentName')
      .populate('DesignationID', 'DesignationName');
  }

  /**
   * Get simplified salary history (month, net pay, status only)
   */
  async getSalaryHistory(employeeObjectId) {
    const salaries = await Salary.find({ 
      employee: employeeObjectId,
      paymentStatus: { $in: ['PAID', 'APPROVED', 'PROCESSED'] }
    })
    .sort({ 'payrollPeriod.year': -1, 'payrollPeriod.month': -1 })
    .select({
      'payrollPeriod': 1,
      'netPay': 1,
      'paymentStatus': 1,
      'paymentDate': 1,
      'grossSalary': 1,
      'totalDeductions': 1,
      'employmentType': 1
    });

    return salaries.map(salary => ({
      period: {
        month: salary.payrollPeriod.month,
        year: salary.payrollPeriod.year,
        display: `${this.getMonthName(salary.payrollPeriod.month)} ${salary.payrollPeriod.year}`
      },
      netPay: salary.netPay,
      grossSalary: salary.grossSalary,
      totalDeductions: salary.totalDeductions,
      status: salary.paymentStatus,
      paymentDate: salary.paymentDate,
      employmentType: salary.employmentType
    }));
  }

  /**
   * Get exit details if employee has left
   */
  async getExitDetails(employeeObjectId) {
    const termination = await Termination.findOne({ 
      employeeId: employeeObjectId,
      status: { $in: ['approved', 'pending_review'] }
    })
    .sort({ createdAt: -1 })
    .select({
      'terminationId': 1,
      'terminationType': 1,
      'reason': 1,
      'lastWorkingDay': 1,
      'status': 1,
      'settlementDetails.finalSettlementAmount': 1,
      'settlementDetails.settlementDate': 1,
      'feedback.exitInterview.rehireEligible': 1,
      'documents': 1
    });

    if (!termination) {
      return null;
    }

    return {
      terminationId: termination.terminationId,
      type: termination.terminationType,
      reason: termination.reason,
      lastWorkingDay: termination.lastWorkingDay,
      status: termination.status,
      finalSettlement: termination.settlementDetails?.finalSettlementAmount || 0,
      settlementDate: termination.settlementDetails?.settlementDate,
      rehireEligible: termination.feedback?.exitInterview?.rehireEligible ?? true,
      documents: {
        experienceLetter: termination.documents?.experienceLetter?.generated || false,
        relievingLetter: termination.documents?.relievingLetter?.generated || false
      }
    };
  }

  /**
   * Get key documents (Offer Letter, Relieving Letter)
   */
  async getDocuments(employeeObjectId) {
    const documents = await Document.find({ 
      employeeId: employeeObjectId,
      type: { $in: ['offer_letter', 'appointment_letter'] }
    })
    .sort({ createdAt: -1 })
    .select({
      'type': 1,
      'filename': 1,
      'fileUrl': 1,
      'status': 1,
      'generatedAt': 1,
      'signedAt': 1,
      'version': 1
    });

    // Also get relieving letter from termination if exists
    const termination = await Termination.findOne({ 
      employeeId: employeeObjectId,
      'documents.relievingLetter.generated': true
    });

    const documentList = documents.map(doc => ({
      type: doc.type,
      displayName: this.getDocumentDisplayName(doc.type),
      filename: doc.filename,
      url: doc.fileUrl,
      status: doc.status,
      generatedAt: doc.generatedAt || doc.createdAt,
      signedAt: doc.signedAt,
      version: doc.version
    }));

    // Add relieving letter if exists
    if (termination && termination.documents?.relievingLetter?.generated) {
      documentList.push({
        type: 'relieving_letter',
        displayName: 'Relieving Letter',
        filename: 'relieving_letter.pdf',
        url: termination.documents.relievingLetter.path,
        status: 'generated',
        generatedAt: termination.documents.relievingLetter.generatedAt
      });
    }

    // Add experience letter if exists
    if (termination && termination.documents?.experienceLetter?.generated) {
      documentList.push({
        type: 'experience_letter',
        displayName: 'Experience Letter',
        filename: 'experience_letter.pdf',
        url: termination.documents.experienceLetter.path,
        status: 'generated',
        generatedAt: termination.documents.experienceLetter.generatedAt
      });
    }

    return documentList;
  }

  /**
   * Calculate summary statistics
   */
  calculateSummary(employee, salaryHistory) {
    const totalSalaries = salaryHistory.length;
    const totalEarned = salaryHistory.reduce((sum, s) => sum + s.netPay, 0);
    
    // Get last 6 months average
    const last6Months = salaryHistory.slice(0, 6);
    const avgLast6Months = last6Months.length > 0 
      ? last6Months.reduce((sum, s) => sum + s.netPay, 0) / last6Months.length 
      : 0;

    // Get current/last salary
    const lastSalary = salaryHistory.length > 0 ? salaryHistory[0] : null;

    return {
      totalMonthsWorked: totalSalaries,
      totalEarned: totalEarned,
      averageMonthlySalary: totalSalaries > 0 ? Math.round(totalEarned / totalSalaries) : 0,
      averageLast6Months: Math.round(avgLast6Months),
      lastSalary: lastSalary ? {
        amount: lastSalary.netPay,
        period: lastSalary.period.display,
        status: lastSalary.status
      } : null
    };
  }

  /**
   * Calculate years of service
   */
  calculateYearsOfService(employee) {
    const joinDate = new Date(employee.DateOfJoining);
    const today = new Date();
    const diffTime = Math.abs(today - joinDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const years = Math.floor(diffDays / 365);
    const months = Math.floor((diffDays % 365) / 30);
    
    return {
      years,
      months,
      days: diffDays,
      display: `${years} years, ${months} months`
    };
  }

  /**
   * Get month name
   */
  getMonthName(month) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
  }

  /**
   * Get document display name
   */
  getDocumentDisplayName(type) {
    const names = {
      'offer_letter': 'Offer Letter',
      'appointment_letter': 'Appointment Letter',
      'relieving_letter': 'Relieving Letter',
      'experience_letter': 'Experience Letter'
    };
    return names[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

module.exports = new EmployeeHistoryService();