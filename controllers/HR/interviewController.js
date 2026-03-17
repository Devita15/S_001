const Interview = require('../../models/HR/Interview');
const Application = require('../../models/HR/Application');
const Candidate = require('../../models/HR/Candidate');
const User = require('../../models/user\'s & setting\'s/User');
const notificationService = require('../../services/notificationService');
const auditService = require('../../services/auditService');
const calendarService = require('../../services/calendarService');
const emailService = require('../../services/emailService');
const mongoose = require('mongoose');

// In interviewController.js, add this helper function at the top
const generateInterviewId = async () => {
  const Interview = require('../../models/HR/Interview');
  const year = new Date().getFullYear();
  const count = await Interview.countDocuments({
    interviewId: new RegExp(`INT-${year}-`, 'i')
  });
  return `INT-${year}-${(count + 1).toString().padStart(5, '0')}`;
};

const scheduleInterview = async (req, res) => {
  try {
    const {
      applicationId,
      round,
      interviewers,
      scheduledAt,
      duration,
      type,
      location,
      meetingLink
    } = req.body;

    // Validate required fields
    if (!applicationId || !round || !interviewers || !scheduledAt || !type) {
      return res.status(400).json({
        success: false,
        message: 'Application ID, round, interviewers, scheduled time, and type are required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid application ID format'
      });
    }

    // Get application with details
    const application = await Application.findById(applicationId)
      .populate('candidateId')
      .populate('jobId');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // IMPORTANT: Check if application status is 'shortlisted'
    if (application.status !== 'shortlisted') {
      return res.status(400).json({
        success: false,
        message: `Cannot schedule interview. Application status must be 'shortlisted' to schedule an interview. Current status: ${application.status}`
      });
    }

    // Check interviewer availability via Google Calendar
    const interviewerIds = interviewers.map(i => i.interviewerId);
    const interviewersList = await User.find({ _id: { $in: interviewerIds } })
      .populate('EmployeeID');

    const availabilityCheck = await calendarService.checkAvailability(
      interviewersList.map(i => i.EmployeeID?.Email).filter(Boolean),
      new Date(scheduledAt),
      duration || 60
    );

    if (!availabilityCheck.available) {
      return res.status(400).json({
        success: false,
        message: 'Interviewer not available at the scheduled time',
        conflicts: availabilityCheck.conflicts
      });
    }

    // Generate interview ID
    const interviewId = await generateInterviewId();

    // Create interview
    const interviewData = {
      interviewId,
      applicationId: application._id,
      candidateId: application.candidateId._id,
      jobId: application.jobId._id,
      round,
      interviewers: interviewers.map(i => ({
        interviewerId: i.interviewerId,
        name: i.name,
        email: i.email
      })),
      scheduledAt: new Date(scheduledAt),
      duration: duration || 60,
      type,
      location,
      meetingLink,
      status: 'scheduled',
      createdBy: req.user._id
    };

    console.log('Creating interview with data:', interviewData);

    const interview = await Interview.create(interviewData);

    // Create calendar events
    const calendarEvents = await calendarService.createInterviewEvents(interview, application);
    interview.calendarEvents = calendarEvents;
    await interview.save();

    // Update application - change status to 'interview_scheduled'
    application.interviews.push(interview._id);
    application.status = 'interview_scheduled'; // Update to interview_scheduled
    application.statusHistory.push({
      status: 'interview_scheduled',
      changedBy: req.user._id,
      changedByName: req.user.Username || 'HR',
      changedAt: new Date(),
      notes: `${round} round scheduled`
    });
    await application.save();

    // Optionally update candidate status
    const candidate = await Candidate.findById(application.candidateId._id);
    if (candidate && candidate.status === 'shortlisted') {
      candidate.status = 'interviewed';
      await candidate.save();
    }

    // Send email notifications
    await emailService.sendInterviewInvitation(interview, application);

    // Send in-app notifications
    // To candidate (if user exists)
    const candidateUser = await User.findOne({ Email: application.candidateId.email });
    if (candidateUser) {
      await notificationService.createNotification({
        userId: candidateUser._id,
        type: 'interview_scheduled',
        title: 'Interview Scheduled',
        message: `Your ${round} interview for ${application.jobId.title} has been scheduled`,
        data: {
          interviewId: interview._id,
          applicationId: application._id,
          candidateId: application.candidateId._id,
          jobTitle: application.jobId.title,
          scheduledAt: interview.scheduledAt,
          link: `/interviews/${interview._id}`
        }
      });
    }

    // To interviewers
    for (const interviewer of interviewers) {
      await notificationService.createNotification({
        userId: interviewer.interviewerId,
        type: 'interview_scheduled',
        title: 'Interview Assigned',
        message: `You have been assigned as interviewer for ${application.candidateId.firstName} ${application.candidateId.lastName} - ${application.jobId.title}`,
        data: {
          interviewId: interview._id,
          applicationId: application._id,
          candidateName: `${application.candidateId.firstName} ${application.candidateId.lastName}`,
          jobTitle: application.jobId.title,
          scheduledAt: interview.scheduledAt,
          link: `/interviews/${interview._id}`
        }
      });
    }

    // Log audit
    await auditService.log(
      'SCHEDULE',
      'Interview',
      interview._id,
      req.user,
      { interviewData },
      req
    );

    res.status(201).json({
      success: true,
      data: interview,
      message: 'Interview scheduled successfully'
    });

  } catch (error) {
    console.error('Schedule interview error:', error);

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
        message: 'Duplicate interview ID. Please try again.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Reschedule interview
// @route   PUT /api/interviews/:id/reschedule
// @access  Private (HR only)
const rescheduleInterview = async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledAt, reason } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({
        success: false,
        message: 'New scheduled time is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid interview ID format'
      });
    }

    const interview = await Interview.findById(id)
      .populate({
        path: 'applicationId',
        populate: [
          { path: 'candidateId' },
          { path: 'jobId' }
        ]
      });

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview not found'
      });
    }

    if (interview.status !== 'scheduled') {
      return res.status(400).json({
        success: false,
        message: `Cannot reschedule interview with status: ${interview.status}`
      });
    }

    const previousTime = interview.scheduledAt;
    interview.scheduledAt = new Date(scheduledAt);
    interview.status = 'rescheduled';
    await interview.save();

    // Update calendar events
    await calendarService.updateInterviewEvents(interview, previousTime);

    // Send notifications
    // To candidate
    const candidateUser = await User.findOne({ Email: interview.applicationId.candidateId.email });
    if (candidateUser) {
      await notificationService.createNotification({
        userId: candidateUser._id,
        type: 'interview_scheduled',
        title: 'Interview Rescheduled',
        message: `Your interview has been rescheduled to ${new Date(scheduledAt).toLocaleString()}. Reason: ${reason || 'Schedule change'}`,
        data: {
          interviewId: interview._id,
          applicationId: interview.applicationId._id,
          scheduledAt: interview.scheduledAt,
          link: `/interviews/${interview._id}`
        }
      });
    }

    // To interviewers
    for (const interviewer of interview.interviewers) {
      await notificationService.createNotification({
        userId: interviewer.interviewerId,
        type: 'interview_scheduled',
        title: 'Interview Rescheduled',
        message: `Interview with ${interview.applicationId.candidateId.firstName} ${interview.applicationId.candidateId.lastName} has been rescheduled`,
        data: {
          interviewId: interview._id,
          applicationId: interview.applicationId._id,
          scheduledAt: interview.scheduledAt,
          link: `/interviews/${interview._id}`
        }
      });
    }

    // Send emails
    await emailService.sendInterviewReschedule(interview, reason);

    res.json({
      success: true,
      data: interview,
      message: 'Interview rescheduled successfully'
    });

  } catch (error) {
    console.error('Reschedule interview error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Cancel interview
// @route   POST /api/interviews/:id/cancel
// @access  Private (HR, SuperAdmin/CEO)
const cancelInterview = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid interview ID format'
      });
    }

    const interview = await Interview.findById(id)
      .populate({
        path: 'applicationId',
        populate: [
          { path: 'candidateId' },
          { path: 'jobId' }
        ]
      });

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview not found'
      });
    }

    if (interview.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Interview is already cancelled'
      });
    }

    interview.status = 'cancelled';
    await interview.save();

    // Delete calendar events
    await calendarService.deleteInterviewEvents(interview);

    // Update application
    const application = interview.applicationId;
    application.status = 'shortlisted'; // Revert to shortlisted
    application.statusHistory.push({
      status: 'shortlisted',
      changedBy: req.user._id,
      changedByName: req.user.Username || 'HR',
      changedAt: new Date(),
      notes: `Interview cancelled: ${reason || 'No reason provided'}`
    });
    await application.save();

    // Send notifications
    const candidateUser = await User.findOne({ Email: application.candidateId.email });
    if (candidateUser) {
      await notificationService.createNotification({
        userId: candidateUser._id,
        type: 'interview_scheduled',
        title: 'Interview Cancelled',
        message: `Your interview has been cancelled. Reason: ${reason || 'Schedule conflict'}`,
        data: {
          interviewId: interview._id,
          applicationId: application._id,
          link: `/applications/${application._id}`
        }
      });
    }

    // Send emails
    await emailService.sendInterviewCancellation(interview, reason);

    res.json({
      success: true,
      message: 'Interview cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel interview error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Submit interview feedback
// @route   POST /api/interviews/:id/feedback
// @access  Private (Interviewer only)
const submitFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { ratings, comments, strengths, weaknesses, decision } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid interview ID format'
      });
    }

    const interview = await Interview.findById(id)
      .populate({
        path: 'applicationId',
        populate: [
          { path: 'candidateId' },
          { path: 'jobId' }
        ]
      });

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview not found'
      });
    }

    // Check if user is an interviewer
    const isInterviewer = interview.interviewers.some(
      i => i.interviewerId.toString() === req.user._id.toString()
    );

    if (!isInterviewer && req.user.RoleName !== 'SuperAdmin' && req.user.RoleName !== 'CEO' && req.user.RoleName !== 'HR') {
      return res.status(403).json({
        success: false,
        message: 'Only assigned interviewers can submit feedback'
      });
    }

    if (interview.feedback && interview.feedback.submittedAt) {
      return res.status(400).json({
        success: false,
        message: 'Feedback already submitted for this interview'
      });
    }

    // Calculate overall rating if not provided
    let overallRating = ratings?.overall;
    if (!overallRating && ratings) {
      const ratingValues = Object.values(ratings).filter(r => typeof r === 'number');
      overallRating = ratingValues.length > 0
        ? Math.round(ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length)
        : 3;
    }

    interview.feedback = {
      ratings: {
        technical: ratings?.technical || 3,
        communication: ratings?.communication || 3,
        problemSolving: ratings?.problemSolving || 3,
        culturalFit: ratings?.culturalFit || 3,
        overall: overallRating || 3
      },
      comments,
      strengths,
      weaknesses,
      decision,
      submittedBy: req.user._id,
      submittedAt: new Date()
    };

    interview.status = 'completed';
    await interview.save();

    // Update application status based on decision
    const application = interview.applicationId;
    if (decision === 'select') {
      application.status = 'selected'; 
    } else if (decision === 'reject') {
      application.status = 'rejected';
    } else if (decision === 'hold') {
      application.status = 'onHold'; // or 'hold' based on your enum
    } else {
      application.status = 'interviewed'; 
    }
    
    application.statusHistory.push({
      status: application.status,
      changedBy: req.user._id,
      changedByName: req.user.Username || 'Interviewer',
      changedAt: new Date(),
      notes: `Interview feedback submitted: ${decision || 'No decision'}`
    });
    await application.save();

    // Update candidate status
    const candidate = await Candidate.findById(interview.candidateId);
    if (candidate) {
      if (decision === 'select') {
        candidate.status = 'selected';
      } else if (decision === 'reject') {
        candidate.status = 'rejected';
      } else if (decision === 'hold') {
        candidate.status = 'onHold'; // Set candidate status to onhold
      } else {
        candidate.status = 'interviewed'; // For other cases
      }
      await candidate.save();
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
          type: 'feedback_submitted',
          title: 'Interview Feedback Submitted',
          message: `Feedback submitted for ${application.candidateId.firstName} ${application.candidateId.lastName} - ${interview.round} round`,
          data: {
            interviewId: interview._id,
            applicationId: application._id,
            candidateName: `${application.candidateId.firstName} ${application.candidateId.lastName}`,
            decision,
            link: `/interviews/${interview._id}`
          }
        });
      }
    }

    // Log audit
    await auditService.log(
      'FEEDBACK',
      'Interview',
      interview._id,
      req.user,
      { decision, ratings },
      req
    );

    res.json({
      success: true,
      data: interview,
      message: 'Feedback submitted successfully'
    });

  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get interviews
