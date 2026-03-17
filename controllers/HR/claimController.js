const MediclaimClaim = require('../models/MediclaimClaim');
const MediclaimEnrollment = require('../models/MediclaimEnrollment');
const Employee = require('../models/Employee');
const emailService = require('../../services/emailService');

exports.submitClaim = async (req, res) => {
  try {
    const { enrollmentId, claimType, hospitalName, admissionDate, dischargeDate, diagnosis, claimedAmount, patientDetails } = req.body;
    
    // Check enrollment
    const enrollment = await MediclaimEnrollment.findById(enrollmentId).populate('policyId');
    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }
    
    // Check if patient is covered
    const isPatientCovered = enrollment.coverageDetails.members.some(m => 
      m.name === patientDetails.name && m.relationship === patientDetails.relationship
    );
    
    if (!isPatientCovered) {
      return res.status(400).json({
        success: false,
        message: 'Patient is not covered under this policy'
      });
    }
    
    // FIXED: Check policy validity against admission date, not current date
    const claimAdmissionDate = new Date(admissionDate);
    
    // Normalize dates to compare only date part (ignore time)
    const policyStart = new Date(enrollment.coverageDetails.startDate);
    policyStart.setHours(0, 0, 0, 0);
    
    const policyEnd = new Date(enrollment.coverageDetails.endDate);
    policyEnd.setHours(23, 59, 59, 999);
    
    claimAdmissionDate.setHours(0, 0, 0, 0);
    
    console.log('Policy Start:', policyStart);
    console.log('Policy End:', policyEnd);
    console.log('Claim Date:', claimAdmissionDate);
    
    if (claimAdmissionDate < policyStart || claimAdmissionDate > policyEnd) {
      return res.status(400).json({
        success: false,
        message: `Policy is not valid for admission date ${admissionDate}. Policy valid from ${enrollment.coverageDetails.startDate.toISOString().split('T')[0]} to ${enrollment.coverageDetails.endDate.toISOString().split('T')[0]}`
      });
    }
    
    // Create claim
    const claim = new MediclaimClaim({
      enrollmentId,
      employeeId: enrollment.employeeId,
      policyId: enrollment.policyId,
      patientDetails,
      claimType,
      hospitalName,
      hospitalAddress: req.body.hospitalAddress,
      admissionDate: claimAdmissionDate,
      dischargeDate: dischargeDate ? new Date(dischargeDate) : null,
      diagnosis,
      treatment: req.body.treatment,
      claimedAmount,
      documents: req.body.documents?.map(doc => ({
        ...doc,
        uploadedAt: new Date()
      })),
      submittedBy: req.user?.userId || 'Employee',
      status: 'submitted'
    });
    
    await claim.save();
    
    // Add claim to enrollment
    enrollment.claims.push(claim._id);
    await enrollment.save();
    
    // Send confirmation email
    const employee = await Employee.findOne({ EmployeeID: enrollment.employeeId });
    if (employee) {
      emailService.sendClaimUpdateEmail(claim, enrollment, employee)
        .catch(err => console.error('Claim email failed:', err));
    }
    
    res.status(201).json({
      success: true,
      message: 'Claim submitted successfully',
      data: claim
    });
    
  } catch (error) {
    console.error('Error submitting claim:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit claim',
      error: error.message
    });
  }
};

exports.getClaims = async (req, res) => {
  try {
    const { employeeId, policyId, status, fromDate, toDate } = req.query;
    
    let query = {};
    
    if (employeeId) query.employeeId = employeeId;
    if (policyId) query.policyId = policyId;
    if (status) query.status = status;
    if (fromDate || toDate) {
      query.submittedDate = {};
      if (fromDate) query.submittedDate.$gte = new Date(fromDate);
      if (toDate) query.submittedDate.$lte = new Date(toDate);
    }
    
    const claims = await MediclaimClaim.find(query)
      .populate('enrollmentId')
      .sort({ submittedDate: -1 });
    
    // Get employee details
    const claimsWithDetails = await Promise.all(claims.map(async (claim) => {
      const employee = await Employee.findOne({ EmployeeID: claim.employeeId });
      return {
        ...claim.toObject(),
        employeeName: employee ? `${employee.FirstName} ${employee.LastName}` : 'Unknown'
      };
    }));
    
    res.status(200).json({
      success: true,
      count: claimsWithDetails.length,
      data: claimsWithDetails
    });
    
  } catch (error) {
    console.error('Error fetching claims:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claims',
      error: error.message
    });
  }
};

