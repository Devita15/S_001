const Requisition = require('../../models/HR/Requisition');
const ApprovalFlow = require('../../models/HR/ApprovalFlow');
const User = require('../../models/user\'s & setting\'s/User');
const notificationService = require('../../services/notificationService');
const auditService = require('../../services/auditService');
const documentService = require('../../services/documentService');
const mongoose = require('mongoose');

// Generate requisition ID
const generateRequisitionId = async () => {
  const year = new Date().getFullYear();
  const count = await Requisition.countDocuments({
    requisitionId: new RegExp(`REQ-${year}-`, 'i')
  });
  return `REQ-${year}-${(count + 1).toString().padStart(4, '0')}`;
};

// @desc    Create a new requisition (draft)
// @route   POST /api/requisitions
// @access  Private (Hiring Manager, HR, SuperAdmin/CEO)
const createRequisition = async (req, res) => {
  try {
    const {
      department,
      location,
      positionTitle,
      noOfPositions,
      employmentType,
      reasonForHire,
      education,
      experienceYears,
      skills,
      budgetMin,
      budgetMax,
      grade,
      justification,
      priority,
      targetHireDate
    } = req.body;

    // Validate required fields
    const requiredFields = [
      'department', 'location', 'positionTitle', 'noOfPositions',
      'employmentType', 'reasonForHire', 'education', 'experienceYears',
      'skills', 'budgetMin', 'budgetMax', 'grade', 'justification'
    ];

    const missingFields = requiredFields.filter(field => !req.body[field] && req.body[field] !== 0); // Allow 0 for experienceYears
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // 🔴 FIX: Validate experienceYears is a number and not negative
    const parsedExperienceYears = parseInt(experienceYears);
    if (isNaN(parsedExperienceYears)) {
      return res.status(400).json({
        success: false,
        message: 'Experience years must be a valid number'
      });
    }
    
    if (parsedExperienceYears < 0) {
      return res.status(400).json({
        success: false,
        message: 'Experience years cannot be negative'
      });
    }
    
    if (parsedExperienceYears > 50) {
      return res.status(400).json({
        success: false,
        message: 'Experience years cannot exceed 50'
      });
    }

    // Validate other numeric fields
    const parsedNoOfPositions = parseInt(noOfPositions);
    if (isNaN(parsedNoOfPositions) || parsedNoOfPositions < 1) {
      return res.status(400).json({
        success: false,
        message: 'Number of positions must be at least 1'
      });
    }

    const parsedBudgetMin = parseFloat(budgetMin);
    const parsedBudgetMax = parseFloat(budgetMax);
    
    if (isNaN(parsedBudgetMin) || parsedBudgetMin < 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimum budget must be a valid positive number'
      });
    }
    
    if (isNaN(parsedBudgetMax) || parsedBudgetMax < 0) {
      return res.status(400).json({
        success: false,
        message: 'Maximum budget must be a valid positive number'
      });
    }
    
    if (parsedBudgetMax < parsedBudgetMin) {
      return res.status(400).json({
        success: false,
        message: 'Maximum budget must be greater than or equal to minimum budget'
      });
    }

    // Get user info
    const user = req.user;
    const userName = user.Username || (user.EmployeeID ? `${user.EmployeeID.FirstName} ${user.EmployeeID.LastName}`.trim() : 'Unknown');

    // Create requisition
    const requisitionData = {
      department,
      location,
      positionTitle,
      noOfPositions: parsedNoOfPositions,
      employmentType,
      reasonForHire,
      education,
      experienceYears: parsedExperienceYears, // Use validated value
      skills: Array.isArray(skills) ? skills : (typeof skills === 'string' ? skills.split(',').map(s => s.trim()) : []),
      budgetMin: parsedBudgetMin,
      budgetMax: parsedBudgetMax,
      grade,
      justification,
      priority: priority || 'Medium',
      targetHireDate: targetHireDate || null,
      createdBy: user._id,
      createdByName: userName,
      createdByRole: user.RoleName || 'Unknown',
      status: 'pending_approval'
    };

    const requisition = await Requisition.create(requisitionData);

    // Log audit
    await auditService.log(
      'CREATE',
      'Requisition',
      requisition._id,
      user,
      { requisitionData },
      req
    );

    res.status(201).json({
      success: true,
      data: {
        requisitionId: requisition.requisitionId,
        _id: requisition._id,
        status: requisition.status,
        experienceYears: requisition.experienceYears // Include in response
      },
      message: 'Requisition created successfully'
    });

  } catch (error) {
    console.error('Create requisition error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate requisition ID. Please try again.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};
// @desc    Submit requisition for approval
// @route   PUT /api/requisitions/:id/submit
// @access  Private (Hiring Manager, HR)
const submitRequisition = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid requisition ID format'
      });
    }

    const requisition = await Requisition.findById(id);
    if (!requisition) {
      return res.status(404).json({
        success: false,
        message: 'Requisition not found'
      });
    }

    // Check if user has permission
    if (requisition.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only submit your own requisitions'
      });
    }

    if (requisition.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: `Cannot submit requisition with status: ${requisition.status}`
      });
    }

    // Update status
    requisition.status = 'pending_approval';
    await requisition.save();

    // Create approval flow
    const approvalFlow = new ApprovalFlow({
      requisitionId: requisition._id,
      steps: [
        {
          stepNumber: 1,
          approverRole: 'SuperAdmin', // CEO has SuperAdmin role
          status: 'pending'
        }
      ],
      currentStep: 1,
      status: 'in_progress'
    });
    await approvalFlow.save();

    // Find SuperAdmin/CEO users to notify
    const superAdminUsers = await User.find()
      .populate({
        path: 'RoleID',
        match: { RoleName: { $in: ['SuperAdmin', 'CEO'] } }
      })
      .select('_id Username Email');

    // Send notifications to SuperAdmin/CEO
    for (const admin of superAdminUsers) {
      if (admin.RoleID) {
        await notificationService.createNotification({
          userId: admin._id,
          type: 'requisition_submitted',
          title: 'New Requisition Pending Approval',
          message: `${requisition.createdByName} has submitted a requisition for ${requisition.noOfPositions} ${requisition.positionTitle} position(s)`,
          data: {
            requisitionId: requisition._id,
            requisitionNumber: requisition.requisitionId,
            actionBy: requisition.createdByName,
            link: `/requisitions/${requisition._id}`
          }
        });
      }
    }

    // Log audit
    await auditService.log(
      'SUBMIT',
      'Requisition',
      requisition._id,
      req.user,
      { previousStatus: 'draft', newStatus: 'pending_approval' },
      req
    );

    res.json({
      success: true,
      data: {
        requisitionId: requisition.requisitionId,
        status: requisition.status
      },
      message: 'Requisition submitted for approval successfully'
    });

  } catch (error) {
    console.error('Submit requisition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Approve requisition (SuperAdmin/CEO)
// @route   POST /api/requisitions/:id/approve
// @access  Private (SuperAdmin/CEO only)
const approveRequisition = async (req, res) => {
  try {
    const { id } = req.params;
    const { signature, comments } = req.body;

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: 'Digital signature is required for approval'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid requisition ID format'
      });
    }

    const requisition = await Requisition.findById(id);
    if (!requisition) {
      return res.status(404).json({
        success: false,
        message: 'Requisition not found'
      });
    }

    if (requisition.status !== 'pending_approval') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve requisition with status: ${requisition.status}`
      });
    }

    let approvalFlow = await ApprovalFlow.findOne({ requisitionId: requisition._id });
    if (!approvalFlow) {
      approvalFlow = new ApprovalFlow({
        requisitionId: requisition._id,
        steps: [
          {
            stepNumber: 1,
            approverRole: 'SuperAdmin',
            status: 'pending'
          }
        ],
        currentStep: 1,
        status: 'in_progress'
      });
    }

    const currentStep = approvalFlow.steps[approvalFlow.currentStep - 1];
    if (!['SuperAdmin', 'CEO'].includes(currentStep.approverRole)) {
      return res.status(400).json({
        success: false,
        message: 'This requisition is not at the SuperAdmin/CEO approval step'
      });
    }

    // Save signature
    const signatureFileName = `signature_${requisition.requisitionId}_${Date.now()}.png`;
    const signatureUrl = await documentService.saveSignature(signature, signatureFileName);

    // Update requisition
    requisition.status = 'approved';
    requisition.approvedBy = req.user._id;
    requisition.approvedByName = req.user.Username || 'SuperAdmin';
    requisition.approvalDate = new Date();
    requisition.approvalSignature = signatureUrl;
    await requisition.save();

    // Update approval flow
    currentStep.status = 'approved';
    currentStep.actionDate = new Date();
    currentStep.comments = comments;
    currentStep.signature = signatureUrl;
    approvalFlow.status = 'completed';
    approvalFlow.completedAt = new Date();
    await approvalFlow.save();

    // Send notifications to creator and HR
    const creator = await User.findById(requisition.createdBy);
    if (creator) {
      await notificationService.createNotification({
        userId: creator._id,
        type: 'requisition_approved',
        title: 'Requisition Approved',
        message: `Your requisition ${requisition.requisitionId} for ${requisition.positionTitle} has been approved`,
        data: {
          requisitionId: requisition._id,
          requisitionNumber: requisition.requisitionId,
          actionBy: requisition.approvedByName,
          link: `/requisitions/${requisition._id}`
        }
      });
    }

    // Notify HR
    const hrUsers = await User.find()
      .populate({
        path: 'RoleID',
        match: { RoleName: 'HR' }
      })
      .select('_id');

    for (const hr of hrUsers) {
      if (hr.RoleID) {
        await notificationService.createNotification({
          userId: hr._id,
          type: 'requisition_approved',
          title: 'Requisition Approved',
          message: `Requisition ${requisition.requisitionId} for ${requisition.positionTitle} has been approved`,
          data: {
            requisitionId: requisition._id,
            requisitionNumber: requisition.requisitionId,
            actionBy: requisition.approvedByName,
            link: `/requisitions/${requisition._id}`
          }
        });
      }
    }

    // Log audit
    await auditService.log(
      'APPROVE',
      'Requisition',
      requisition._id,
      req.user,
      {
        previousStatus: 'pending_approval',
        newStatus: 'approved',
        signature: signatureUrl
      },
      req
    );

    res.json({
      success: true,
      data: {
        requisitionId: requisition.requisitionId,
        status: requisition.status,
        approvedBy: requisition.approvedByName,
        approvalDate: requisition.approvalDate
      },
      message: 'Requisition approved successfully'
    });

  } catch (error) {
    console.error('Approve requisition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Reject requisition
// @route   POST /api/requisitions/:id/reject
// @access  Private (SuperAdmin/CEO, HR)
const rejectRequisition = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid requisition ID format'
      });
    }

    const requisition = await Requisition.findById(id);
    if (!requisition) {
      return res.status(404).json({
        success: false,
        message: 'Requisition not found'
      });
    }

    if (!['pending_approval', 'draft'].includes(requisition.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot reject requisition with status: ${requisition.status}`
      });
    }

    requisition.status = 'rejected';
    requisition.rejectionReason = reason;
    await requisition.save();

    const approvalFlow = await ApprovalFlow.findOne({ requisitionId: requisition._id });
    if (approvalFlow) {
      approvalFlow.status = 'rejected';
      approvalFlow.completedAt = new Date();
      await approvalFlow.save();
    }

    // Notify creator
    const creator = await User.findById(requisition.createdBy);
    if (creator) {
      await notificationService.createNotification({
        userId: creator._id,
        type: 'requisition_rejected',
        title: 'Requisition Rejected',
        message: `Your requisition ${requisition.requisitionId} has been rejected. Reason: ${reason}`,
        data: {
          requisitionId: requisition._id,
          requisitionNumber: requisition.requisitionId,
          actionBy: req.user.Username,
          link: `/requisitions/${requisition._id}`
        }
      });
    }

    // Log audit
    await auditService.log(
      'REJECT',
      'Requisition',
      requisition._id,
      req.user,
      {
        previousStatus: requisition.status,
        newStatus: 'rejected',
        reason
      },
      req
    );

    res.json({
      success: true,
      message: 'Requisition rejected successfully',
      data: {
        requisitionId: requisition.requisitionId,
        status: requisition.status
      }
    });

  } catch (error) {
    console.error('Reject requisition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get all requisitions
// @route   GET /api/requisitions
// @access  Private
const getRequisitions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      department,
      priority,
      createdBy,
      fromDate,
      toDate,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};

    if (status) filter.status = status;
    if (department) filter.department = { $regex: department, $options: 'i' };
    if (priority) filter.priority = priority;
    if (createdBy) filter.createdBy = createdBy;

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) filter.createdAt.$lte = new Date(toDate);
    }

    if (search) {
      filter.$or = [
        { requisitionId: { $regex: search, $options: 'i' } },
        { positionTitle: { $regex: search, $options: 'i' } },
        { justification: { $regex: search, $options: 'i' } },
        { createdByName: { $regex: search, $options: 'i' } }
      ];
    }

    // Role-based filtering
    const user = req.user;
    const userRole = user.RoleName;

    // SuperAdmin/CEO sees all, others see only their own
    if (!['SuperAdmin', 'CEO', 'HR'].includes(userRole)) {
      filter.createdBy = user._id;
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [requisitions, totalCount] = await Promise.all([
      Requisition.find(filter)
        .populate('createdBy', 'Username Email')
        .populate('approvedBy', 'Username Email')
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Requisition.countDocuments(filter)
    ]);

    const requisitionIds = requisitions.map(r => r._id);
    const approvalFlows = await ApprovalFlow.find({
      requisitionId: { $in: requisitionIds }
    });

    const requisitionsWithFlow = requisitions.map(requisition => {
      const flow = approvalFlows.find(f =>
        f.requisitionId.toString() === requisition._id.toString()
      );
      return {
        ...requisition,
        approvalFlow: flow || null
      };
    });

    res.json({
      success: true,
      data: requisitionsWithFlow,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / pageSize),
        totalItems: totalCount,
        itemsPerPage: pageSize,
        hasNextPage: pageNumber < Math.ceil(totalCount / pageSize),
        hasPrevPage: pageNumber > 1
      }
    });

  } catch (error) {
    console.error('Get requisitions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get requisition by ID
// @route   GET /api/requisitions/:id
// @access  Private
const getRequisitionById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid requisition ID format'
      });
    }

    const requisition = await Requisition.findById(id)
      .populate('createdBy', 'Username Email')
      .populate('approvedBy', 'Username Email')
      .populate('comments.userId', 'Username Email');

    if (!requisition) {
      return res.status(404).json({
        success: false,
        message: 'Requisition not found'
      });
    }

    // Check permissions - SuperAdmin/CEO can view all
    const user = req.user;
    const userRole = user.RoleName;
    
    if (!['SuperAdmin', 'CEO', 'HR'].includes(userRole) &&
        requisition.createdBy.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this requisition'
      });
    }

    const approvalFlow = await ApprovalFlow.findOne({ requisitionId: requisition._id });
    const auditLogs = await auditService.getEntityAuditLogs('Requisition', requisition._id, 1, 20);

    res.json({
      success: true,
      data: {
        ...requisition.toObject(),
        approvalFlow: approvalFlow || null,
        auditLogs: auditLogs.logs
      }
    });

  } catch (error) {
    console.error('Get requisition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Update requisition
// @route   PUT /api/requisitions/:id
// @access  Private (Creator only when in draft)
const updateRequisition = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid requisition ID format'
      });
    }

    const requisition = await Requisition.findById(id);
    if (!requisition) {
      return res.status(404).json({
        success: false,
        message: 'Requisition not found'
      });
    }

    // SuperAdmin/CEO can update any requisition in draft
    if (req.user.RoleName !== 'SuperAdmin' && req.user.RoleName !== 'CEO' &&
        requisition.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own requisitions'
      });
    }

    if (requisition.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: `Cannot update requisition with status: ${requisition.status}`
      });
    }

    const forbiddenFields = ['requisitionId', 'createdBy', 'createdAt', 'status'];
    const updateData = { ...req.body };
    forbiddenFields.forEach(field => delete updateData[field]);

    if (updateData.skills && typeof updateData.skills === 'string') {
      updateData.skills = updateData.skills.split(',').map(s => s.trim());
    }

    const updatedRequisition = await Requisition.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    await auditService.log(
      'UPDATE',
      'Requisition',
      requisition._id,
      req.user,
      {
        previousData: requisition.toObject(),
        updatedData: updateData
      },
      req
    );

    res.json({
      success: true,
      data: updatedRequisition,
      message: 'Requisition updated successfully'
    });

  } catch (error) {
    console.error('Update requisition error:', error);

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

// @desc    Delete requisition permanently
// @route   DELETE /api/requisitions/:id
// @access  Private
const deleteRequisition = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid requisition ID format'
      });
    }

    const requisition = await Requisition.findById(id);
    
    if (!requisition) {
      return res.status(404).json({
        success: false,
        message: 'Requisition not found'
      });
    }

    // Hard delete the requisition
    await Requisition.findByIdAndDelete(id);

    // Optionally delete associated approval flow
    await ApprovalFlow.findOneAndDelete({ requisitionId: id });

    res.json({
      success: true,
      message: 'Requisition deleted successfully'
    });

  } catch (error) {
    console.error('Delete requisition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Add comment to requisition
// @route   POST /api/requisitions/:id/comments
// @access  Private
const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Comment text is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid requisition ID format'
      });
    }

    const requisition = await Requisition.findById(id);
    if (!requisition) {
      return res.status(404).json({
        success: false,
        message: 'Requisition not found'
      });
    }

    const userName = req.user.Username || (req.user.EmployeeID ? `${req.user.EmployeeID.FirstName} ${req.user.EmployeeID.LastName}`.trim() : 'Unknown');

    requisition.comments.push({
      text,
      userId: req.user._id,
      userName,
      createdAt: new Date()
    });

    await requisition.save();

    // Notify creator if commenter is not creator
    if (requisition.createdBy.toString() !== req.user._id.toString()) {
      const creator = await User.findById(requisition.createdBy);
      if (creator) {
        await notificationService.createNotification({
          userId: creator._id,
          type: 'comment_added',
          title: 'New Comment on Requisition',
          message: `${userName} commented on requisition ${requisition.requisitionId}`,
          data: {
            requisitionId: requisition._id,
            requisitionNumber: requisition.requisitionId,
            actionBy: userName,
            link: `/requisitions/${requisition._id}`
          }
        });
      }
    }

    res.json({
      success: true,
      data: requisition.comments[requisition.comments.length - 1],
      message: 'Comment added successfully'
    });

  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get requisition statistics
