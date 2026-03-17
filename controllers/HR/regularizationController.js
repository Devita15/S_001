// controllers/regularizationController.js - FIXED
const Regularization = require('../../models/HR/Regularization');
const AttendanceProcessed = require('../../models/HR/AttendanceProcessed');

class RegularizationController {
  
// Create regularization request
async createRequest(req, res) {
  try {
    const {
      employeeId,
      date,
      requestType,
      requestedIn,
      requestedOut,
      reason,
      supportingDocument
    } = req.body;
    
    console.log('Creating regularization request:', {
      employeeId,
      date,
      requestType,
      reason
    });
    
    if (!employeeId || !date || !requestType || !reason) {
      return res.status(400).json({
        success: false,
        message: 'employeeId, date, requestType, and reason are required'
      });
    }
    
    // Parse the date
    const requestDate = new Date(date);
    
    // Set time to midnight for accurate date comparison
    requestDate.setHours(0, 0, 0, 0);
    
    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Validate that date is not in the future
    if (requestDate > today) {
      return res.status(400).json({
        success: false,
        message: 'Regularization cannot be requested for future dates'
      });
    }
    
    // Optional: Add validation for maximum past days (e.g., can't request for dates older than 30 days)
    const maxPastDays = 30; // Configure as needed
    const pastDateLimit = new Date();
    pastDateLimit.setDate(pastDateLimit.getDate() - maxPastDays);
    pastDateLimit.setHours(0, 0, 0, 0);
    
    if (requestDate < pastDateLimit) {
      return res.status(400).json({
        success: false,
        message: `Regularization cannot be requested for dates older than ${maxPastDays} days`
      });
    }
    
    // Validate requestedIn and requestedOut based on requestType
    if (requestType === 'correct-time' || requestType === 'missed-punch') {
      // For missed-punch, at least one of requestedIn or requestedOut should be provided
      if (requestType === 'missed-punch' && !requestedIn && !requestedOut) {
        return res.status(400).json({
          success: false,
          message: 'At least one of RequestedIn or RequestedOut is required for missed-punch requests'
        });
      }
      
      // For correct-time, both are required
      if (requestType === 'correct-time' && (!requestedIn || !requestedOut)) {
        return res.status(400).json({
          success: false,
          message: 'Both RequestedIn and RequestedOut are required for correct-time requests'
        });
      }
      
      // Validate requestedIn if provided
      if (requestedIn) {
        const inTime = new Date(requestedIn);
        
        // Check if it's a valid date
        if (isNaN(inTime.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid RequestedIn format'
          });
        }
        
        // Validate that the time is on the same day as the request date
        const inDate = new Date(requestedIn);
        inDate.setHours(0, 0, 0, 0);
        
        if (inDate.getTime() !== requestDate.getTime()) {
          return res.status(400).json({
            success: false,
            message: 'RequestedIn must be on the same date as the regularization date'
          });
        }
      }
      
      // Validate requestedOut if provided
      if (requestedOut) {
        const outTime = new Date(requestedOut);
        
        // Check if it's a valid date
        if (isNaN(outTime.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid RequestedOut format'
          });
        }
        
        // Validate that the time is on the same day as the request date
        const outDate = new Date(requestedOut);
        outDate.setHours(0, 0, 0, 0);
        
        if (outDate.getTime() !== requestDate.getTime()) {
          return res.status(400).json({
            success: false,
            message: 'RequestedOut must be on the same date as the regularization date'
          });
        }
      }
      
      // If both requestedIn and requestedOut are provided, validate that out is after in
      if (requestedIn && requestedOut) {
        const inTime = new Date(requestedIn);
        const outTime = new Date(requestedOut);
        
        if (outTime <= inTime) {
          return res.status(400).json({
            success: false,
            message: 'RequestedOut must be after RequestedIn'
          });
        }
      }
    }
    
