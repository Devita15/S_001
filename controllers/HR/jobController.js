const JobOpening = require('../../models/HR/JobOpening');
const Requisition = require('../../models/HR/Requisition');
const User = require('../../models/user\'s & setting\'s/User');
const notificationService = require('../../services/notificationService');
const auditService = require('../../services/auditService');
const jobBoardService = require('../../services/jobBoardService');
const mongoose = require('mongoose');

// In jobController.js, add this helper function at the top
const generateJobId = async () => {
  const JobOpening = require('../../models/HR/JobOpening');
  const year = new Date().getFullYear();
  const count = await JobOpening.countDocuments({
    jobId: new RegExp(`JOB-${year}-`, 'i')
  });
  return `JOB-${year}-${(count + 1).toString().padStart(4, '0')}`;
};

// Then in your createJobOpening function, before creating the job:
const createJobOpening = async (req, res) => {
  try {
    const {
      requisitionId,
      description,
      companyIntro,
      publishTo,
      requirements,
      responsibilities
    } = req.body;

    if (!requisitionId || !description) {
      return res.status(400).json({
        success: false,
        message: 'Requisition ID and description are required'
      });
    }

    // Find requisition
    const requisition = await Requisition.findById(requisitionId);
    if (!requisition) {
      return res.status(404).json({
        success: false,
        message: 'Requisition not found'
      });
    }

    // Check if requisition is approved
    if (requisition.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Job can only be created from approved requisitions'
      });
    }

    // Check if job already exists for this requisition
    const existingJob = await JobOpening.findOne({ requisitionId: requisition._id });
    if (existingJob) {
      return res.status(400).json({
        success: false,
        message: 'Job opening already exists for this requisition'
      });
    }

    // Prepare publish platforms
    const publishPlatforms = Array.isArray(publishTo) ? publishTo : ['careerPage'];
    const publishData = publishPlatforms.map(platform => ({
      platform,
      status: 'pending'
    }));

    // Create job opening - DON'T set jobId here, let the schema pre-save hook handle it
    const jobData = {
      // Remove jobId from here - let the schema generate it
      requisitionId: requisition._id,
      requisitionNumber: requisition.requisitionId,
      title: requisition.positionTitle,
      description,
      companyIntro: companyIntro || 'Suyash Enterprises',
      requirements: requirements || requisition.skills,
      responsibilities: responsibilities || [],
      location: requisition.location,
      department: requisition.department,
      employmentType: requisition.employmentType,
      experienceRequired: {
        min: requisition.experienceYears,
        max: requisition.experienceYears + 2
      },
      salaryRange: {
        min: requisition.budgetMin,
        max: requisition.budgetMax,
        currency: 'INR'
      },
      skills: requisition.skills,
      education: [requisition.education],
      status: 'open',
      publishTo: publishData,
      createdBy: req.user._id,
      createdByName: req.user.Username || 'HR'
    };

    console.log('Creating job with data:', jobData);

    const job = await JobOpening.create(jobData);

    // Update requisition status
    requisition.status = 'in_progress';
    await requisition.save();

    // Log audit
    await auditService.log(
      'CREATE',
      'JobOpening',
      job._id,
      req.user,
      { jobData },
      req
    );

    res.status(201).json({
      success: true,
      data: {
        jobId: job.jobId,
        _id: job._id,
        title: job.title,
        status: job.status
      },
      message: 'Job opening created successfully'
    });

  } catch (error) {
    console.error('Create job opening error:', error);

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
        message: 'Duplicate job ID. Please try again.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Publish job to job boards
// @route   POST /api/jobs/:id/publish
// @access  Private (HR only)
const publishJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { platforms } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid job ID format'
      });
    }

    const job = await JobOpening.findById(id);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job opening not found'
      });
    }

    if (job.status !== 'open') {
      return res.status(400).json({
        success: false,
        message: `Cannot publish job with status: ${job.status}`
      });
    }

    // Determine which platforms to publish to
    const platformsToPublish = platforms || job.publishTo.map(p => p.platform);

    // Publish to each platform
    const publishResults = [];
    for (const platform of platformsToPublish) {
      const result = await jobBoardService.publishJob(job, platform);
      publishResults.push(result);
      
      // Update job publish status
      const publishEntry = job.publishTo.find(p => p.platform === platform);
      if (publishEntry) {
        publishEntry.status = result.success ? 'published' : 'failed';
        publishEntry.jobUrl = result.jobUrl;
        publishEntry.postedAt = result.success ? new Date() : null;
        publishEntry.error = result.error;
      }
    }

    // Update job status
    const allPublished = job.publishTo.every(p => p.status === 'published');
    job.status = allPublished ? 'published' : 'open';
    job.publishedAt = allPublished ? new Date() : null;
    await job.save();

    // Log audit
    await auditService.log(
      'PUBLISH',
      'JobOpening',
      job._id,
      req.user,
      { platforms: platformsToPublish, results: publishResults },
      req
    );

    res.json({
      success: true,
      data: {
        jobId: job.jobId,
        status: job.status,
        publishResults
      },
      message: allPublished ? 'Job published successfully' : 'Job published with some failures'
    });

  } catch (error) {
    console.error('Publish job error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get all jobs
// @route   GET /api/jobs
// @access  Private
const getJobs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      department,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};

    if (status) filter.status = status;
    if (department) filter.department = { $regex: department, $options: 'i' };

    if (search) {
      filter.$or = [
        { jobId: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Role-based filtering
    const user = req.user;
    const userRole = user.RoleName;

    // SuperAdmin/CEO sees all, others see only published or their own
    if (!['SuperAdmin', 'CEO', 'HR'].includes(userRole)) {
      filter.status = { $in: ['published', 'open'] };
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [jobs, totalCount] = await Promise.all([
      JobOpening.find(filter)
        .populate('requisitionId', 'requisitionId department')
        .populate('createdBy', 'Username')
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      JobOpening.countDocuments(filter)
    ]);

    // Add application counts
    const Application = require('../../models/HR/Application');
    for (let job of jobs) {
      job.applicationCount = await Application.countDocuments({ jobId: job._id });
    }

    res.json({
      success: true,
      data: jobs,
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
    console.error('Get jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get job by ID
// @route   GET /api/jobs/:id
// @access  Private
const getJobById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid job ID format'
      });
    }

    const job = await JobOpening.findById(id)
      .populate('requisitionId')
      .populate('createdBy', 'Username Email');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Get applications for this job
    const Application = require('../../models/HR/Application');
    const applications = await Application.find({ jobId: job._id })
      .populate('candidateId', 'firstName lastName email phone')
      .sort('-createdAt')
      .limit(10);

    res.json({
      success: true,
      data: {
        ...job.toObject(),
        recentApplications: applications
      }
    });

  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Update job
// @route   PUT /api/jobs/:id
// @access  Private (HR only)
const updateJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid job ID format'
      });
    }

    const job = await JobOpening.findById(id);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Only allow updates if job is in draft
    //if (job.status !== 'draft') {
      //return res.status(400).json({
       // success: false,
       // message: 'Can only update jobs in draft status'
     // });
   // }

    if (job.status === 'closed' || job.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update closed or cancelled jobs'
      });
    }
    const forbiddenFields = ['jobId', 'requisitionId', 'createdBy', 'createdAt', 'status'];
    const updateData = { ...req.body };
    forbiddenFields.forEach(field => delete updateData[field]);

    const updatedJob = await JobOpening.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    await auditService.log(
      'UPDATE',
      'JobOpening',
      job._id,
      req.user,
      {
        previousData: job.toObject(),
        updatedData: updateData
      },
      req
    );

    res.json({
      success: true,
      data: updatedJob,
      message: 'Job updated successfully'
    });

  } catch (error) {
    console.error('Update job error:', error);

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

// @desc    Delete job permanently
// @route   DELETE /api/jobs/:id
// @access  Private
const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid job ID format'
      });
    }

    const job = await JobOpening.findById(id);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Hard delete the job
    await JobOpening.findByIdAndDelete(id);

    // Log audit
    await auditService.log(
      'DELETE',
      'JobOpening',
      id,
      req.user,
      { 
        deletedJob: {
          jobId: job.jobId,
          title: job.title,
          requisitionId: job.requisitionId
        }
      },
      req
    );

    res.json({
      success: true,
      message: 'Job deleted successfully'
    });

  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Close job
// @route   POST /api/jobs/:id/close
// @access  Private (HR, SuperAdmin/CEO)
const closeJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid job ID format'
      });
    }

    const job = await JobOpening.findById(id);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    if (job.status === 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Job is already closed'
      });
    }

    job.status = 'closed';
    job.closedAt = new Date();
    await job.save();

    // Update requisition if needed
    if (job.requisitionId) {
      await Requisition.findByIdAndUpdate(job.requisitionId, {
        status: 'filled',
        actualHireDate: new Date()
      });
    }

    await auditService.log(
      'UPDATE',
      'JobOpening',
      job._id,
      req.user,
      { action: 'close', reason },
      req
    );

    res.json({
      success: true,
      message: 'Job closed successfully',
      data: {
        jobId: job.jobId,
        status: job.status
      }
    });

  } catch (error) {
    console.error('Close job error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

module.exports = {
  createJobOpening,
  publishJob,
  getJobs,
  getJobById,
  updateJob,
  closeJob,
  deleteJob
};