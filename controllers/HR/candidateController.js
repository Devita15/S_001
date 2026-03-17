const Candidate = require('../../models/HR/Candidate');
const Application = require('../../models/HR/Application');
const JobOpening = require('../../models/HR/JobOpening');
const User = require('../../models/user\'s & setting\'s/User');
const Offer = require('../../models/HR/Offer');
const notificationService = require('../../services/notificationService');
const auditService = require('../../services/auditService');
const resumeParserService = require('../../services/resumeParserService');
const documentService = require('../../services/documentService');
const mongoose = require('mongoose');

// In candidateController.js, add this helper function at the top
const generateCandidateId = async () => {
  const Candidate = require('../../models/HR/Candidate');
  const year = new Date().getFullYear();
  const count = await Candidate.countDocuments({
    candidateId: new RegExp(`CAN-${year}-`, 'i')
  });
  return `CAN-${year}-${(count + 1).toString().padStart(5, '0')}`;
};

// Then update your addCandidate function:
const addCandidate = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      alternativePhone,
      dateOfBirth,
      gender,
      address,
      education,
      experience,
      skills,
      source,
      referredBy,
      jobId,
      notes
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !source) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, email, phone, and source are required'
      });
    }

    // Check if candidate exists
    const existingCandidate = await Candidate.findOne({
      $or: [
        { email: email.toLowerCase() },
        { phone: phone }
      ]
    });

    if (existingCandidate) {
      return res.status(400).json({
        success: false,
        message: 'Candidate already exists with this email or phone'
      });
    }

    // Generate candidate ID
    const candidateId = await generateCandidateId();

    // Create candidate with explicit candidateId
    const candidateData = {
      candidateId, // Explicitly set the generated ID
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone,
      alternativePhone,
      dateOfBirth,
      gender,
      address,
      education: education || [],
      experience: experience || [],
      skills: skills || [],
      source,
      referredBy,
      status: 'new',
      notes: notes ? [{
        text: notes,
        createdBy: req.user._id,
        createdByName: req.user.Username || 'HR',
        createdAt: new Date()
      }] : [],
      createdBy: req.user._id
    };

    console.log('Creating candidate with data:', candidateData);

    const candidate = await Candidate.create(candidateData);

    // If jobId provided, create application
    let application = null;
    if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
      const job = await JobOpening.findById(jobId);
      if (job) {
        const Application = require('../../models/HR/Application');
        
        // Generate application ID
        const generateApplicationId = async () => {
          const year = new Date().getFullYear();
          const count = await Application.countDocuments();
          return `APP-${year}-${(count + 1).toString().padStart(6, '0')}`;
        };
        
        const applicationId = await generateApplicationId();
        
        application = await Application.create({
          applicationId,
          jobId: job._id,
          candidateId: candidate._id,
          source,
          status: 'new',
          statusHistory: [{
            status: 'new',
            changedBy: req.user._id,
            changedByName: req.user.Username || 'HR',
            changedAt: new Date()
          }]
        });

        // Update job application count
        job.totalApplications += 1;
        await job.save();

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
              type: 'application_received',
              title: 'New Application Received',
              message: `${candidate.firstName} ${candidate.lastName} applied for ${job.title}`,
              data: {
                applicationId: application._id,
                candidateId: candidate._id,
                candidateName: `${candidate.firstName} ${candidate.lastName}`,
                jobId: job._id,
                jobTitle: job.title,
                link: `/applications/${application._id}`
              }
            });
          }
        }
      }
    }

    // Log audit
    await auditService.log(
      'CREATE',
      'Candidate',
      candidate._id,
      req.user,
      { candidateData },
      req
    );

    res.status(201).json({
      success: true,
      data: {
        candidate,
        application
      },
      message: 'Candidate added successfully'
    });

  } catch (error) {
    console.error('Add candidate error:', error);

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
        message: 'Candidate already exists with this email or phone'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};


