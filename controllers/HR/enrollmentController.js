const MediclaimEnrollment = require('../../models/HR/MediclaimEnrollment');
const MediclaimPolicy = require('../../models/HR/MediclaimPolicy');
const Employee = require('../../models/HR/Employee');
const emailService = require('../../services/emailService');
const mongoose = require('mongoose');

exports.enrollEmployee = async (req, res) => {
  try {
    // Use employeeId as MongoDB _id
    const { employeeId, policyId, dependents, nomineeDetails } = req.body;
    
    // Validate MongoDB ID format
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid employee ID format. Must be a valid MongoDB ObjectId'
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(policyId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid policy ID format. Must be a valid MongoDB ObjectId'
      });
    }
    
    console.log('Searching for employee with _id:', employeeId); // Debug log
    
    // Check if employee exists using MongoDB _id
    const employee = await Employee.findById(employeeId);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: `Employee not found with _id: ${employeeId}`
      });
    }
    
    console.log('Found employee:', employee.EmployeeID, employee.FirstName); // Debug log
    
    // Check if policy exists and is active
    const policy = await MediclaimPolicy.findById(policyId);
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }
    
    if (policy.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Policy is not active'
      });
    }
    
    // Check if already enrolled (using employee MongoDB _id as string)
    const existingEnrollment = await MediclaimEnrollment.findOne({
      employeeId: employee._id.toString(), // Store as string or ObjectId?
      policyId,
      status: 'active'
    });
    
    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: 'Employee already enrolled in this policy'
      });
    }
    
    // Validate family members limit
    const children = dependents?.filter(d => ['son', 'daughter'].includes(d.relationship)) || [];
    if (children.length > (policy.familyCoverage?.maxChildren || 2)) {
      return res.status(400).json({
        success: false,
        message: `Policy allows maximum ${policy.familyCoverage?.maxChildren || 2} children only`
      });
    }
    
    // Create enrollment - store employee's MongoDB _id as string
    const enrollment = new MediclaimEnrollment({
      employeeId: employee._id.toString(), // Store MongoDB _id as string
      policyId,
      coverageDetails: {
        amount: policy.coverageAmount,
        type: policy.coverageType,
        startDate: policy.validityStart,
        endDate: policy.validityEnd,
        members: [
          {
            name: `${employee.FirstName} ${employee.LastName}`,
            relationship: 'self',
            gender: employee.Gender,
            dateOfBirth: employee.DateOfBirth,
            age: new Date().getFullYear() - new Date(employee.DateOfBirth).getFullYear()
          },
          ...(dependents || []).map(d => ({
            ...d,
            age: new Date().getFullYear() - new Date(d.dateOfBirth).getFullYear()
          }))
        ]
      },
      premiumPaid: true,
      premiumAmount: policy.premiumDetails?.amountPerEmployee,
      paymentDate: new Date(),
      nomineeDetails: nomineeDetails || [],
      communicationDetails: {
        email: employee.Email,
        phone: employee.Phone,
        address: employee.Address
      },
      status: 'active',
      enrolledBy: req.user?.userId || 'HR_System'
    });
    
    await enrollment.save();
    
    // Send enrollment email
    try {
      if (emailService && typeof emailService.sendEnrollmentEmail === 'function') {
        await emailService.sendEnrollmentEmail(enrollment, employee, policy);
        
        // Update notification status
        enrollment.notificationsSent = enrollment.notificationsSent || {};
        enrollment.notificationsSent.enrollmentEmail = true;
        await enrollment.save();
      }
    } catch (emailError) {
      console.error('Failed to send enrollment email:', emailError);
      // Don't fail the enrollment if email fails
    }
    
    res.status(201).json({
      success: true,
      message: 'Employee enrolled successfully',
      data: {
        enrollmentId: enrollment.enrollmentId,
        insuranceId: enrollment.insuranceId,
        employeeId: employee._id, // Return MongoDB _id
        employeeCode: employee.EmployeeID, // Also return custom ID
        employeeName: `${employee.FirstName} ${employee.LastName}`,
        policyName: policy.policyName,
        coverageAmount: policy.coverageAmount,
        validFrom: policy.validityStart,
        validTo: policy.validityEnd,
        members: enrollment.coverageDetails.members.length
      }
    });
    
  } catch (error) {
    console.error('Error enrolling employee:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enroll employee',
      error: error.message
    });
  }
};

