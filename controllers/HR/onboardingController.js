// controllers/onboardingController.js
const EmployeeOnboarding = require('../../models/HR/EmployeeOnboarding');
const Employee = require('../../models/HR/Employee');
const mongoose = require('mongoose');

// @desc    Create Onboarding Record
// @route   POST /api/onboarding/create
// @access  Private (HR, Admin)
const createOnboarding = async (req, res) => {
  try {
    const { employeeId, joiningDate, department, reportingManager, workLocation } = req.body;

    // Validate required fields
    if (!employeeId || !joiningDate || !department || !workLocation) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: employeeId, joiningDate, department, workLocation are required'
      });
    }

    // Check if employee exists
    let employee;
    
    // Find employee by ID or EmployeeID
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

    // Check if onboarding already exists for this employee
    const existingOnboarding = await EmployeeOnboarding.findOne({ 
      employeeId: employee._id,
      status: { $in: ['PENDING', 'IN_PROGRESS'] }
    });

    if (existingOnboarding) {
      return res.status(400).json({
        success: false,
        message: 'Active onboarding record already exists for this employee',
        data: {
          onboardingId: existingOnboarding._id,
          status: existingOnboarding.status
        }
      });
    }

    // Validate reporting manager if provided
    let reportingManagerId = null;
    if (reportingManager) {
      let manager;
      if (mongoose.Types.ObjectId.isValid(reportingManager)) {
        manager = await Employee.findById(reportingManager);
      } else {
        manager = await Employee.findOne({ EmployeeID: reportingManager });
      }

      if (!manager) {
        return res.status(404).json({
          success: false,
          message: 'Reporting manager not found'
        });
      }
   
      
      reportingManagerId = manager._id;
    }

    // Create onboarding record
    const onboarding = await EmployeeOnboarding.create({
      employeeId: employee._id,
      joiningDate: new Date(joiningDate),
      department,
      reportingManager: reportingManagerId,
      workLocation,
      status: 'PENDING',
      createdBy: req.user._id
    });

    // Populate references
    await onboarding.populate([
      { path: 'employeeId', select: 'EmployeeID FirstName LastName Email DesignationID' },
      { path: 'reportingManager', select: 'EmployeeID FirstName LastName DesignationID' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Onboarding record created successfully',
      data: {
        onboardingId: onboarding._id,
        employeeId: onboarding.employeeId.EmployeeID,
        employeeName: `${onboarding.employeeId.FirstName} ${onboarding.employeeId.LastName}`,
        joiningDate: onboarding.joiningDate,
        department: onboarding.department,
        reportingManager: onboarding.reportingManager ? {
          id: onboarding.reportingManager.EmployeeID,
          name: `${onboarding.reportingManager.FirstName} ${onboarding.reportingManager.LastName}`
        } : null,
        workLocation: onboarding.workLocation,
        status: onboarding.status,
        createdAt: onboarding.createdAt
      }
    });

  } catch (error) {
    console.error('Create onboarding error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get Onboarding Details
// @route   GET /api/onboarding/:employeeId
// @access  Private (HR, Admin, Employee themselves)
const getOnboardingDetails = async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Find employee
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

    // Find onboarding record
    const onboarding = await EmployeeOnboarding.findOne({ employeeId: employee._id })
      .populate('employeeId', 'EmployeeID FirstName LastName Email Phone DesignationID DateOfJoining')
      .populate('reportingManager', 'EmployeeID FirstName LastName DesignationID Email')
      .populate('createdBy', 'name email');

    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'No onboarding record found for this employee'
      });
    }

    res.json({
      success: true,
      data: {
        onboardingId: onboarding._id,
        employee: {
          id: onboarding.employeeId.EmployeeID,
          name: `${onboarding.employeeId.FirstName} ${onboarding.employeeId.LastName}`,
          email: onboarding.employeeId.Email,
          phone: onboarding.employeeId.Phone,
          designation: onboarding.employeeId.DesignationID,
          dateOfJoining: onboarding.employeeId.DateOfJoining
        },
        joiningDate: onboarding.joiningDate,
        department: onboarding.department,
        reportingManager: onboarding.reportingManager ? {
          id: onboarding.reportingManager.EmployeeID,
          name: `${onboarding.reportingManager.FirstName} ${onboarding.reportingManager.LastName}`,
          email: onboarding.reportingManager.Email,
          designation: onboarding.reportingManager.DesignationID
        } : null,
        workLocation: onboarding.workLocation,
        status: onboarding.status,
        notes: onboarding.notes,
        createdBy: onboarding.createdBy?.name || 'System',
        createdAt: onboarding.createdAt,
        updatedAt: onboarding.updatedAt,
        completedAt: onboarding.completedAt
      }
    });

  } catch (error) {
    console.error('Get onboarding details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Update Onboarding Status
// @route   PUT /api/onboarding/update-status/:employeeId
// @access  Private (HR, Admin)
const updateOnboardingStatus = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { status, notes } = req.body;

    // Validate status
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'HOLD', 'CANCELLED'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Find employee
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

    // Find onboarding record
    const onboarding = await EmployeeOnboarding.findOne({ employeeId: employee._id });

    if (!onboarding) {
      return res.status(404).json({
        success: false,
        message: 'No onboarding record found for this employee'
      });
    }

    // Check if already completed and trying to change
    if (onboarding.status === 'COMPLETED' && status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot change status of completed onboarding'
      });
    }

    // Update status
    const oldStatus = onboarding.status;
    onboarding.status = status;
    
    // If status is COMPLETED, set completedAt
    if (status === 'COMPLETED') {
      onboarding.completedAt = new Date();
    }
    
    // Add notes if provided
    if (notes) {
      onboarding.notes = notes;
    }

    await onboarding.save();

    // Populate for response
    await onboarding.populate([
      { path: 'employeeId', select: 'EmployeeID FirstName LastName' },
      { path: 'reportingManager', select: 'EmployeeID FirstName LastName' }
    ]);

    res.json({
      success: true,
      message: `Onboarding status updated from ${oldStatus} to ${status}`,
      data: {
        onboardingId: onboarding._id,
        employeeId: onboarding.employeeId.EmployeeID,
        employeeName: `${onboarding.employeeId.FirstName} ${onboarding.employeeId.LastName}`,
        oldStatus,
        newStatus: onboarding.status,
        completedAt: onboarding.completedAt,
        notes: onboarding.notes,
        updatedAt: onboarding.updatedAt
      }
    });

  } catch (error) {
    console.error('Update onboarding status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

module.exports = {
  createOnboarding,
  getOnboardingDetails,
  updateOnboardingStatus
};