    // Check if request already exists for the date (including date range validation)
    const existingRequest = await Regularization.findOne({
      EmployeeID: employeeId,
      Date: {
        $gte: requestDate,
        $lt: new Date(requestDate.getTime() + 24 * 60 * 60 * 1000) // Next day
      },
      Status: 'Pending'
    });
    
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'Pending request already exists for this date'
      });
    }
    
    const regularization = new Regularization({
      EmployeeID: employeeId,
      Date: requestDate, // Use the validated date
      RequestType: requestType,
      RequestedIn: requestedIn ? new Date(requestedIn) : null,
      RequestedOut: requestedOut ? new Date(requestedOut) : null,
      Reason: reason,
      SupportingDocument: supportingDocument,
      Status: 'Pending'
    });
    
    await regularization.save();
    
    console.log('Regularization request created:', regularization._id);
    
    return res.status(201).json({
      success: true,
      message: 'Regularization request submitted successfully',
      data: regularization
    });
    
  } catch (error) {
    console.error('Error in createRequest:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}
  
  
  
  // Get regularization requests
  async getRequests(req, res) {
    try {
      const { employeeId, status, startDate, endDate } = req.query;
      
      console.log('Getting regularization requests with filters:', {
        employeeId,
        status,
        startDate,
        endDate
      });
      
      let query = {};
      
      if (employeeId) {
        query.EmployeeID = employeeId;
      }
      
      if (status) {
        query.Status = status;
      }
      
      if (startDate && endDate) {
        query.Date = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }
      
      const requests = await Regularization.find(query)
        .populate('EmployeeID', 'EmployeeID FirstName LastName')
        .populate('ApproverID', 'EmployeeID FirstName LastName')
        .sort({ CreatedAt: -1 });
      
      console.log(`Found ${requests.length} regularization requests`);
      
      return res.json({
        success: true,
        count: requests.length,
        data: requests
      });
      
    } catch (error) {
      console.error('Error in getRequests:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Approve/reject regularization request
  async updateRequestStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, remarks } = req.body;
      
      console.log('Updating regularization status:', {
        id,
        status,
        remarks
      });
      
      if (!['Approved', 'Rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status must be either Approved or Rejected'
        });
      }
      
      const regularization = await Regularization.findById(id)
        .populate('EmployeeID');
      
      if (!regularization) {
        return res.status(404).json({
          success: false,
          message: 'Regularization request not found'
        });
      }
      
      if (regularization.Status !== 'Pending') {
        return res.status(400).json({
          success: false,
          message: `Request is already ${regularization.Status}`
        });
      }
      
      // Update regularization request
      regularization.Status = status;
      regularization.ApproverID = req.user?._id;
      regularization.ApprovedAt = new Date();
      regularization.ApprovalRemarks = remarks;
      
      await regularization.save();
      
      console.log(`Regularization request ${status}:`, regularization._id);
      
      
      return res.json({
        success: true,
        message: `Request ${status.toLowerCase()} successfully`,
        data: regularization
      });
      
    } catch (error) {
      console.error('Error in updateRequestStatus:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // In your regularizationController.js

// Delete regularization request by ID
async deleteRegularization(req, res) {
  try {
    const { id } = req.params;
    
    console.log('Deleting regularization request:', id);
    
    // Find the regularization request
    const regularization = await Regularization.findById(id);
    
    if (!regularization) {
      return res.status(404).json({
        success: false,
        message: 'Regularization request not found'
      });
    }
    
    // Optional: Check if user has permission to delete
    // For example, only allow deletion if request is still pending
    if (regularization.Status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete request that is already processed'
      });
    }
    
    // Optional: Check if user is the owner or admin
    // const userId = req.user._id;
    // if (regularization.EmployeeID.toString() !== userId.toString() && req.user.role !== 'Admin') {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'You do not have permission to delete this request'
    //   });
    // }
    
    // Delete the regularization request
    await Regularization.findByIdAndDelete(id);
    
    console.log('Regularization request deleted successfully:', id);
    
    return res.json({
      success: true,
      message: 'Regularization request deleted successfully'
    });
    
  } catch (error) {
    console.error('Error in deleteRegularization:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}
  // PRIVATE METHOD: Update attendance after approval
  async updateAttendanceFromRegularization(regularization) {
    try {
      console.log('Updating attendance from regularization:', regularization._id);
      
      // Find or create attendance record
      let attendance = await AttendanceProcessed.findOne({
        EmployeeID: regularization.EmployeeID._id,
        Date: regularization.Date
      });
      
      if (!attendance) {
        console.log('Creating new attendance record');
        attendance = new AttendanceProcessed({
          EmployeeID: regularization.EmployeeID._id,
          Date: regularization.Date,
          Status: 'Present',
          RegularizationStatus: 'Approved',
          RegularizationID: regularization._id,
          Remarks: `Regularized: ${regularization.Reason}`
        });
        
        if (regularization.RequestedIn) {
          attendance.ActualIn = regularization.RequestedIn;
        }
        
        if (regularization.RequestedOut) {
          attendance.ActualOut = regularization.RequestedOut;
        }
      } else {
        console.log('Updating existing attendance record:', attendance._id);
        attendance.RegularizationStatus = 'Approved';
        attendance.RegularizationID = regularization._id;
        
        if (regularization.RequestedIn) {
          attendance.ActualIn = regularization.RequestedIn;
        }
        
        if (regularization.RequestedOut) {
          attendance.ActualOut = regularization.RequestedOut;
        }
        
        attendance.Remarks = attendance.Remarks 
          ? `${attendance.Remarks}; Regularized: ${regularization.Reason}`
          : `Regularized: ${regularization.Reason}`;
      }
      
      await attendance.save();
      console.log('Attendance record saved/updated');
      
      // Recalculate attendance if both times are available
      if (attendance.ActualIn && attendance.ActualOut) {
        console.log('Recalculating attendance metrics...');
        try {
          await attendanceProcessingService.processEmployeeAttendance(
            regularization.EmployeeID._id,
            regularization.Date
          );
          console.log('Attendance recalculated successfully');
        } catch (recalcError) {
          console.warn('Could not recalculate attendance:', recalcError.message);
          // Continue even if recalculation fails
        }
      }
      
      return attendance;
      
    } catch (error) {
      console.error('Error updating attendance from regularization:', error);
      throw error;
    }
  }
  
  // Additional method: Get regularization by ID
  async getRequestById(req, res) {
    try {
      const { id } = req.params;
      
      const regularization = await Regularization.findById(id)
        .populate('EmployeeID', 'EmployeeID FirstName LastName DepartmentID DesignationID')
        .populate('ApproverID', 'EmployeeID FirstName LastName');
      
      if (!regularization) {
        return res.status(404).json({
          success: false,
          message: 'Regularization request not found'
        });
      }
      
      return res.json({
        success: true,
        data: regularization
      });
      
    } catch (error) {
      console.error('Error in getRequestById:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
  
  // Additional method: Cancel regularization request
  async cancelRequest(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      const regularization = await Regularization.findById(id);
      
      if (!regularization) {
        return res.status(404).json({
          success: false,
          message: 'Regularization request not found'
        });
      }
      
      if (regularization.Status !== 'Pending') {
        return res.status(400).json({
          success: false,
          message: `Cannot cancel request that is already ${regularization.Status}`
        });
      }
      
      regularization.Status = 'Cancelled';
      regularization.ApprovalRemarks = reason || 'Cancelled by employee';
      
      await regularization.save();
      
      return res.json({
        success: true,
        message: 'Request cancelled successfully',
        data: regularization
      });
      
    } catch (error) {
      console.error('Error in cancelRequest:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
}

module.exports = new RegularizationController();