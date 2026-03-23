const MediclaimPolicy = require('../../models/HR/MediclaimPolicy');
const MediclaimEnrollment = require('../../models/HR/MediclaimEnrollment');
const MediclaimClaim = require('../../models/HR/MediclaimClaim');
const Employee = require('../../models/HR/Employee');
const emailService = require('../../services/emailService');

exports.createPolicy = async (req, res) => {
  try {
    const { policyName, insurer, policyNumber, coverageAmount, coverageType, validityStart, validityEnd } = req.body;
    
    // Check if policy number already exists
    const existingPolicy = await MediclaimPolicy.findOne({ policyNumber });
    if (existingPolicy) {
      return res.status(400).json({
        success: false,
        message: 'Policy number already exists'
      });
    }
    
     const currentDate = new Date();
    const today = new Date(currentDate.setHours(0, 0, 0, 0));
    
    const startDate = new Date(validityStart);
    const endDate = new Date(validityEnd);
    
    // Check if dates are valid
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid validity start date format'
      });
    }
    
    if (isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid validity end date format'
      });
    }
    
    // Validity start date cannot be in the past
    if (startDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Policy validity start date cannot be in the past'
      });
    }
    
    // Validity end date must be after start date
    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: 'Policy validity end date must be after start date'
      });
    }
    
    // Generate policy ID safely - find the last policy and increment
    const year = new Date().getFullYear();
    
    // Find the last policy with the current year prefix
    const lastPolicy = await MediclaimPolicy.findOne({
      policyId: new RegExp(`^POL-${year}-`)
    }).sort({ policyId: -1 });
    
    let nextNumber = 1;
    if (lastPolicy) {
      // Extract the number from the last policy ID
      const lastNumber = parseInt(lastPolicy.policyId.split('-')[2]);
      nextNumber = lastNumber + 1;
    }
    
    const policyId = `POL-${year}-${nextNumber.toString().padStart(3, '0')}`;
    
    const policy = new MediclaimPolicy({
      policyId,
      policyName,
      insurer,
      policyNumber,
      coverageAmount,
      coverageType,
      familyCoverage: req.body.familyCoverage || {
        spouse: true,
        children: true,
        maxChildren: 2
      },
      validityStart: new Date(validityStart),
      validityEnd: new Date(validityEnd),
      premiumDetails: req.body.premiumDetails,
      networkHospitals: req.body.networkHospitals || [],
      waitingPeriods: req.body.waitingPeriods,
      exclusions: req.body.exclusions,
      policyDocuments: req.body.policyDocuments?.map(doc => ({
        ...doc,
        uploadedAt: new Date()
      })),
      createdBy: req.user?.userId || 'HR_System'
    });
    
    await policy.save();
    
    res.status(201).json({
      success: true,
      message: 'Policy created successfully',
      data: policy
    });
    
  } catch (error) {
    console.error('Error creating policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create policy',
      error: error.message
    });
  }
};

exports.getAllPolicies = async (req, res) => {
  try {
    const { status, insurer, fromDate, toDate } = req.query;
    
    let query = {};
    
    if (status) query.status = status;
    if (insurer) query.insurer = insurer;
    if (fromDate || toDate) {
      query.validityStart = {};
      if (fromDate) query.validityStart.$gte = new Date(fromDate);
      if (toDate) query.validityStart.$lte = new Date(toDate);
    }
    
    const policies = await MediclaimPolicy.find(query)
      .sort({ createdAt: -1 });
    
    // Get enrollment counts for each policy
    const policiesWithStats = await Promise.all(policies.map(async (policy) => {
      const enrollmentCount = await MediclaimEnrollment.countDocuments({
        policyId: policy._id,
        status: 'active'
      });
      
      const claims = await MediclaimClaim.find({
        policyId: policy._id
      });
      
      const totalClaimAmount = claims.reduce((sum, claim) => sum + (claim.approvedAmount || 0), 0);
      
      return {
        ...policy.toObject(),
        enrollmentCount,
        totalClaimAmount,
        claimsCount: claims.length
      };
    }));
    
    res.status(200).json({
      success: true,
      count: policiesWithStats.length,
      data: policiesWithStats
    });
    
  } catch (error) {
    console.error('Error fetching policies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch policies',
      error: error.message
    });
  }
};