// @route   GET /api/requisitions/stats/dashboard
// @access  Private (SuperAdmin, CEO, HR)
const getRequisitionStats = async (req, res) => {
  try {
    const stats = await Requisition.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
          pendingApproval: { $sum: { $cond: [{ $eq: ['$status', 'pending_approval'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          filled: { $sum: { $cond: [{ $eq: ['$status', 'filled'] }, 1, 0] } },
          totalPositions: { $sum: '$noOfPositions' },
          approvedPositions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'approved'] }, '$noOfPositions', 0]
            }
          },
          filledPositions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'filled'] }, '$noOfPositions', 0]
            }
          },
          avgBudget: { $avg: '$budgetMax' }
        }
      },
      {
        $project: {
          _id: 0,
          total: 1,
          draft: 1,
          pendingApproval: 1,
          approved: 1,
          rejected: 1,
          inProgress: 1,
          filled: 1,
          totalPositions: 1,
          approvedPositions: 1,
          filledPositions: 1,
          avgBudget: { $round: ['$avgBudget', 2] },
          fulfillmentRate: {
            $round: [
              { $multiply: [{ $divide: ['$filledPositions', '$totalPositions'] }, 100] },
              2
            ]
          }
        }
      }
    ]);

    const departmentStats = await Requisition.aggregate([
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 },
          positions: { $sum: '$noOfPositions' },
          approved: {
            $sum: {
              $cond: [{ $eq: ['$status', 'approved'] }, 1, 0]
            }
          }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrend = await Requisition.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          positions: { $sum: '$noOfPositions' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      },
      {
        $project: {
          month: {
            $concat: [
              { $toString: '$_id.year' },
              '-',
              { $toString: { $cond: [{ $lt: ['$_id.month', 10] }, '0', ''] } },
              { $toString: '$_id.month' }
            ]
          },
          count: 1,
          positions: 1,
          _id: 0
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        summary: stats[0] || {
          total: 0,
          draft: 0,
          pendingApproval: 0,
          approved: 0,
          rejected: 0,
          inProgress: 0,
          filled: 0,
          totalPositions: 0,
          approvedPositions: 0,
          filledPositions: 0,
          avgBudget: 0,
          fulfillmentRate: 0
        },
        departmentStats,
        monthlyTrend
      }
    });

  } catch (error) {
    console.error('Get requisition stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

module.exports = {
  createRequisition,
  submitRequisition,
  approveRequisition,
  rejectRequisition,
  getRequisitions,
  getRequisitionById,
  updateRequisition,
  addComment,
  getRequisitionStats,
  deleteRequisition
};