// @desc    Update candidate resume
// @route   PUT /api/candidates/:id/resume
// @access  Private (HR only)
const updateCandidateResume = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Resume file is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid candidate ID format'
      });
    }

    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    // Upload file
    const fileData = await documentService.uploadAttachment(req.file, 'resumes');

    // Parse resume
    const parsedData = await resumeParserService.parseResume(req.file.path);

    // Update candidate with new resume data
    candidate.resume = {
      filename: req.file.originalname,
      fileUrl: fileData.fileUrl,
      uploadedAt: new Date(),
      parsedData
    };

    // Optionally update candidate fields from parsed data if they're empty
    if (!candidate.email && parsedData.email) {
      candidate.email = parsedData.email;
    }
    if (!candidate.phone && parsedData.phone) {
      candidate.phone = parsedData.phone;
    }
    if (parsedData.skills && parsedData.skills.length > 0) {
      // Merge skills, avoid duplicates
      candidate.skills = [...new Set([...candidate.skills, ...parsedData.skills])];
    }

    // Add note about resume update
    candidate.notes.push({
      text: `Resume updated by ${req.user.Username || 'HR'}`,
      createdBy: req.user._id,
      createdByName: req.user.Username || 'HR',
      createdAt: new Date()
    });

    await candidate.save();

    // Log audit
    await auditService.log(
      'UPDATE',
      'Candidate',
      candidate._id,
      req.user,
      { action: 'Resume updated', filename: req.file.originalname },
      req
    );

    res.json({
      success: true,
      data: candidate,
      message: 'Resume updated successfully'
    });

  } catch (error) {
    console.error('Update resume error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};


// @desc    Update candidate details
// @route   PUT /api/candidates/:id
// @access  Private (HR only)
const updateCandidate = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      email,
      phone,
      alternativePhone,
      dateOfBirth,
      gender,
      address,
      education,
      experience,
      skills,
      source,
      sourceUrl,
      referredBy,
      tags,
      status,
      jobId // Add jobId here
    } = req.body;

    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid candidate ID format'
      });
    }

    // Find candidate
    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    // Check if email/phone already exists for another candidate
    if (email || phone) {
      const existingCandidate = await Candidate.findOne({
        _id: { $ne: id },
        $or: [
          ...(email ? [{ email: email.toLowerCase() }] : []),
          ...(phone ? [{ phone }] : [])
        ]
      });

      if (existingCandidate) {
        return res.status(400).json({
          success: false,
          message: 'Another candidate already exists with this email or phone'
        });
      }
    }

    // Store old data for audit
    const oldData = {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      status: candidate.status,
      source: candidate.source
    };

    // Update fields
    if (firstName) candidate.firstName = firstName;
    if (lastName) candidate.lastName = lastName;
    if (email) candidate.email = email.toLowerCase();
    if (phone) candidate.phone = phone;
    if (alternativePhone !== undefined) candidate.alternativePhone = alternativePhone;
    if (dateOfBirth) candidate.dateOfBirth = dateOfBirth;
    if (gender) candidate.gender = gender;
    if (source) candidate.source = source;
    if (sourceUrl !== undefined) candidate.sourceUrl = sourceUrl;
    if (referredBy !== undefined) candidate.referredBy = referredBy;
    if (tags) candidate.tags = tags;
    if (status) candidate.status = status;

    // Update address if provided
    if (address) {
      candidate.address = {
        ...candidate.address,
        ...address
      };
    }

    // Update education if provided
    if (education) {
      // If education array is provided, replace it
      if (Array.isArray(education)) {
        candidate.education = education;
      }
    }

    // Update experience if provided
    if (experience) {
      // If experience array is provided, replace it
      if (Array.isArray(experience)) {
        candidate.experience = experience;
      }
    }

    // Update skills if provided
    if (skills) {
      // If skills array is provided, replace it
      if (Array.isArray(skills)) {
        candidate.skills = skills;
      }
    }

    // Handle jobId if provided - create/update application
    let updatedApplication = null;
    if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
      const job = await JobOpening.findById(jobId);
      if (job) {
        // Check if application already exists for this job
        let application = await Application.findOne({
          candidateId: candidate._id,
          jobId: job._id
        });

        if (!application) {
          // Create new application
          const generateApplicationId = async () => {
            const year = new Date().getFullYear();
            const count = await Application.countDocuments();
            return `APP-${year}-${(count + 1).toString().padStart(6, '0')}`;
          };
          
          const applicationId = await generateApplicationId();
          
          application = await Application.create({
            applicationId,
            jobId: job._id,
            candidateId: candidate._id,
            source: source || candidate.source || 'other',
            status: status || candidate.status || 'new',
            statusHistory: [{
              status: status || candidate.status || 'new',
              changedBy: req.user._id,
              changedByName: req.user.Username || 'HR',
              changedAt: new Date(),
              notes: 'Application created via candidate update'
            }]
          });

          // Update job application count
          job.totalApplications += 1;
          await job.save();

          // Notify HR about new application
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
                type: 'application_received',
                title: 'New Application Created',
                message: `${candidate.firstName} ${candidate.lastName} applied for ${job.title}`,
                data: {
                  applicationId: application._id,
                  candidateId: candidate._id,
                  candidateName: `${candidate.firstName} ${candidate.lastName}`,
                  jobId: job._id,
                  jobTitle: job.title,
                  link: `/applications/${application._id}`
                }
              });
            }
          }
        } else {
          // Update existing application status if provided
          if (status && status !== application.status) {
            application.status = status;
            application.statusHistory.push({
              status,
              changedBy: req.user._id,
              changedByName: req.user.Username || 'HR',
              changedAt: new Date(),
              notes: 'Status updated via candidate update'
            });
            await application.save();
          }
        }
        updatedApplication = application;
      }
    }

    // Add system note about update
    candidate.notes.push({
      text: `Candidate details updated by ${req.user.Username || 'HR'}`,
      createdBy: req.user._id,
      createdByName: req.user.Username || 'HR',
      createdAt: new Date()
    });

    await candidate.save();

    // If status was updated, update all related applications
    if (status && status !== oldData.status) {
      await Application.updateMany(
        { candidateId: candidate._id },
        {
          status,
          $push: {
            statusHistory: {
              status,
              changedBy: req.user._id,
              changedByName: req.user.Username || 'HR',
              changedAt: new Date(),
              notes: `Status updated from ${oldData.status} to ${status} via candidate update`
            }
          }
        }
      );
    }

    // Log audit
    await auditService.log(
      'UPDATE',
      'Candidate',
      candidate._id,
      req.user,
      { 
        oldData, 
        newData: {
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          status: candidate.status,
          source: candidate.source
        },
        updatedFields: Object.keys(req.body),
        jobAssociation: jobId ? 'Updated/Created' : 'No change'
      },
      req
    );

    // Get updated candidate with applications
    const updatedCandidate = await Candidate.findById(id);
    const applications = await Application.find({ candidateId: candidate._id })
      .populate('jobId', 'title jobId location department')
      .sort('-createdAt');

    res.json({
      success: true,
      data: {
        ...updatedCandidate.toObject(),
        applications,
        newApplication: updatedApplication // Include the new/updated application if any
      },
      message: jobId ? 'Candidate and job application updated successfully' : 'Candidate updated successfully'
    });

  } catch (error) {
    console.error('Update candidate error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed: ' + messages.join(', ')
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Candidate already exists with this email or phone'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Upload and parse resume for existing candidate
// @route   POST /api/candidates/upload-resume
// @access  Private (HR only)
const uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Resume file is required'
      });
    }

    const { candidateId } = req.body;

    if (!candidateId) {
      return res.status(400).json({
        success: false,
        message: 'Candidate ID is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(candidateId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid candidate ID format'
      });
    }

    // Find candidate by ID
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    // Upload file
    const fileData = await documentService.uploadAttachment(req.file, 'resumes');

    // Parse resume
    const parsedData = await resumeParserService.parseResume(req.file.path);

    // Update candidate with resume data
    candidate.resume = {
      filename: req.file.originalname,
      fileUrl: fileData.fileUrl,
      uploadedAt: new Date(),
      parsedData
    };

    // Optionally update candidate fields from parsed data if they're empty
    if (!candidate.email && parsedData.email) {
      candidate.email = parsedData.email;
    }
    if (!candidate.phone && parsedData.phone) {
      candidate.phone = parsedData.phone;
    }
    if (parsedData.skills && parsedData.skills.length > 0) {
      // Merge skills, avoid duplicates
      candidate.skills = [...new Set([...candidate.skills, ...parsedData.skills])];
    }

    // Add note about resume upload
    candidate.notes.push({
      text: `Resume uploaded by ${req.user.Username || 'HR'}`,
      createdBy: req.user._id,
      createdByName: req.user.Username || 'HR',
      createdAt: new Date()
    });

    candidate.updatedAt = new Date();
    await candidate.save();

    // Log audit
    await auditService.log(
      'UPDATE',
      'Candidate',
      candidate._id,
      req.user,
      { 
        action: 'Resume uploaded', 
        filename: req.file.originalname,
        parsedData: parsedData 
      },
      req
    );

    res.status(200).json({
      success: true,
      data: candidate,
      message: 'Resume uploaded and candidate updated successfully'
    });

  } catch (error) {
    console.error('Upload resume error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed: ' + messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get all candidates
// @route   GET /api/candidates
// @access  Private
const getCandidates = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      source,
      search,
      jobId,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};

    if (status) filter.status = status;
    if (source) filter.source = source;

    if (search) {
      filter.$or = [
        { candidateId: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by job if provided
    let candidateIds = [];
    if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
      const applications = await Application.find({ jobId }).select('candidateId');
      candidateIds = applications.map(app => app.candidateId);
      filter._id = { $in: candidateIds };
    }

    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    // FORCE DESCENDING ORDER - Always sort by createdAt in descending order
    // This overrides any sortBy or sortOrder parameters
    const sort = { createdAt: -1 }; // -1 for descending, 1 for ascending

    const [candidates, totalCount] = await Promise.all([
      Candidate.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Candidate.countDocuments(filter)
    ]);

    // Get latest application and associated offer for each candidate
    for (let candidate of candidates) {
      // Get latest application
      const latestApp = await Application.findOne({ candidateId: candidate._id })
        .populate('jobId', 'title jobId')
        .select('applicationId _id status')
        .sort('-createdAt')
        .lean();
      
      candidate.latestApplication = latestApp;

      // If there's a latest application, get the associated offer
      if (latestApp && latestApp._id) {
        const offer = await Offer.findOne({ 
          applicationId: latestApp._id,
          candidateId: candidate._id
        })
        .select('offerId status offerDate ctcDetails offerDetails')
        .sort('-createdAt')
        .lean();

        candidate.latestOffer = offer || null;
      } else {
        candidate.latestOffer = null;
      }
    }

    res.json({
      success: true,
      data: candidates,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / pageSize),
        totalItems: totalCount,
        itemsPerPage: pageSize
      }
    });

  } catch (error) {
    console.error('Get candidates error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get candidate by ID
// @route   GET /api/candidates/:id
// @access  Private
const getCandidateById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid candidate ID format'
      });
    }

    const candidate = await Candidate.findById(id);

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    // Get all applications for this candidate
    const applications = await Application.find({ candidateId: candidate._id })
      .populate('jobId', 'title jobId location department')
      .populate('interviews')
      .sort('-createdAt');

    res.json({
      success: true,
      data: {
        ...candidate.toObject(),
        applications
      }
    });

  } catch (error) {
    console.error('Get candidate error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Update candidate status
// @route   PUT /api/candidates/:id/status
// @access  Private (HR, Interviewer)
const updateCandidateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid candidate ID format'
      });
    }

    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    const previousStatus = candidate.status;
    candidate.status = status;

    if (notes) {
      candidate.notes.push({
        text: notes,
        createdBy: req.user._id,
        createdByName: req.user.Username || 'User',
        createdAt: new Date()
      });
    }

    await candidate.save();

    // Update related applications
    await Application.updateMany(
      { candidateId: candidate._id },
      {
        status,
        $push: {
          statusHistory: {
            status,
            changedBy: req.user._id,
            changedByName: req.user.Username || 'User',
            changedAt: new Date(),
            notes
          }
        }
      }
    );

    // Log audit
    await auditService.log(
      'UPDATE',
      'Candidate',
      candidate._id,
      req.user,
      { previousStatus, newStatus: status, notes },
      req
    );

    res.json({
      success: true,
      data: candidate,
      message: 'Candidate status updated successfully'
    });

  } catch (error) {
    console.error('Update candidate status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Add note to candidate
// @route   POST /api/candidates/:id/notes
// @access  Private
const addCandidateNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Note text is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid candidate ID format'
      });
    }

    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    candidate.notes.push({
      text,
      createdBy: req.user._id,
      createdByName: req.user.Username || 'User',
      createdAt: new Date()
    });

    await candidate.save();

    res.json({
      success: true,
      data: candidate.notes[candidate.notes.length - 1],
      message: 'Note added successfully'
    });

  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Shortlist candidate for job
