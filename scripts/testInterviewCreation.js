// scripts/testInterviewCreation.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import all models explicitly to ensure they're registered
require('../models/User');
require('../models/Role');
require('../models/Employee');
require('../models/Department');
require('../models/Designation');
require('../models/Candidate'); // Make sure Candidate is imported first
require('../models/JobOpening');
require('../models/Application');
require('../models/Interview');

const Interview = mongoose.model('Interview');
const Application = mongoose.model('Application');

const testInterviewCreation = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Find an application and populate references
    const application = await Application.findOne()
      .populate('candidateId')
      .populate('jobId');
      
    if (!application) {
      console.log('❌ No application found. Please create an application first.');
      console.log('You can create one via POST /api/candidates with a jobId');
      process.exit(1);
    }

    console.log('✅ Found application:', {
      id: application._id,
      applicationId: application.applicationId,
      candidateId: application.candidateId?._id,
      jobId: application.jobId?._id
    });

    // Generate interview ID
    const generateInterviewId = async () => {
      const year = new Date().getFullYear();
      const count = await Interview.countDocuments({
        interviewId: new RegExp(`INT-${year}-`, 'i')
      });
      return `INT-${year}-${(count + 1).toString().padStart(5, '0')}`;
    };

    const interviewId = await generateInterviewId();
    console.log('📝 Generated interviewId:', interviewId);

    // Create test interview
    const interviewData = {
      interviewId,
      applicationId: application._id,
      candidateId: application.candidateId?._id || new mongoose.Types.ObjectId(),
      jobId: application.jobId?._id || new mongoose.Types.ObjectId(),
      round: 'Technical',
      interviewers: [{
        interviewerId: new mongoose.Types.ObjectId(),
        name: 'Test Interviewer',
        email: 'interviewer@test.com'
      }],
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      duration: 60,
      type: 'video',
      meetingLink: 'https://meet.google.com/test-interview',
      status: 'scheduled',
      createdBy: new mongoose.Types.ObjectId()
    };

    console.log('📝 Creating interview with data:', interviewData);

    const interview = await Interview.create(interviewData);
    console.log('✅ Interview created successfully:', {
      id: interview._id,
      interviewId: interview.interviewId,
      round: interview.round,
      scheduledAt: interview.scheduledAt
    });

    // Update application with interview reference
    application.interviews = application.interviews || [];
    application.interviews.push(interview._id);
    application.status = 'interview_scheduled';
    await application.save();
    console.log('✅ Application updated with interview reference');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
};

testInterviewCreation();