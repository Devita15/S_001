const Leave = require('../../models/HR/Leave');
const LeaveType = require('../../models/HR/LeaveType');
const Employee = require('../../models/HR/Employee');
const AttendanceProcessed = require('../../models/HR/AttendanceProcessed');
const mongoose = require('mongoose');

// Calculate leave days function - Modified to include ALL days (including weekends)
const calculateLeaveDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Reset time part for accurate calculation
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  
  // Calculate difference in days (including both start and end dates)
  const timeDiff = end.getTime() - start.getTime();
  const days = Math.round(timeDiff / (1000 * 3600 * 24)) + 1;
  
  return days;
};

// Apply for leave
const applyLeave = async (req, res) => {
  try {
    const {
      employeeId,      
      leaveTypeId,
      startDate,
      endDate,
      reason,
      contactNumber,
      addressDuringLeave
    } = req.body;
    
      console.log('Received request body:', req.body);
    console.log('employeeId:', employeeId);
    console.log('leaveTypeId:', leaveTypeId);
    console.log('startDate:', startDate);
    console.log('endDate:', endDate);
    
    // Validate required fields - now includes employeeId
    if (!employeeId || !leaveTypeId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'employeeId, leaveTypeId, startDate, and endDate are required'
      });
    }
    
    // Check if employee exists
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Check if leave type exists and is active
    const leaveType = await LeaveType.findById(leaveTypeId);
    if (!leaveType || !leaveType.IsActive) {
      return res.status(400).json({
        success: false,
        message: 'Leave type not found or inactive'
      });
    }
    
    // Convert dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    
    // Validate dates
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be after end date'
      });
    }
    
    // Validate future dates (optional)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start < today) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be in the past'
      });
    }
    
    // Calculate number of leave days (excluding weekends)
    const leaveDays = calculateLeaveDays(start, end);
    
    // Check leave balance
    const availableBalance = await checkLeaveBalance(employeeId, leaveTypeId, leaveDays);
    if (!availableBalance) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient leave balance'
      });
    }
    
    // Check for overlapping leaves
    const overlappingLeave = await Leave.findOne({
      EmployeeID: employeeId,
      Status: { $in: ['Pending', 'Approved'] },
      $or: [
        { StartDate: { $lte: end }, EndDate: { $gte: start } }
      ]
    });
    
    if (overlappingLeave) {
      return res.status(400).json({
        success: false,
        message: 'You already have a leave request for these dates'
      });
    }
    
    // Create leave record
    const leave = new Leave({
      EmployeeID: employeeId,
      LeaveTypeID: leaveTypeId,
      StartDate: start,
      EndDate: end,
      Reason: reason,
      ContactNumber: contactNumber,
      AddressDuringLeave: addressDuringLeave,
      NumberOfDays: leaveDays,
      Status: 'Pending',
      AppliedOn: new Date(),
      AppliedBy: req.user?._id || null // Optional: still track who applied if user is authenticated
    });
    
    await leave.save();
    
    // Populate employee and leave type details
    await leave.populate('EmployeeID', 'EmployeeID FirstName LastName DesignationID DepartmentID');
    await leave.populate('LeaveTypeID', 'Name MaxDaysPerYear');
    
    return res.status(201).json({
      success: true,
      message: 'Leave application submitted successfully',
      data: leave
    });
    
  } catch (error) {
    console.error('Error applying leave:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update pending leave
const updateLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      leaveTypeId,
      startDate,
      endDate,
      reason,
      contactNumber,
      addressDuringLeave
    } = req.body;

    // Find the leave request
    const leave = await Leave.findById(id)
      .populate('EmployeeID')
      .populate('LeaveTypeID');

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    // Check if leave is still pending
    if (leave.Status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot update leave request with status: ${leave.Status}`
      });
    }

    // Store original values for comparison
    const originalStartDate = leave.StartDate;
    const originalEndDate = leave.EndDate;
    const originalLeaveTypeId = leave.LeaveTypeID._id;

    // Update fields if provided
    if (leaveTypeId && leaveTypeId !== originalLeaveTypeId.toString()) {
      // Check if new leave type exists and is active
      const leaveType = await LeaveType.findById(leaveTypeId);
      if (!leaveType || !leaveType.IsActive) {
        return res.status(400).json({
          success: false,
          message: 'Leave type not found or inactive'
        });
      }
      leave.LeaveTypeID = leaveTypeId;
    }

    // Convert and validate dates if provided
    if (startDate || endDate) {
      const newStartDate = startDate ? new Date(startDate) : leave.StartDate;
      const newEndDate = endDate ? new Date(endDate) : leave.EndDate;

      newStartDate.setHours(0, 0, 0, 0);
      newEndDate.setHours(23, 59, 59, 999);

      // Validate dates
      if (newStartDate > newEndDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date cannot be after end date'
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (newStartDate < today) {
        return res.status(400).json({
          success: false,
          message: 'Start date cannot be in the past'
        });
      }

      // Check for overlapping leaves (excluding current leave)
      const overlappingLeave = await Leave.findOne({
        EmployeeID: leave.EmployeeID._id,
        _id: { $ne: id },
        Status: { $in: ['Pending', 'Approved'] },
        $or: [
          { StartDate: { $lte: newEndDate }, EndDate: { $gte: newStartDate } }
        ]
      });

      if (overlappingLeave) {
        return res.status(400).json({
          success: false,
          message: 'You already have another leave request for these dates'
        });
      }

      leave.StartDate = newStartDate;
      leave.EndDate = newEndDate;
      
      // Recalculate number of days
      const newNumberOfDays = calculateLeaveDays(newStartDate, newEndDate);
      
      // Check leave balance if dates changed
      if (newNumberOfDays !== leave.NumberOfDays) {
        const availableBalance = await checkLeaveBalance(
          leave.EmployeeID._id, 
          leave.LeaveTypeID._id || leaveTypeId, 
          newNumberOfDays
        );
        
        if (!availableBalance) {
          return res.status(400).json({
            success: false,
            message: 'Insufficient leave balance for updated dates'
          });
        }
        
        leave.NumberOfDays = newNumberOfDays;
      }
    }

    // Update other fields if provided
    if (reason !== undefined) leave.Reason = reason;
    if (contactNumber !== undefined) leave.ContactNumber = contactNumber;
    if (addressDuringLeave !== undefined) leave.AddressDuringLeave = addressDuringLeave;

    // Save the updated leave
    await leave.save();

    // Populate the response
    await leave.populate('EmployeeID', 'EmployeeID FirstName LastName DesignationID DepartmentID');
    await leave.populate('LeaveTypeID', 'Name MaxDaysPerYear');

    return res.json({
      success: true,
      message: 'Leave request updated successfully',
      data: leave
    });

  } catch (error) {
    console.error('Error updating leave:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Delete pending leave
const deleteLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Find the leave request
    const leave = await Leave.findById(id);

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    // Check if leave is still pending
    if (leave.Status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot delete leave request with status: ${leave.Status}`
      });
    }

    // Option 1: Permanently delete the leave
    await Leave.findByIdAndDelete(id);

    // Option 2: Soft delete by updating status to 'Cancelled' (uncomment if preferred)
    /*
    leave.Status = 'Cancelled';
    leave.CancelledOn = new Date();
    leave.CancelRemarks = reason || 'Deleted by user';
    await leave.save();
    
    return res.json({
      success: true,
      message: 'Leave request cancelled successfully',
      data: leave
    });
    */

    return res.json({
      success: true,
      message: 'Leave request deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting leave:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};


const processLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks, approvedBy } = req.body;
    
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be Approved or Rejected'
      });
    }
    
    const leave = await Leave.findById(id)
      .populate('EmployeeID')
      .populate('LeaveTypeID');
    
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }
    
    // Check if already processed
    if (leave.Status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Leave request is already ${leave.Status}`
      });
    }
    
    // Store employee and leave type IDs for later use
    const employeeId = leave.EmployeeID._id;
    const leaveTypeId = leave.LeaveTypeID._id;
    const numberOfDays = leave.NumberOfDays;
    
    // Update leave status
    leave.Status = status;
    leave.ProcessedBy = approvedBy || req.user?._id;
    leave.ProcessedOn = new Date();
    leave.ProcessRemarks = remarks;
    
    await leave.save();
    
    // If approved, update attendance records and leave balance
    if (status === 'Approved') {
      await updateAttendanceForLeave(leave);
      
      // Update employee leave balance
      await updateLeaveBalance(employeeId, leaveTypeId, numberOfDays);
    }
    
    // Re-fetch the leave with updated employee data
    const updatedLeave = await Leave.findById(id)
      .populate({
        path: 'EmployeeID',
        select: '-password -refreshToken' // Exclude sensitive fields if any
      })
      .populate('LeaveTypeID')
      .populate('ProcessedBy', 'FirstName LastName EmployeeID');
    
    return res.json({
      success: true,
      message: `Leave request ${status.toLowerCase()} successfully`,
      data: updatedLeave
    });
    
  } catch (error) {
    console.error('Error processing leave:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get leaves for employee
const getEmployeeLeaves = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { 
      status, 
      startDate, 
      endDate, 
      page = 1, 
      limit = 20 
    } = req.query;
    
    const query = { EmployeeID: employeeId };
    
    if (status) {
      query.Status = status;
    }
    
    if (startDate && endDate) {
      query.StartDate = { $gte: new Date(startDate) };
      query.EndDate = { $lte: new Date(endDate) };
    }
    
    const skip = (page - 1) * limit;
    
    const leaves = await Leave.find(query)
      .populate('EmployeeID', 'EmployeeID FirstName LastName DesignationID')
      .populate('LeaveTypeID', 'Name Description')
      .populate('ProcessedBy', 'FirstName LastName')
      .sort({ AppliedOn: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await Leave.countDocuments(query);
    
    // Calculate leave summary
    const summary = await Leave.aggregate([
      { $match: { EmployeeID: new mongoose.Types.ObjectId(employeeId) } },
      {
        $group: {
          _id: '$Status',
          count: { $sum: 1 },
          totalDays: { $sum: '$NumberOfDays' }
        }
      }
    ]);
    
    // Get leave balance
    const leaveBalance = await getLeaveBalances(employeeId);
    
    return res.json({
      success: true,
      count: leaves.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      summary: summary.reduce((acc, item) => {
        acc[item._id] = { count: item.count, totalDays: item.totalDays };
        return acc;
      }, {}),
      leaveBalance,
      data: leaves
    });
    
  } catch (error) {
    console.error('Error getting employee leaves:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get pending leaves for manager approval
const getPendingLeaves = async (req, res) => {
  try {
    const { 
      departmentId, 
      employeeId, 
      page = 1, 
      limit = 20 
    } = req.query;
    
    let query = { Status: 'Pending' };
    
    // If departmentId provided, get employees in that department
    if (departmentId) {
      const employees = await Employee.find({ DepartmentID: departmentId }).select('_id');
      query.EmployeeID = { $in: employees.map(e => e._id) };
    }
    
    if (employeeId) {
      query.EmployeeID = employeeId;
    }
    
    const skip = (page - 1) * limit;
    
    const leaves = await Leave.find(query)
      .populate({
        path: 'EmployeeID',
        select: 'EmployeeID FirstName LastName DesignationID DepartmentID',
        populate: [
          { path: 'DepartmentID', select: 'DepartmentName' },
          { path: 'DesignationID', select: 'DesignationName' }
        ]
      })
      .populate('LeaveTypeID', 'Name MaxDaysPerYear')
      .sort({ AppliedOn: 1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await Leave.countDocuments(query);
    
    return res.json({
      success: true,
      count: leaves.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: leaves
    });
    
  } catch (error) {
    console.error('Error getting pending leaves:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Cancel leave request
const cancelLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const leave = await Leave.findById(id);
    
    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }
    
    // Only pending leaves can be cancelled by employee
    if (leave.Status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel ${leave.Status.toLowerCase()} leave request`
      });
    }
    
    // Mark as cancelled
    leave.Status = 'Cancelled';
    leave.CancelledOn = new Date();
    leave.CancelRemarks = reason;
    
    await leave.save();
    
    return res.json({
      success: true,
      message: 'Leave request cancelled successfully',
      data: leave
    });
    
  } catch (error) {
    console.error('Error cancelling leave:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get leave balance for employee
const getLeaveBalance = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const balance = await getLeaveBalances(employeeId);
    
    return res.json({
      success: true,
      data: balance
    });
    
  } catch (error) {
    console.error('Error getting leave balance:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Generate leave report
const getLeaveReport = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      departmentId, 
      status,
      format = 'json' 
    } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required'
      });
    }
    
    const query = {
      StartDate: { $gte: new Date(startDate) },
      EndDate: { $lte: new Date(endDate) }
    };
    
    if (status) {
      query.Status = status;
    }
    
    if (departmentId) {
      const employees = await Employee.find({ DepartmentID: departmentId }).select('_id');
      query.EmployeeID = { $in: employees.map(e => e._id) };
    }
    
    const leaves = await Leave.find(query)
      .populate({
        path: 'EmployeeID',
        select: 'EmployeeID FirstName LastName DesignationID DepartmentID',
        populate: [
          { path: 'DepartmentID', select: 'DepartmentName' },
          { path: 'DesignationID', select: 'DesignationName' }
        ]
      })
      .populate('LeaveTypeID', 'Name')
      .populate('ProcessedBy', 'FirstName LastName')
      .sort({ StartDate: 1 });
    
    // Calculate summary
    const summary = await Leave.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalLeaves: { $sum: 1 },
          totalDays: { $sum: '$NumberOfDays' },
          avgDays: { $avg: '$NumberOfDays' }
        }
      }
    ]);
    
    const departmentSummary = await Leave.aggregate([
      { $match: query },
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
          totalLeaves: { $sum: 1 },
          totalDays: { $sum: '$NumberOfDays' },
          employees: { $addToSet: '$employee.EmployeeID' }
        }
      }
    ]);
    
    const result = {
      period: `${startDate} to ${endDate}`,
      summary: summary[0] || { totalLeaves: 0, totalDays: 0, avgDays: 0 },
      departmentSummary,
      leaves
    };
    
    if (format === 'csv') {
      // Convert to CSV (simplified)
      const csv = convertToCSV(leaves);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=leave_report_${startDate}_${endDate}.csv`);
      return res.send(csv);
    }
    
    return res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Error generating leave report:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Helper function to check leave balance
const checkLeaveBalance = async (employeeId, leaveTypeId, requestedDays) => {
  try {
    // Get total approved leaves for the year
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const endOfYear = new Date(new Date().getFullYear(), 11, 31);
    
    const approvedLeaves = await Leave.find({
      EmployeeID: employeeId,
      LeaveTypeID: leaveTypeId,
      Status: 'Approved',
      StartDate: { $gte: startOfYear },
      EndDate: { $lte: endOfYear }
    });
    
    const totalUsedDays = approvedLeaves.reduce((sum, leave) => sum + leave.NumberOfDays, 0);
    
    // Get leave type maximum days
    const leaveType = await LeaveType.findById(leaveTypeId);
    const maxDays = leaveType?.MaxDaysPerYear || 0;
    
    return (totalUsedDays + requestedDays) <= maxDays;
    
  } catch (error) {
    console.error('Error checking leave balance:', error);
    return false;
  }
};

// Helper function to update attendance for leave
const updateAttendanceForLeave = async (leave) => {
  try {
    const { EmployeeID, StartDate, EndDate } = leave;
    
    let currentDate = new Date(StartDate);
    const end = new Date(EndDate);
    
    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay();
      
      // Only update attendance for weekdays
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const dateStart = new Date(currentDate);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(currentDate);
        dateEnd.setHours(23, 59, 59, 999);
        
        const attendance = await AttendanceProcessed.findOne({
          EmployeeID: EmployeeID,
          Date: {
            $gte: dateStart,
            $lte: dateEnd
          }
        });
        
        if (attendance) {
          attendance.Status = 'Leave';
          attendance.LeaveID = leave._id;
          attendance.Remarks = `On ${leave.LeaveTypeID?.Name || 'Leave'}`;
          await attendance.save();
        } else {
          // Create attendance record if not exists
          const newAttendance = new AttendanceProcessed({
            EmployeeID: EmployeeID,
            Date: currentDate,
            Status: 'Leave',
            LeaveID: leave._id,
            AttendanceStatus: 'On-Time',
            Remarks: `On ${leave.LeaveTypeID?.Name || 'Leave'}`
          });
          await newAttendance.save();
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
  } catch (error) {
    console.error('Error updating attendance for leave:', error);
    throw error;
  }
};

const updateLeaveBalance = async (employeeId, leaveTypeId, usedDays) => {
  try {
    console.log(`Updating leave balance for employee ${employeeId}: Used ${usedDays} days of leave type ${leaveTypeId}`);
    
    // Get the leave type to know max days
    const leaveType = await LeaveType.findById(leaveTypeId);
    if (!leaveType) {
      console.error('Leave type not found:', leaveTypeId);
      return false;
    }
    
    const leaveTypeName = leaveType.Name.toLowerCase().replace(/\s+/g, '');
    const maxDays = leaveType.MaxDaysPerYear || 0;
    
    console.log(`Leave type: ${leaveType.Name}, Max days per year: ${maxDays}`);
    
    // Get the current employee
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      console.error('Employee not found:', employeeId);
      return false;
    }
    
    console.log('Current employee LeaveBalances:', employee.LeaveBalances);
    
    // Initialize or update LeaveBalances
    if (!employee.LeaveBalances || Object.keys(employee.LeaveBalances).length === 0) {
      // If no LeaveBalances exist, create with all leave types
      employee.LeaveBalances = {
        casualLeave: 12,        // Default values - adjust as needed
        sickLeave: 6,           // Should match leaveType.MaxDaysPerYear for Sick Leave
        earnedLeave: 15,
        maternityLeave: 180,
        paternityLeave: 15,
        compOff: 0,
        // Add other leave types if needed
      };
      console.log('Created new LeaveBalances for employee');
    } else {
      // Ensure all leave type fields exist
      const defaultBalances = {
        casualLeave: 12,
        sickLeave: 6,
        earnedLeave: 15,
        maternityLeave: 180,
        paternityLeave: 15,
        compOff: 0
      };
      
      // Merge existing balances with defaults (preserve existing values)
      employee.LeaveBalances = { ...defaultBalances, ...employee.LeaveBalances };
      console.log('Ensured all leave balance fields exist');
    }
    
    // Map leave type name to field name
    const leaveTypeMap = {
      'sickleave': 'sickLeave',
      'casualleave': 'casualLeave', 
      'earnedleave': 'earnedLeave',
      'maternityleave': 'maternityLeave',
      'paternityleave': 'paternityLeave',
      'compoff': 'compOff',
      'casual': 'casualLeave',
      'sick': 'sickLeave',
      'earned': 'earnedLeave',
      'maternity': 'maternityLeave',
      'paternity': 'paternityLeave'
    };
    
    const leaveTypeKey = leaveTypeMap[leaveTypeName];
    
    if (!leaveTypeKey) {
      console.error('Unknown leave type:', leaveTypeName);
      // Create a new key based on leave type name
      const newKey = leaveTypeName.charAt(0).toLowerCase() + leaveTypeName.slice(1);
      employee.LeaveBalances[newKey] = maxDays;
      console.log(`Created new leave balance field: ${newKey} with ${maxDays} days`);
    } else {
      // Check if this leave type balance needs initialization
      const currentBalance = employee.LeaveBalances[leaveTypeKey];
      
      // If balance is 0 or undefined, initialize it with max days
      if (currentBalance === 0 || currentBalance === undefined || currentBalance === null) {
        console.log(`Initializing ${leaveTypeKey} with ${maxDays} days (was: ${currentBalance})`);
        employee.LeaveBalances[leaveTypeKey] = maxDays;
      }
      
      console.log(`Before update - ${leaveTypeKey}: ${employee.LeaveBalances[leaveTypeKey]} days`);
      
      // Update balance (subtract used days)
      const newBalance = Math.max(0, employee.LeaveBalances[leaveTypeKey] - usedDays);
      employee.LeaveBalances[leaveTypeKey] = newBalance;
      
      console.log(`After update - ${leaveTypeKey}: ${newBalance} days remaining`);
    }
    
    // Mark LeaveBalances as modified
    employee.markModified('LeaveBalances');
    
    // Save the employee
    await employee.save();
    
    console.log('Updated employee LeaveBalances:', employee.LeaveBalances);
    
    return true;
    
  } catch (error) {
    console.error('Error updating leave balance:', error);
    return false;
  }
};

// Helper function to get leave balances
const getLeaveBalances = async (employeeId) => {
  try {
    // Get all active leave types
    const leaveTypes = await LeaveType.find({ IsActive: true });
    
    const balances = [];
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const endOfYear = new Date(new Date().getFullYear(), 11, 31);
    
    for (const leaveType of leaveTypes) {
      // Get used leaves for this type in current year
      const usedLeaves = await Leave.find({
        EmployeeID: employeeId,
        LeaveTypeID: leaveType._id,
        Status: 'Approved',
        StartDate: { $gte: startOfYear },
        EndDate: { $lte: endOfYear }
      });
      
      const usedDays = usedLeaves.reduce((sum, leave) => sum + (leave.NumberOfDays || 0), 0);
      const remainingDays = Math.max(0, leaveType.MaxDaysPerYear - usedDays);
      
      balances.push({
        leaveTypeId: leaveType._id,
        leaveTypeName: leaveType.Name,
        maxDaysPerYear: leaveType.MaxDaysPerYear,
        usedDays: usedDays,
        remainingDays: remainingDays,
        utilizationPercentage: leaveType.MaxDaysPerYear > 0 ? 
          (usedDays / leaveType.MaxDaysPerYear) * 100 : 0
      });
    }
    
    return balances;
    
  } catch (error) {
    console.error('Error getting leave balances:', error);
    return [];
  }
};

// Helper function to convert data to CSV
const convertToCSV = (data) => {
  if (!data || data.length === 0) return '';
  
  const headers = [
    'Employee ID', 'Employee Name', 'Department', 'Leave Type',
    'Start Date', 'End Date', 'Days', 'Status', 'Applied On', 'Processed On'
  ];
  
  const csvRows = [headers.join(',')];
  
  for (const item of data) {
    const row = [
      `"${item.EmployeeID?.EmployeeID || ''}"`,
      `"${item.EmployeeID?.FirstName || ''} ${item.EmployeeID?.LastName || ''}"`,
      `"${item.EmployeeID?.DepartmentID?.DepartmentName || ''}"`,
      `"${item.LeaveTypeID?.Name || ''}"`,
      `"${item.StartDate.toISOString().split('T')[0]}"`,
      `"${item.EndDate.toISOString().split('T')[0]}"`,
      item.NumberOfDays || 0,
      `"${item.Status}"`,
      `"${item.AppliedOn?.toISOString().split('T')[0] || ''}"`,
      `"${item.ProcessedOn?.toISOString().split('T')[0] || ''}"`
    ];
    csvRows.push(row.join(','));
  }
  
  return csvRows.join('\n');
};

// Export all functions
module.exports = {
  applyLeave,
  processLeave,
  getEmployeeLeaves,
  getPendingLeaves,
  cancelLeave,
  getLeaveBalance,
  getLeaveReport,
  calculateLeaveDays,
  checkLeaveBalance,
  updateLeave,        
  deleteLeave,        
  updateAttendanceForLeave,
  updateLeaveBalance,
  getLeaveBalances,
  convertToCSV
};