exports.getPolicyById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const policy = await MediclaimPolicy.findById(id);
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }
    
    // Get enrollments for this policy
    const enrollments = await MediclaimEnrollment.find({ policyId: id })
      .populate('employeeId')
      .limit(100);
    
    // Get claims for this policy
    const claims = await MediclaimClaim.find({ policyId: id })
      .sort({ submittedDate: -1 })
      .limit(50);
    
    res.status(200).json({
      success: true,
      data: {
        ...policy.toObject(),
        enrollments,
        claims
      }
    });
    
  } catch (error) {
    console.error('Error fetching policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch policy',
      error: error.message
    });
  }
};

exports.updatePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    
    const policy = await MediclaimPolicy.findByIdAndUpdate(
      id,
      {
        ...req.body,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Policy updated successfully',
      data: policy
    });
    
  } catch (error) {
    console.error('Error updating policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update policy',
      error: error.message
    });
  }
};

exports.deletePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if policy has enrollments
    const enrollmentCount = await MediclaimEnrollment.countDocuments({ policyId: id });
    if (enrollmentCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete policy with existing enrollments. Deactivate it instead.'
      });
    }
    
    const policy = await MediclaimPolicy.findByIdAndDelete(id);
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Policy deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete policy',
      error: error.message
    });
  }
};

exports.getRenewalReport = async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(today.getDate() + 30);
    
    // Get policies expiring in next 30 days
    const expiringPolicies = await MediclaimPolicy.find({
      validityEnd: {
        $gte: today,
        $lte: thirtyDaysLater
      },
      status: 'active'
    });
    
    const reports = await Promise.all(expiringPolicies.map(async (policy) => {
      // Get enrollments
      const enrollments = await MediclaimEnrollment.find({
        policyId: policy._id,
        status: 'active'
      });
      
      // Get claims
      const claims = await MediclaimClaim.find({
        policyId: policy._id,
        submittedDate: {
          $gte: policy.validityStart,
          $lte: policy.validityEnd
        }
      });
      
      const totalClaimAmount = claims.reduce((sum, claim) => sum + (claim.approvedAmount || 0), 0);
      const totalPremium = policy.premiumDetails.totalPremium || (enrollments.length * policy.premiumDetails.amountPerEmployee);
      const claimsRatio = totalPremium > 0 ? (totalClaimAmount / totalPremium) * 100 : 0;
      
      // Group claims by reason
      const claimsByReason = claims.reduce((acc, claim) => {
        const reason = claim.diagnosis || 'Other';
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {});
      
      const topReasons = Object.entries(claimsByReason)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));
      
      // Get new employees since policy start
      const newEmployees = await Employee.countDocuments({
        DateOfJoining: {
          $gte: policy.validityStart
        },
        EmploymentStatus: 'active'
      });
      
      // Get employees who left
      const employeesLeft = await Employee.countDocuments({
        EmploymentStatus: { $in: ['resigned', 'terminated', 'retired'] },
        updatedAt: {
          $gte: policy.validityStart,
          $lte: policy.validityEnd
        }
      });
      
      // Project next year employees
      const currentActive = await Employee.countDocuments({ EmploymentStatus: 'active' });
      const nextYearEmployees = currentActive - employeesLeft + newEmployees;
      
      return {
        policyId: policy._id,
        policyName: policy.policyName,
        policyNumber: policy.policyNumber,
        insurer: policy.insurer,
        expiryDate: policy.validityEnd,
        daysLeft: Math.ceil((policy.validityEnd - today) / (1000 * 60 * 60 * 24)),
        enrolledEmployees: enrollments.length,
        totalPremium,
        claimsCount: claims.length,
        totalClaimAmount,
        claimsRatio: claimsRatio.toFixed(2),
        topReasons,
        newEmployees,
        employeesLeft,
        nextYearEmployees,
        currentPremiumPerEmployee: policy.premiumDetails.amountPerEmployee
      };
    }));
    
    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports
    });
    
  } catch (error) {
    console.error('Error generating renewal report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate renewal report',
      error: error.message
    });
  }
};