// @route   GET /api/interviews
// @access  Private
const getInterviews = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      fromDate,
      toDate,
      interviewerId,
      sortBy = 'scheduledAt',
      sortOrder = 'asc'
    } = req.query;

    const filter = {};

    if (status) filter.status = status;

    if (fromDate || toDate) {
      filter.scheduledAt = {};
      if (fromDate) filter.scheduledAt.$gte = new Date(fromDate);
      if (toDate) filter.scheduledAt.$lte = new Date(toDate);
    }

    // Filter by interviewer
    if (interviewerId) {
      filter['interviewers.interviewerId'] = mongoose.Types.ObjectId(interviewerId);
    } else if (req.user.RoleName !== 'SuperAdmin' && req.user.RoleName !== 'CEO' && req.user.RoleName !== 'HR') {
      // Non-admin users see only interviews they're part of
      filter['interviewers.interviewerId'] = req.user._id;
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [interviews, totalCount] = await Promise.all([
      Interview.find(filter)
        .populate({
          path: 'applicationId',
          populate: [
            { path: 'candidateId', select: 'firstName lastName email phone' },
            { path: 'jobId', select: 'title jobId' }
          ]
        })
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Interview.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: interviews,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / pageSize),
        totalItems: totalCount,
        itemsPerPage: pageSize
      }
    });

  } catch (error) {
    console.error('Get interviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get interview by ID
// @route   GET /api/interviews/:id
// @access  Private
const getInterviewById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid interview ID format'
      });
    }

    const interview = await Interview.findById(id)
      .populate({
        path: 'applicationId',
        populate: [
          { path: 'candidateId' },
          { path: 'jobId' }
        ]
      })
      .populate('interviewers.interviewerId', 'Username Email')
      .populate('createdBy', 'Username Email')
      .populate('feedback.submittedBy', 'Username Email');

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview not found'
      });
    }

    res.json({
      success: true,
      data: interview
    });

  } catch (error) {
    console.error('Get interview error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

module.exports = {
  scheduleInterview,
  rescheduleInterview,
  cancelInterview,
  submitFeedback,
  getInterviews,
  getInterviewById
};