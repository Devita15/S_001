// controllers/employeeBehaviorController.js
const EmployeeBehavior = require('../../models/HR/EmployeeBehavior');
const Employee = require('../../models/HR/Employee');
const mongoose = require('mongoose');
const auditService = require('../../services/auditService');
const fs = require('fs');
const path = require('path');

// Submit behavior feedback for an employee with attachments
const submitBehaviorFeedback = async (req, res) => {
  try {
    const {
      employeeId,
      category,
      rating,
      type,
      description,
      actionTaken,
      reviewDate,
      isConfidential,
      tags
    } = req.body;

    if (!employeeId || !category || !rating || !description) {
      // Clean up uploaded files if validation fails
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          fs.unlinkSync(file.path);
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Employee ID, category, rating, and description are required'
      });
    }

    // ==================== DATE VALIDATION ====================
    // Validate review date cannot be in the future
    let parsedReviewDate = null;
    if (reviewDate) {
      parsedReviewDate = new Date(reviewDate);
      const currentDate = new Date();
      const today = new Date(currentDate.setHours(0, 0, 0, 0));

      // Check if date is valid
      if (isNaN(parsedReviewDate.getTime())) {
        // Clean up uploaded files if validation fails
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            fs.unlinkSync(file.path);
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Invalid review date format. Please provide a valid date.'
        });
      }

      // Review date cannot be in the future
      if (parsedReviewDate > today) {
        // Clean up uploaded files if validation fails
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            fs.unlinkSync(file.path);
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Review date cannot be in the future. Please select a past or current date.'
        });
      }
    }
    // ==================== END DATE VALIDATION ====================

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      // Clean up uploaded files if employee not found
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          fs.unlinkSync(file.path);
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Process attachments if any
    let attachments = [];
    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date(),
        uploadedBy: req.user._id
      }));
    }

    // Parse tags if they come as string
    let parsedTags = tags;
    if (typeof tags === 'string') {
      try {
        parsedTags = JSON.parse(tags);
      } catch (e) {
        parsedTags = tags.split(',').map(tag => tag.trim());
      }
    }

    const behaviorData = {
      employeeId,
      submittedBy: req.user._id,
      category,
      rating: parseInt(rating),
      type: type || (parseInt(rating) >= 4 ? 'Positive' : parseInt(rating) <= 2 ? 'Negative' : 'Neutral'),
      description,
      actionTaken: actionTaken || 'None',
      reviewDate: parsedReviewDate, // Use the validated date
      isConfidential: isConfidential === 'true' || isConfidential === true,
      tags: parsedTags || [],
      status: 'Open',
      isDeleted: false,
      attachments: attachments
    };

    const behavior = await EmployeeBehavior.create(behaviorData);

    await behavior.populate([
      { path: 'employeeId', select: 'FirstName LastName EmployeeID' },
      { path: 'submittedBy', select: 'Username' },
      { path: 'attachments.uploadedBy', select: 'Username' }
    ]);

    await auditService.log(
      'CREATE',
      'EmployeeBehavior',
      behavior._id,
      req.user,
      { 
        employeeId: employee.EmployeeID,
        employeeName: `${employee.FirstName} ${employee.LastName}`,
        rating,
        category,
        type: behavior.type,
        attachmentCount: attachments.length
      },
      req
    );

    res.status(201).json({
      success: true,
      data: behavior,
      message: `Behavior feedback submitted successfully with ${attachments.length} attachment(s)`
    });

  } catch (error) {
    console.error('Submit behavior feedback error:', error);
    
    // Clean up uploaded files if error occurs
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }
      });
    }
    
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