exports.getClaimById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const claim = await MediclaimClaim.findById(id)
      .populate('enrollmentId');
      
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    
    const employee = await Employee.findOne({ EmployeeID: claim.employeeId });
    
    res.status(200).json({
      success: true,
      data: {
        ...claim.toObject(),
        employeeDetails: employee ? {
          name: `${employee.FirstName} ${employee.LastName}`,
          email: employee.Email,
          phone: employee.Phone
        } : null
      }
    });
    
  } catch (error) {
    console.error('Error fetching claim:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claim',
      error: error.message
    });
  }
};

exports.updateClaimStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, approvedAmount, disallowedAmount, disallowedReason, comments } = req.body;
    
    const claim = await MediclaimClaim.findById(id).populate('enrollmentId');
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }
    
    // Update claim
    claim.status = status;
    if (approvedAmount) claim.approvedAmount = approvedAmount;
    if (disallowedAmount) claim.disallowedAmount = disallowedAmount;
    if (disallowedReason) claim.disallowedReason = disallowedReason;
    
    // Add to status history
    claim.statusHistory.push({
      status,
      updatedBy: req.user?.userId || 'System',
      updatedAt: new Date(),
      comments
    });
    
    // If approved or rejected, set reviewer
    if (['approved', 'rejected'].includes(status)) {
      claim.reviewedBy = req.user?.userId;
      claim.reviewDate = new Date();
    }
    
    // If settled, set payment details
    if (status === 'settled') {
      claim.paymentDetails = {
        mode: req.body.paymentMode,
        amount: approvedAmount || claim.claimedAmount,
        date: new Date(),
        transactionId: req.body.transactionId,
        paidTo: req.body.paidTo
      };
    }
    
    await claim.save();
    
    // Send email notification to employee
    const employee = await Employee.findOne({ EmployeeID: claim.employeeId });
    if (employee) {
      emailService.sendClaimUpdateEmail(claim, claim.enrollmentId, employee)
        .catch(err => console.error('Claim update email failed:', err));
    }
    
    res.status(200).json({
      success: true,
      message: `Claim ${status} successfully`,
      data: claim
    });
    
  } catch (error) {
    console.error('Error updating claim:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update claim',
      error: error.message
    });
  }
};

exports.getClaimStatistics = async (req, res) => {
  try {
    const { policyId, fromDate, toDate } = req.query;
    
    let matchStage = {};
    if (policyId) matchStage.policyId = mongoose.Types.ObjectId(policyId);
    if (fromDate || toDate) {
      matchStage.submittedDate = {};
      if (fromDate) matchStage.submittedDate.$gte = new Date(fromDate);
      if (toDate) matchStage.submittedDate.$lte = new Date(toDate);
    }
    
    const statistics = await MediclaimClaim.aggregate([
      { $match: matchStage },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                totalClaims: { $sum: 1 },
                totalClaimed: { $sum: "$claimedAmount" },
                totalApproved: { $sum: "$approvedAmount" },
                averageClaim: { $avg: "$claimedAmount" },
                maxClaim: { $max: "$claimedAmount" },
                minClaim: { $min: "$claimedAmount" }
              }
            }
          ],
          byStatus: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                amount: { $sum: "$approvedAmount" }
              }
            }
          ],
          byType: [
            {
              $group: {
                _id: "$claimType",
                count: { $sum: 1 },
                amount: { $sum: "$claimedAmount" }
              }
            }
          ],
          monthly: [
            {
              $group: {
                _id: {
                  year: { $year: "$submittedDate" },
                  month: { $month: "$submittedDate" }
                },
                count: { $sum: 1 },
                amount: { $sum: "$claimedAmount" }
              }
            },
            { $sort: { "_id.year": -1, "_id.month": -1 } },
            { $limit: 12 }
          ]
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: statistics[0]
    });
    
  } catch (error) {
    console.error('Error fetching claim statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claim statistics',
      error: error.message
    });
  }
};