exports.bulkEnrollEmployees = async (req, res) => {
  try {
    const { policyId, employeeIds } = req.body;
    
    if (!employeeIds || !employeeIds.length) {
      return res.status(400).json({
        success: false,
        message: 'No employees provided for enrollment'
      });
    }
    
    // Get policy
    const policy = await MediclaimPolicy.findById(policyId);
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }
    
    if (policy.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Policy is not active'
      });
    }
    
    const results = {
      success: [],
      failed: []
    };
    
    for (const employeeId of employeeIds) {
      try {
        const employee = await Employee.findOne({ EmployeeID: employeeId });
        if (!employee) {
          results.failed.push({ employeeId, reason: 'Employee not found' });
          continue;
        }
        
        // Check existing enrollment
        const existing = await MediclaimEnrollment.findOne({
          employeeId,
          policyId,
          status: 'active'
        });
        
        if (existing) {
          results.failed.push({ employeeId, reason: 'Already enrolled' });
          continue;
        }
        
        // Create enrollment (without dependents for bulk)
        const enrollment = new MediclaimEnrollment({
          employeeId,
          policyId,
          coverageDetails: {
            amount: policy.coverageAmount,
            type: policy.coverageType,
            startDate: policy.validityStart,
            endDate: policy.validityEnd,
            members: [{
              name: `${employee.FirstName} ${employee.LastName}`,
              relationship: 'self',
              gender: employee.Gender,
              dateOfBirth: employee.DateOfBirth
            }]
          },
          premiumPaid: true,
          premiumAmount: policy.premiumDetails.amountPerEmployee,
          status: 'active',
          enrolledBy: req.user?.userId || 'HR_System'
        });
        
        await enrollment.save();
        
        results.success.push({
          employeeId,
          enrollmentId: enrollment.enrollmentId,
          insuranceId: enrollment.insuranceId
        });
        
        // Send email (async, don't await)
        emailService.sendEnrollmentEmail(enrollment, employee, policy)
          .catch(err => console.error(`Email failed for ${employeeId}:`, err));
          
      } catch (error) {
        results.failed.push({ employeeId, reason: error.message });
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Bulk enrollment completed: ${results.success.length} succeeded, ${results.failed.length} failed`,
      data: results
    });
    
  } catch (error) {
    console.error('Error in bulk enrollment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process bulk enrollment',
      error: error.message
    });
  }
};

exports.getEnrollments = async (req, res) => {
  try {
    const { status, policyId, employeeId, page = 1, limit = 10 } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (status) filter.status = status;
    if (policyId) filter.policyId = policyId;
    if (employeeId) filter.employeeId = employeeId;
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const pageSize = parseInt(limit);
    
    // Get enrollments with pagination
    const enrollments = await MediclaimEnrollment.find(filter)
      .populate({
        path: 'policyId',
        select: 'policyName policyCode coverageAmount validityStart validityEnd'
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(); // Use lean() for better performance
    
    // Get total count for pagination
    const total = await MediclaimEnrollment.countDocuments(filter);
    
    // Fetch employee details for each enrollment and replace employeeId with employee name
    const enrichedEnrollments = await Promise.all(
      enrollments.map(async (enrollment) => {
        try {
          // Find employee by the stored employeeId (which is MongoDB _id as string)
          const employee = await Employee.findById(enrollment.employeeId)
            .select('FirstName LastName EmployeeID Email Phone')
            .lean();
          
          if (employee) {
            // Create employee name
            const employeeName = `${employee.FirstName} ${employee.LastName}`.trim();
            
            // Store the original employeeId (MongoDB _id) and employee code if needed
            enrollment.originalEmployeeId = enrollment.employeeId; // Optional: keep original ID if needed
            enrollment.employeeCode = employee.EmployeeID; // Add employee code as separate field
            
            // Replace employeeId with employee name
            enrollment.employeeId = employeeName;
            
            // Also add employee details for additional info if needed
            enrollment.employeeDetails = {
              email: employee.Email,
              phone: employee.Phone
            };
          } else {
            // If employee not found, show a placeholder
            enrollment.employeeId = 'Unknown Employee';
            enrollment.originalEmployeeId = enrollment.employeeId;
          }
          
          return enrollment;
        } catch (err) {
          console.error(`Error fetching employee for enrollment ${enrollment._id}:`, err);
          enrollment.employeeId = 'Error loading employee';
          return enrollment;
        }
      })
    );
    
    res.status(200).json({
      success: true,
      data: enrichedEnrollments,
      pagination: {
        page: parseInt(page),
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize)
      }
    });
    
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enrollments',
      error: error.message
    });
  }
};

exports.getEnrollmentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const enrollment = await MediclaimEnrollment.findById(id)
      .populate('policyId');
      
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }
    
    const employee = await Employee.findOne({ EmployeeID: enrollment.employeeId });
    
    res.status(200).json({
      success: true,
      data: {
        ...enrollment.toObject(),
        employeeDetails: employee ? {
          name: `${employee.FirstName} ${employee.LastName}`,
          email: employee.Email,
          phone: employee.Phone,
          address: employee.Address,
          dateOfJoining: employee.DateOfJoining
        } : null
      }
    });
    
  } catch (error) {
    console.error('Error fetching enrollment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enrollment',
      error: error.message
    });
  }
};

exports.updateEnrollment = async (req, res) => {
  try {
    const { id } = req.params;
    const { dependents, nomineeDetails, status } = req.body;
    
    const enrollment = await MediclaimEnrollment.findById(id);
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }
    
    // Update dependents if provided
    if (dependents) {
      const policy = await MediclaimPolicy.findById(enrollment.policyId);
      const currentChildren = enrollment.coverageDetails.members.filter(m => 
        ['son', 'daughter'].includes(m.relationship)
      ).length;
      
      const newChildren = dependents.filter(d => 
        ['son', 'daughter'].includes(d.relationship)
      ).length;
      
      if (currentChildren + newChildren > (policy.familyCoverage.maxChildren || 2)) {
        return res.status(400).json({
          success: false,
          message: `Cannot add more than ${policy.familyCoverage.maxChildren} children`
        });
      }
      
      enrollment.coverageDetails.members = [
        ...enrollment.coverageDetails.members.filter(m => m.relationship === 'self'),
        ...dependents.map(d => ({
          ...d,
          age: new Date().getFullYear() - new Date(d.dateOfBirth).getFullYear()
        }))
      ];
    }
    
    // Update nominee details
    if (nomineeDetails) {
      enrollment.nomineeDetails = nomineeDetails;
    }
    
    // Update status
    if (status) {
      enrollment.status = status;
    }
    
    enrollment.updatedAt = new Date();
    await enrollment.save();
    
    res.status(200).json({
      success: true,
      message: 'Enrollment updated successfully',
      data: enrollment
    });
    
  } catch (error) {
    console.error('Error updating enrollment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update enrollment',
      error: error.message
    });
  }
};

exports.cancelEnrollment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const enrollment = await MediclaimEnrollment.findById(id);
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }
    
    enrollment.status = 'cancelled';
    enrollment.cancellationReason = reason;
    enrollment.cancelledAt = new Date();
    enrollment.cancelledBy = req.user?.userId || 'HR_System';
    
    await enrollment.save();
    
    res.status(200).json({
      success: true,
      message: 'Enrollment cancelled successfully'
    });
    
  } catch (error) {
    console.error('Error cancelling enrollment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel enrollment',
      error: error.message
    });
  }
};