// Get behavior history for an employee
const getEmployeeBehaviorHistory = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const {
      page = 1,
      limit = 10,
      category,
      type,
      status,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid employee ID format'
      });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Exclude deleted records
    const filter = { 
      employeeId,
      isDeleted: { $ne: true }
    };

    if (category) filter.category = category;
    if (type) filter.type = type;
    if (status) filter.status = status;
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [behaviors, totalCount] = await Promise.all([
      EmployeeBehavior.find(filter)
        .populate('submittedBy', 'Username')
        .populate('resolvedBy', 'Username')
        .populate('attachments.uploadedBy', 'Username')
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      EmployeeBehavior.countDocuments(filter)
    ]);

    // Add base URL for attachments
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    behaviors.forEach(behavior => {
      if (behavior.attachments && behavior.attachments.length > 0) {
        behavior.attachments.forEach(att => {
          att.fileUrl = `${baseUrl}/uploads/behavior/${att.filename}`;
        });
      }
    });

    const stats = await EmployeeBehavior.aggregate([
      { $match: { employeeId: new mongoose.Types.ObjectId(employeeId), isDeleted: { $ne: true } } },
      {
        $group: {
          _id: null,
          totalFeedback: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          positiveCount: {
            $sum: { $cond: [{ $eq: ['$type', 'Positive'] }, 1, 0] }
          },
          negativeCount: {
            $sum: { $cond: [{ $eq: ['$type', 'Negative'] }, 1, 0] }
          },
          neutralCount: {
            $sum: { $cond: [{ $eq: ['$type', 'Neutral'] }, 1, 0] }
          },
          openCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] }
          },
          escalatedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Escalated'] }, 1, 0] }
          }
        }
      }
    ]);

    await auditService.log(
      'VIEW',
      'EmployeeBehavior',
      employeeId,
      req.user,
      { action: 'view_history', employeeId: employee.EmployeeID },
      req
    );

    res.json({
      success: true,
      data: {
        employee: {
          id: employee._id,
          name: `${employee.FirstName} ${employee.LastName}`,
          employeeId: employee.EmployeeID
        },
        statistics: stats[0] || {
          totalFeedback: 0,
          averageRating: 0,
          positiveCount: 0,
          negativeCount: 0,
          neutralCount: 0,
          openCount: 0,
          escalatedCount: 0
        },
        behaviors,
        pagination: {
          currentPage: pageNumber,
          totalPages: Math.ceil(totalCount / pageSize),
          totalItems: totalCount,
          itemsPerPage: pageSize,
          hasNextPage: pageNumber < Math.ceil(totalCount / pageSize),
          hasPrevPage: pageNumber > 1
        }
      }
    });

  } catch (error) {
    console.error('Get behavior history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// Get behavior summary for all employees (Dashboard)
const getBehaviorSummary = async (req, res) => {
  try {
    const { department, startDate, endDate } = req.query;

    // Exclude deleted records
    const matchStage = {
      isDeleted: { $ne: true }
    };
    
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const summary = await EmployeeBehavior.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'employees',
          localField: 'employeeId',
          foreignField: '_id',
          as: 'employee'
        }
      },
      { $unwind: '$employee' },
      
      ...(department ? [
        { $match: { 'employee.DepartmentID': new mongoose.Types.ObjectId(department) } }
      ] : []),
      
      {
        $facet: {
          byCategory: [
            { $group: {
              _id: '$category',
              count: { $sum: 1 },
              avgRating: { $avg: '$rating' }
            }},
            { $sort: { count: -1 } }
          ],
          byType: [
            { $group: {
              _id: '$type',
              count: { $sum: 1 }
            }}
          ],
          byStatus: [
            { $group: {
              _id: '$status',
              count: { $sum: 1 }
            }}
          ],
          byMonth: [
            {
              $group: {
                _id: {
                  year: { $year: '$createdAt' },
                  month: { $month: '$createdAt' }
                },
                count: { $sum: 1 },
                avgRating: { $avg: '$rating' }
              }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } },
            { $limit: 12 }
          ],
          overallStats: [
            {
              $group: {
                _id: null,
                totalFeedback: { $sum: 1 },
                overallAvgRating: { $avg: '$rating' },
                positiveCount: {
                  $sum: { $cond: [{ $eq: ['$type', 'Positive'] }, 1, 0] }
                },
                negativeCount: {
                  $sum: { $cond: [{ $eq: ['$type', 'Negative'] }, 1, 0] }
                },
                openCases: {
                  $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] }
                },
                escalatedCases: {
                  $sum: { $cond: [{ $eq: ['$status', 'Escalated'] }, 1, 0] }
                }
              }
            }
          ]
        }
      }
    ]);

    await auditService.log(
      'VIEW',
      'EmployeeBehavior',
      null,
      req.user,
      { action: 'view_summary', filters: { department, startDate, endDate } },
      req
    );

    res.json({
      success: true,
      data: {
        overall: summary[0].overallStats[0] || {
          totalFeedback: 0,
          overallAvgRating: 0,
          positiveCount: 0,
          negativeCount: 0,
          openCases: 0,
          escalatedCases: 0
        },
        byCategory: summary[0].byCategory,
        byType: summary[0].byType,
        byStatus: summary[0].byStatus,
        byMonth: summary[0].byMonth
      }
    });

  } catch (error) {
    console.error('Get behavior summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// Get single behavior record
const getBehaviorById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid behavior ID format'
      });
    }

    // Exclude deleted records
    const behavior = await EmployeeBehavior.findOne({
      _id: id,
      isDeleted: { $ne: true }
    })
      .populate('employeeId', 'FirstName LastName EmployeeID DepartmentID DesignationID')
      .populate('submittedBy', 'Username')
      .populate('resolvedBy', 'Username')
      .populate('attachments.uploadedBy', 'Username');

    if (!behavior) {
      return res.status(404).json({
        success: false,
        message: 'Behavior record not found'
      });
    }


    await auditService.log(
      'VIEW',
      'EmployeeBehavior',
      behavior._id,
      req.user,
      { action: 'view_details' },
      req
    );

    res.json({
      success: true,
      data: behavior
    });

  } catch (error) {
    console.error('Get behavior by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// Update behavior record with attachment support - FIXED with date validation
const updateBehavior = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      // Clean up uploaded files if validation fails
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          fs.unlinkSync(file.path);
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Invalid behavior ID format'
      });
    }

    // Check if record exists and is not deleted
    const existingBehavior = await EmployeeBehavior.findOne({
      _id: id,
      isDeleted: { $ne: true }
    });

    if (!existingBehavior) {
      // Clean up uploaded files if record not found
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          fs.unlinkSync(file.path);
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Behavior record not found or has been deleted'
      });
    }

    // ==================== DATE VALIDATION ====================
    // Validate review date cannot be in the future
    if (updates.reviewDate) {
      const parsedReviewDate = new Date(updates.reviewDate);
      const currentDate = new Date();
      const today = new Date(currentDate.setHours(0, 0, 0, 0));

      // Check if date is valid
      if (isNaN(parsedReviewDate.getTime())) {
        // Clean up uploaded files if validation fails
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            fs.unlinkSync(file.path);
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Invalid review date format. Please provide a valid date.'
        });
      }

      // Review date cannot be in the future
      if (parsedReviewDate > today) {
        // Clean up uploaded files if validation fails
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            fs.unlinkSync(file.path);
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Review date cannot be in the future. Please select a past or current date.'
        });
      }

      // Update the reviewDate in updates object
      updates.reviewDate = parsedReviewDate;
    }
    // ==================== END DATE VALIDATION ====================

    // Handle attachment operations
    const { attachmentsToDelete } = updates;
    
    // Parse if they come as strings
    let attachmentsToDeleteArray = [];
    if (attachmentsToDelete) {
      try {
        attachmentsToDeleteArray = typeof attachmentsToDelete === 'string' 
          ? JSON.parse(attachmentsToDelete) 
          : attachmentsToDelete;
      } catch (e) {
        attachmentsToDeleteArray = [];
      }
    }

    // Delete specified attachments from filesystem
    if (attachmentsToDeleteArray.length > 0) {
      for (const attachmentId of attachmentsToDeleteArray) {
        // Find the attachment in existing record
        const attachmentToDelete = existingBehavior.attachments.find(
          att => att._id.toString() === attachmentId || att.filename === attachmentId
        );
        
        if (attachmentToDelete && attachmentToDelete.filePath) {
          try {
            // Delete file from filesystem
            fs.unlinkSync(attachmentToDelete.filePath);
            console.log(`Deleted file: ${attachmentToDelete.filePath}`);
          } catch (fileError) {
            console.error('Error deleting file:', fileError);
            // Continue even if file delete fails
          }
        }
      }
    }

    // Process new attachments if any - PRESERVE ALL FIELDS
    let newAttachments = [];
    if (req.files && req.files.length > 0) {
      newAttachments = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date(),
        uploadedBy: req.user._id
      }));
    }

    // Filter out fields that shouldn't be updated directly
    const forbiddenFields = [
      'employeeId', 'submittedBy', 'createdAt', 
      'isDeleted', 'deletedAt', 'deletedBy', 'attachments'
    ];
    forbiddenFields.forEach(field => delete updates[field]);

    // Parse rating to number if it's a string
    if (updates.rating) {
      updates.rating = parseInt(updates.rating);
    }

    // Auto-set type based on rating if type not provided but rating is updated
    if (updates.rating && !updates.type) {
      if (updates.rating >= 4) {
        updates.type = 'Positive';
      } else if (updates.rating <= 2) {
        updates.type = 'Negative';
      } else {
        updates.type = 'Neutral';
      }
    }

    // Parse tags if they come as string
    if (updates.tags && typeof updates.tags === 'string') {
      try {
        updates.tags = JSON.parse(updates.tags);
      } catch (e) {
        updates.tags = updates.tags.split(',').map(tag => tag.trim());
      }
    }

    // Handle attachments update - PRESERVE ALL EXISTING FIELDS
    let finalAttachments = [];

    // First, keep attachments that weren't deleted (preserve all their fields)
    if (existingBehavior.attachments && existingBehavior.attachments.length > 0) {
      finalAttachments = existingBehavior.attachments.filter(att => 
        !attachmentsToDeleteArray.includes(att._id.toString()) &&
        !attachmentsToDeleteArray.includes(att.filename)
      );
    }

    // Then add new attachments (with all fields)
    if (newAttachments.length > 0) {
      finalAttachments = [...finalAttachments, ...newAttachments];
    }

    // Build update object
    const updateData = {
      ...updates,
      updatedAt: Date.now()
    };

    // Only update attachments if there were changes
    if (attachmentsToDeleteArray.length > 0 || newAttachments.length > 0) {
      updateData.attachments = finalAttachments;
    }

    // Update the record
    const behavior = await EmployeeBehavior.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    // Populate all fields exactly like in getAllBehavior
    await behavior.populate([
      { path: 'employeeId', select: 'FirstName LastName EmployeeID DepartmentID' },
      { path: 'submittedBy', select: 'Username' },
      { path: 'resolvedBy', select: 'Username' },
      { path: 'attachments.uploadedBy', select: 'Username' }
    ]);

    // Convert to plain object
    const behaviorObj = behavior.toObject();

    // Add base URL for attachments - using /behavior/ path consistently
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    if (behaviorObj.attachments && behaviorObj.attachments.length > 0) {
      behaviorObj.attachments.forEach(att => {
        // Ensure all attachment fields are present
        if (!att.originalName) att.originalName = att.filename;
        if (!att.fileSize) att.fileSize = 0;
        if (!att.mimeType) {
          // Guess mimeType from filename if not present
          const ext = att.filename.split('.').pop()?.toLowerCase();
          if (ext === 'pdf') att.mimeType = 'application/pdf';
          else if (ext === 'png') att.mimeType = 'image/png';
          else if (ext === 'jpg' || ext === 'jpeg') att.mimeType = 'image/jpeg';
          else att.mimeType = 'application/octet-stream';
        }
        att.fileUrl = `/uploads/behavior/${att.filename}`;
      });
    }

    await auditService.log(
      'UPDATE',
      'EmployeeBehavior',
      behavior._id,
      req.user,
      { 
        updates,
        attachmentsAdded: newAttachments.length,
        attachmentsDeleted: attachmentsToDeleteArray.length
      },
      req
    );

    res.json({
      success: true,
      data: behaviorObj,
      message: `Behavior record updated successfully with ${newAttachments.length} new attachment(s) and ${attachmentsToDeleteArray.length} removed`
    });

  } catch (error) {
    console.error('Update behavior error:', error);

    // Clean up uploaded files if error occurs
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkError) {
          console.error('Error deleting file:', unlinkError);
        }
      });
    }

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
// Resolve behavior case
const resolveBehavior = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolutionNotes, actionTaken } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid behavior ID format'
      });
    }

    // Check if record exists and is not deleted
    const behavior = await EmployeeBehavior.findOne({
      _id: id,
      isDeleted: { $ne: true }
    });

    if (!behavior) {
      return res.status(404).json({
        success: false,
        message: 'Behavior record not found or has been deleted'
      });
    }

    if (behavior.status === 'Resolved' || behavior.status === 'Closed') {
      return res.status(400).json({
        success: false,
        message: 'This case is already resolved'
      });
    }

    behavior.status = 'Resolved';
    behavior.resolvedAt = new Date();
    behavior.resolvedBy = req.user._id;
    behavior.resolutionNotes = resolutionNotes || behavior.resolutionNotes;
    if (actionTaken) behavior.actionTaken = actionTaken;

    await behavior.save();

    await behavior.populate('employeeId', 'FirstName LastName');

    await auditService.log(
      'UPDATE',
      'EmployeeBehavior',
      behavior._id,
      req.user,
      { action: 'resolve', resolutionNotes },
      req
    );

    res.json({
      success: true,
      data: behavior,
      message: 'Behavior case resolved successfully'
    });

  } catch (error) {
    console.error('Resolve behavior error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// Soft delete behavior record
const deleteBehavior = async (req, res) => {
  try {
    const { id } = req.params;
    const { deletionReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid behavior ID format'
      });
    }

    const behavior = await EmployeeBehavior.findById(id);
    
    if (!behavior) {
      return res.status(404).json({
        success: false,
        message: 'Behavior record not found'
      });
    }

    // Check if already deleted
    if (behavior.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Behavior record is already deleted'
      });
    }

    // Soft delete - set flags instead of removing
    behavior.isDeleted = true;
    behavior.deletedAt = new Date();
    behavior.deletedBy = req.user._id;
    behavior.deletionReason = deletionReason || 'No reason provided';
    behavior.isConfidential = true; // Also mark as confidential
    behavior.updatedAt = Date.now();
    
    await behavior.save();

    await auditService.log(
      'DELETE',
      'EmployeeBehavior',
      behavior._id,
      req.user,
      { 
        action: 'soft_delete', 
        deletionReason: behavior.deletionReason,
        employeeId: behavior.employeeId
      },
      req
    );

    res.json({
      success: true,
      message: 'Behavior record deleted successfully'
    });

  } catch (error) {
    console.error('Delete behavior error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// Get employees with pending/escalated cases (kept for backward compatibility)
const getPendingCases = async (req, res) => {
  try {
    const pendingCases = await EmployeeBehavior.find({
      status: { $in: ['Open', 'Escalated'] },
      isDeleted: { $ne: true } // Exclude deleted records
    })
    .populate('employeeId', 'FirstName LastName EmployeeID DepartmentID')
    .populate('submittedBy', 'Username')
    .sort('-createdAt')
    .limit(50);

    await auditService.log(
      'VIEW',
      'EmployeeBehavior',
      null,
      req.user,
      { action: 'view_pending_cases', count: pendingCases.length },
      req
    );

    res.json({
      success: true,
      data: pendingCases,
      count: pendingCases.length
    });

  } catch (error) {
    console.error('Get pending cases error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// Get all behavior records with filters
const getAllBehavior = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      type,
      status,
      employeeId,
      department,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeDeleted = 'false'
    } = req.query;

    // Build filter - exclude deleted records by default
    const filter = {};
    
    if (includeDeleted !== 'true') {
      filter.isDeleted = { $ne: true };
    }

    // Apply other filters if provided
    if (category) filter.category = category;
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
      filter.employeeId = employeeId;
    }
    
    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Department filter requires lookup
    let departmentFilter = {};
    if (department && mongoose.Types.ObjectId.isValid(department)) {
      departmentFilter = { 'employee.DepartmentID': new mongoose.Types.ObjectId(department) };
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // If department filter is applied, use aggregation
    let behaviors, totalCount;

    if (Object.keys(departmentFilter).length > 0) {
      // Use aggregation for department filter
      const aggregation = await EmployeeBehavior.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: 'employees',
            localField: 'employeeId',
            foreignField: '_id',
            as: 'employee'
          }
        },
        { $unwind: '$employee' },
        { $match: departmentFilter },
        {
          $facet: {
            paginatedResults: [
              { $sort: sort },
              { $skip: skip },
              { $limit: pageSize },
              {
                $lookup: {
                  from: 'users',
                  localField: 'submittedBy',
                  foreignField: '_id',
                  as: 'submittedBy'
                }
              },
              {
                $lookup: {
                  from: 'users',
                  localField: 'resolvedBy',
                  foreignField: '_id',
                  as: 'resolvedBy'
                }
              },
              {
                $lookup: {
                  from: 'users',
                  localField: 'attachments.uploadedBy',
                  foreignField: '_id',
                  as: 'attachmentUploaders'
                }
              },
              {
                $project: {
                  'submittedBy.PasswordHash': 0,
                  'resolvedBy.PasswordHash': 0
                }
              }
            ],
            totalCount: [
              { $count: 'count' }
            ]
          }
        }
      ]);

      behaviors = aggregation[0].paginatedResults;
      totalCount = aggregation[0].totalCount[0]?.count || 0;
    } else {
      // Simple find with populate
      [behaviors, totalCount] = await Promise.all([
        EmployeeBehavior.find(filter)
          .populate('employeeId', 'FirstName LastName EmployeeID DepartmentID')
          .populate('submittedBy', 'Username')
          .populate('resolvedBy', 'Username')
          .populate('attachments.uploadedBy', 'Username')
          .sort(sort)
          .skip(skip)
          .limit(pageSize)
          .lean(),
        EmployeeBehavior.countDocuments(filter)
      ]);
    }

    // Add base URL for attachments
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    behaviors.forEach(behavior => {
      if (behavior.attachments && behavior.attachments.length > 0) {
        behavior.attachments.forEach(att => {
          att.fileUrl = `${baseUrl}/uploads/behavior/${att.filename}`;
        });
      }
    });

    // Get summary statistics
    const stats = await EmployeeBehavior.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          positiveCount: {
            $sum: { $cond: [{ $eq: ['$type', 'Positive'] }, 1, 0] }
          },
          negativeCount: {
            $sum: { $cond: [{ $eq: ['$type', 'Negative'] }, 1, 0] }
          },
          neutralCount: {
            $sum: { $cond: [{ $eq: ['$type', 'Neutral'] }, 1, 0] }
          },
          openCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] }
          },
          resolvedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] }
          },
          escalatedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Escalated'] }, 1, 0] }
          },
          closedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'Closed'] }, 1, 0] }
          }
        }
      }
    ]);

    await auditService.log(
      'VIEW',
      'EmployeeBehavior',
      null,
      req.user,
      { 
        action: 'view_all_behavior', 
        filters: { category, type, status, employeeId, department, startDate, endDate, includeDeleted },
        count: behaviors.length 
      },
      req
    );

    res.json({
      success: true,
      data: {
        behaviors,
        statistics: stats[0] || {
          totalRecords: 0,
          averageRating: 0,
          positiveCount: 0,
          negativeCount: 0,
          neutralCount: 0,
          openCount: 0,
          resolvedCount: 0,
          escalatedCount: 0,
          closedCount: 0
        },
        pagination: {
          currentPage: pageNumber,
          totalPages: Math.ceil(totalCount / pageSize),
          totalItems: totalCount,
          itemsPerPage: pageSize,
          hasNextPage: pageNumber < Math.ceil(totalCount / pageSize),
          hasPrevPage: pageNumber > 1
        }
      }
    });

  } catch (error) {
    console.error('Get all behavior error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

  
// Delete single attachment from a behavior record
const deleteAttachment = async (req, res) => {
  try {
    const { id, attachmentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid behavior ID format'
      });
    }

    const behavior = await EmployeeBehavior.findOne({
      _id: id,
      isDeleted: { $ne: true }
    });

    if (!behavior) {
      return res.status(404).json({
        success: false,
        message: 'Behavior record not found'
      });
    }

    const attachmentIndex = behavior.attachments.findIndex(
      att => att._id.toString() === attachmentId || att.filename === attachmentId
    );

    if (attachmentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    const attachment = behavior.attachments[attachmentIndex];

    if (attachment.filePath) {
      try {
        fs.unlinkSync(attachment.filePath);
      } catch (fileError) {
        console.error('Error deleting file:', fileError);
      }
    }

    behavior.attachments.splice(attachmentIndex, 1);
    behavior.updatedAt = Date.now();
    await behavior.save();

    await auditService.log(
      'UPDATE',
      'EmployeeBehavior',
      behavior._id,
      req.user,
      { 
        action: 'delete_attachment',
        attachmentName: attachment.originalName || attachment.filename
      },
      req
    );

    res.json({
      success: true,
      message: 'Attachment deleted successfully'
    });

  } catch (error) {
    console.error('Delete attachment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};


  
module.exports = {
  submitBehaviorFeedback,
  getEmployeeBehaviorHistory,
  getBehaviorSummary,
  getBehaviorById,
  updateBehavior,
  resolveBehavior,
  deleteBehavior,
  getPendingCases,
  getAllBehavior,
  deleteAttachment
};