// @route   POST /api/candidates/:id/shortlist
// @access  Private (HR, Hiring Manager)
const shortlistCandidate = async (req, res) => {
  try {
    const { id } = req.params;
    const { jobId, notes } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'Job ID is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }

    const candidate = await Candidate.findById(id);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    const job = await JobOpening.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Find or create application
    let application = await Application.findOne({
      candidateId: candidate._id,
      jobId: job._id
    });

    if (!application) {
      application = await Application.create({
        jobId: job._id,
        candidateId: candidate._id,
        source: candidate.source,
        status: 'shortlisted',
        statusHistory: [{
          status: 'shortlisted',
          changedBy: req.user._id,
          changedByName: req.user.Username || 'User',
          changedAt: new Date(),
          notes
        }]
      });

      job.totalApplications += 1;
      await job.save();
    } else {
      application.status = 'shortlisted';
      application.statusHistory.push({
        status: 'shortlisted',
        changedBy: req.user._id,
        changedByName: req.user.Username || 'User',
        changedAt: new Date(),
        notes
      });
      await application.save();
    }

    candidate.status = 'shortlisted';
    await candidate.save();

    // Notify candidate (simulated)
    console.log(`Email sent to ${candidate.email}: You have been shortlisted for ${job.title}`);

    res.json({
      success: true,
      data: {
        candidate,
        application
      },
      message: 'Candidate shortlisted successfully'
    });

  } catch (error) {
    console.error('Shortlist candidate error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

module.exports = {
  addCandidate,
  uploadResume,
  getCandidates,
  getCandidateById,
  updateCandidateStatus,
  addCandidateNote,
  shortlistCandidate,
  updateCandidate, 
  updateCandidateResume,
};