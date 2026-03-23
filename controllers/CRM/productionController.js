const Production = require('../../models/HR/Production');
const Employee = require('../../models/HR/Employee');
const PieceRateMaster = require('../../models/HR/PieceRateMaster'); 
const mongoose = require('mongoose');

class ProductionController {
  
 async recordProduction(req, res) {
  try {
    const {
      employeeId,
      date = new Date(),
      productName,
      operation,
      totalUnits,
      goodUnits,
      rejectedUnits = 0,
      reworkUnits = 0,
      qualityBonus = 0,
      efficiencyBonus = 0,
      startTime,
      endTime,
      machineId,
      batchNumber,
      orderNumber,
      remarks
    } = req.body;
    
    // Validate required fields
    if (!employeeId  || !productName || !operation || !totalUnits || !goodUnits) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: employeeId, productName, operation, totalUnits, goodUnits'
      });
    }

    // ==================== DATE VALIDATION ====================
    let productionDate;
    if (date) {
      productionDate = new Date(date);
      const currentDate = new Date();
      const today = new Date(currentDate.setHours(0, 0, 0, 0));

      // Check if date is valid
      if (isNaN(productionDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid production date format. Please provide a valid date.'
        });
      }

      // Production date cannot be in the future
      if (productionDate > today) {
        return res.status(400).json({
          success: false,
          message: 'Production date cannot be in the future. Please select a past or current date.'
        });
      }
    }
    // ==================== END DATE VALIDATION ====================
    
    // Check employee exists and is piece-rate
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    if (employee.EmploymentType !== 'PieceRate') {
      return res.status(400).json({
        success: false,
        message: 'Employee is not a piece-rate worker'
      });
    }
    
    // FETCH ACTIVE RATE FROM PIECERATEMASTER
    const activeRate = await PieceRateMaster.findOne({
      productType: productName,
      operation: operation,
      effectiveFrom: { $lte: productionDate },
      $or: [
        { effectiveTo: { $gte: productionDate } },
        { effectiveTo: null }
      ],
      isActive: true
    });

    if (!activeRate) {
      return res.status(400).json({
        success: false,
        message: `No active rate found for product "${productName}" and operation "${operation}" on ${productionDate.toLocaleDateString()}`
      });
    }

    const ratePerUnit = activeRate.ratePerUnit;
    
    // Parse numeric values for correct calculation
    const parsedGoodUnits = parseInt(goodUnits);
    const parsedQualityBonus = parseFloat(qualityBonus || 0);
    const parsedEfficiencyBonus = parseFloat(efficiencyBonus || 0);
    
    // Calculate daily earning correctly
    const dailyEarning = (parsedGoodUnits * ratePerUnit) + parsedQualityBonus + parsedEfficiencyBonus;
    
    // Create production record with rateMasterId
    const production = new Production({
      EmployeeID: employeeId,
      Date: productionDate,
      ProductName: productName,
      Operation: operation,
      TotalUnits: totalUnits,
      GoodUnits: goodUnits,
      RejectedUnits: rejectedUnits,
      ReworkUnits: reworkUnits,
      RatePerUnit: ratePerUnit,
      rateMasterId: activeRate._id,
      QualityBonus: qualityBonus,
      EfficiencyBonus: efficiencyBonus,
      StartTime: startTime ? new Date(startTime) : null,
      EndTime: endTime ? new Date(endTime) : null,
      MachineID: machineId,
      BatchNumber: batchNumber,
      OrderNumber: orderNumber,
      Remarks: remarks,
      Status: 'Pending',
      CreatedBy: req.user?._id,
      DailyEarning: dailyEarning // Correctly calculated
    });
    
    await production.save();
    
    // Populate employee details
    await production.populate('EmployeeID', 'EmployeeID FirstName LastName DepartmentID DesignationID');
    
    return res.status(201).json({
      success: true,
      message: 'Production recorded successfully',
      data: production  // Response structure remains EXACTLY the same
    });
    
  } catch (error) {
    console.error('Error recording production:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}
  // Get production by employee and date range
  async getEmployeeProduction(req, res) {
    try {
      const { employeeId } = req.params;
      const { startDate, endDate, status, page = 1, limit = 50 } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'startDate and endDate are required'
        });
      }
      
      const query = {
        EmployeeID: employeeId,
        Date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
      
      if (status) {
        query.Status = status;
      }
      
      const skip = (page - 1) * limit;
      
      const productions = await Production.find(query)
        .populate('EmployeeID', 'EmployeeID FirstName LastName')
        .populate('VerifiedBy', 'EmployeeID FirstName LastName')
        .populate('ApprovedBy', 'EmployeeID FirstName LastName')
        //  Optionally populate rateMasterId if you want to show rate details
        // .populate('rateMasterId', 'productType operation ratePerUnit uom')
        .sort({ Date: -1 })
        .limit(parseInt(limit))
        .skip(skip);
      
      const total = await Production.countDocuments(query);
      
      // Calculate totals
      const totals = await Production.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalUnits: { $sum: '$TotalUnits' },
            goodUnits: { $sum: '$GoodUnits' },
            rejectedUnits: { $sum: '$RejectedUnits' },
            totalAmount: { $sum: '$TotalAmount' },
            totalDailyEarning: { $sum: '$DailyEarning' }, 
            qualityBonus: { $sum: '$QualityBonus' },
            efficiencyBonus: { $sum: '$EfficiencyBonus' },
            count: { $sum: 1 }
          }
        }
      ]);
      
      const summary = totals[0] || {
        totalUnits: 0,
        goodUnits: 0,
        rejectedUnits: 0,
        totalAmount: 0,
        qualityBonus: 0,
        totalDailyEarning: 0, 
        efficiencyBonus: 0,
        count: 0
      };
      
      return res.json({
        success: true,
        count: productions.length,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        summary: {
          ...summary,
          rejectionRate: summary.totalUnits > 0 ? (summary.rejectedUnits / summary.totalUnits) * 100 : 0,
          averageQuality: summary.totalUnits > 0 ? (summary.goodUnits / summary.totalUnits) * 100 : 0
        },
        data: productions
      });
      
    } catch (error) {
      console.error('Error getting employee production:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Get all pending productions with optional filters
  async getPendingProductions(req, res) {
    try {
      const { 
        page = 1, 
        limit = 50, 
        startDate, 
        endDate, 
        departmentId,
        employeeId,
        searchTerm 
      } = req.query;
      
      const query = {};
      
      // Date range filter
      if (startDate || endDate) {
        query.Date = {};
        if (startDate) query.Date.$gte = new Date(startDate);
        if (endDate) query.Date.$lte = new Date(endDate);
      }
      
      // Employee filter
      if (employeeId) {
        query.EmployeeID = employeeId;
      }
      
      // Department filter
      let employeeIds = [];
      if (departmentId) {
        const employees = await Employee.find({ DepartmentID: departmentId }).select('_id');
        employeeIds = employees.map(emp => emp._id);
        if (employeeIds.length > 0) {
          query.EmployeeID = { $in: employeeIds };
        } else {
          return res.json({
            success: true,
            count: 0,
            total: 0,
            totalPages: 0,
            currentPage: parseInt(page),
            data: []
          });
        }
      }
      
      // Search by employee name or product
      if (searchTerm) {
        const aggregationPipeline = [
          {
            $lookup: {
              from: 'employees',
              localField: 'EmployeeID',
              foreignField: '_id',
              as: 'employee'
            }
          },
          { $unwind: '$employee' },
          {
            $match: {
              $or: [
                { 'ProductCode': { $regex: searchTerm, $options: 'i' } },
                { 'ProductName': { $regex: searchTerm, $options: 'i' } },
                { 'Operation': { $regex: searchTerm, $options: 'i' } },
                { 'employee.FirstName': { $regex: searchTerm, $options: 'i' } },
                { 'employee.LastName': { $regex: searchTerm, $options: 'i' } },
                { 'employee.EmployeeID': { $regex: searchTerm, $options: 'i' } },
                { 'BatchNumber': { $regex: searchTerm, $options: 'i' } },
                { 'OrderNumber': { $regex: searchTerm, $options: 'i' } }
              ]
            }
          },
          { $sort: { Date: -1 } },
          { $skip: (page - 1) * limit },
          { $limit: parseInt(limit) },
          {
            $project: {
              'employee.password': 0
            }
          }
        ];
        
        const countPipeline = [
          { $match: { Status: 'Pending' } },
          {
            $lookup: {
              from: 'employees',
              localField: 'EmployeeID',
              foreignField: '_id',
              as: 'employee'
            }
          },
          { $unwind: '$employee' },
          {
            $match: {
              $or: [
                { 'ProductCode': { $regex: searchTerm, $options: 'i' } },
                { 'ProductName': { $regex: searchTerm, $options: 'i' } },
                { 'Operation': { $regex: searchTerm, $options: 'i' } },
                { 'employee.FirstName': { $regex: searchTerm, $options: 'i' } },
                { 'employee.LastName': { $regex: searchTerm, $options: 'i' } },
                { 'employee.EmployeeID': { $regex: searchTerm, $options: 'i' } }
              ]
            }
          },
          { $count: 'total' }
        ];
        
        const [productions, countResult] = await Promise.all([
          Production.aggregate(aggregationPipeline),
          Production.aggregate(countPipeline)
        ]);
        
        const total = countResult[0]?.total || 0;
        
        return res.json({
          success: true,
          count: productions.length,
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          data: productions
        });
      }
      
      // Regular query without search
      const skip = (page - 1) * limit;
      
      const productions = await Production.find(query)
        .populate('EmployeeID', 'EmployeeID FirstName LastName DepartmentID DesignationID')
        .populate('CreatedBy', 'EmployeeID FirstName LastName')
        .sort({ Date: -1 })
        .limit(parseInt(limit))
        .skip(skip);
      
      const total = await Production.countDocuments(query);
      
      // Get summary statistics for pending productions
      const summary = await Production.aggregate([
        { $match: { Status: 'Pending' } },
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            totalUnits: { $sum: '$TotalUnits' },
            totalGoodUnits: { $sum: '$GoodUnits' },
            totalRejectedUnits: { $sum: '$RejectedUnits' },
            totalAmount: { $sum: '$TotalAmount' },
            avgQuality: { $avg: '$QualityPercentage' }
          }
        }
      ]);
      
      return res.json({
        success: true,
        count: productions.length,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        summary: summary[0] || {
          totalRecords: 0,
          totalUnits: 0,
          totalGoodUnits: 0,
          totalRejectedUnits: 0,
          totalAmount: 0,
          avgQuality: 0
        },
        data: productions
      });
      
    } catch (error) {
      console.error('Error getting pending productions:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Approve production entry
  async approveProduction(req, res) {
    try {
      const { id } = req.params;
      const { status, remarks } = req.body;
      
      if (!['Verified', 'Approved', 'Rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status must be Verified, Approved, or Rejected'
        });
      }
      
      const production = await Production.findById(id);
      
      if (!production) {
        return res.status(404).json({
          success: false,
          message: 'Production record not found'
        });
      }
      
      // Update based on status
      if (status === 'Verified') {
        production.Status = 'Verified';
        production.VerifiedBy = req.user?._id;
        production.VerificationTime = new Date();
      } else if (status === 'Approved') {
        production.Status = 'Approved';
        production.ApprovedBy = req.user?._id;
        production.ApprovalTime = new Date();
      } else {
        production.Status = 'Rejected';
      }
      
      if (remarks) {
        production.Remarks = production.Remarks 
          ? `${production.Remarks}; ${remarks}` 
          : remarks;
      }
      
      production.UpdatedBy = req.user?._id;
      await production.save();
      
      return res.json({
        success: true,
        message: `Production ${status.toLowerCase()} successfully`,
        data: production
      });
      
    } catch (error) {
      console.error('Error approving production:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Bulk production entry (for supervisors)
  async bulkRecordProduction(req, res) {
    try {
      const { productions } = req.body;
      
      if (!Array.isArray(productions) || productions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Productions array is required'
        });
      }
      
      const results = [];
      const errors = [];
      
      for (const prod of productions) {
        try {
          //  FETCH ACTIVE RATE FOR EACH PRODUCTION
          const activeRate = await PieceRateMaster.findOne({
            productType: prod.productName,
            operation: prod.operation,
            effectiveFrom: { $lte: new Date(prod.date || new Date()) },
            $or: [
              { effectiveTo: { $gte: new Date(prod.date || new Date()) } },
              { effectiveTo: null }
            ],
            isActive: true
          });

          if (!activeRate) {
            throw new Error(`No active rate found for ${prod.productName} - ${prod.operation}`);
          }

          const production = new Production({
            ...prod,
            Date: prod.date ? new Date(prod.date) : new Date(),
            RatePerUnit: activeRate.ratePerUnit,  // Use rate from master
            rateMasterId: activeRate._id,         // Link to master
            Status: 'Pending',
            CreatedBy: req.user?._id
          });
          
          await production.save();
          results.push(production._id);
        } catch (error) {
          errors.push({
            data: prod,
            error: error.message
          });
        }
      }
      
      return res.json({
        success: true,
        message: `Bulk production recorded. Success: ${results.length}, Errors: ${errors.length}`,
        processed: results.length,
        failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined
      });
      
    } catch (error) {
      console.error('Error in bulk production:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Get production summary for payroll
  async getProductionForPayroll(req, res) {
    try {
      const { employeeId, month, year } = req.query;
      
      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: 'Month and year are required'
        });
      }
      
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      
      const query = {
        Date: {
          $gte: startDate,
          $lte: endDate
        },
        Status: { $in: ['Approved', 'Paid'] },
        SalaryProcessed: false
      };
      
      if (employeeId) {
        query.EmployeeID = employeeId;
      }
      
      const productions = await Production.find(query)
        .populate('EmployeeID', 'EmployeeID FirstName LastName EmploymentType')
        //  Optionally populate rateMasterId for rate history
        // .populate('rateMasterId', 'productType operation ratePerUnit uom')
        .sort({ EmployeeID: 1, Date: 1 });
      
      // Group by employee
      const grouped = productions.reduce((acc, prod) => {
        const empId = prod.EmployeeID._id.toString();
        if (!acc[empId]) {
          acc[empId] = {
            employee: prod.EmployeeID,
            productions: [],
            totalUnits: 0,
            goodUnits: 0,
            totalAmount: 0,
            totalDailyEarning: 0, 
            qualityBonus: 0,
            efficiencyBonus: 0,
            totalEarnings: 0
          };
        }
        
        acc[empId].productions.push(prod);
        acc[empId].totalUnits += prod.TotalUnits || 0;
        acc[empId].goodUnits += prod.GoodUnits || 0;
        acc[empId].totalAmount += prod.TotalAmount || 0;
        acc[empId].qualityBonus += prod.QualityBonus || 0;
        acc[empId].totalDailyEarning += prod.DailyEarning || 0; 
        acc[empId].efficiencyBonus += prod.EfficiencyBonus || 0;
        acc[empId].totalEarnings += prod.TotalAmount || 0;
        
        return acc;
      }, {});
      
      return res.json({
        success: true,
        month,
        year,
        totalRecords: productions.length,
        totalEmployees: Object.keys(grouped).length,
        totalEarnings: Object.values(grouped).reduce((sum, emp) => sum + emp.totalEarnings, 0),
        data: grouped
      });
      
    } catch (error) {
      console.error('Error getting production for payroll:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Mark production as paid (link to salary)
 async markAsPaid(req, res) {
  try {
    const { productionIds } = req.body;
    
    if (!Array.isArray(productionIds) || productionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'productionIds is required and must be a non-empty array'
      });
    }
    
    const result = await Production.updateMany(
      { _id: { $in: productionIds } },
      {
        $set: {
          SalaryProcessed: true,
          Status: 'Paid'
        },
        $unset: {
          SalaryID: "" // This will remove the SalaryID field if it exists
        }
      }
    );
    
    return res.json({
      success: true,
      message: `${result.modifiedCount} production records marked as paid`,
      modifiedCount: result.modifiedCount
    });
    
  } catch (error) {
    console.error('Error marking production as paid:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}
}

module.exports = new ProductionController();