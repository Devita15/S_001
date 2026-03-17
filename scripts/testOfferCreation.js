// scripts/testOfferCreation.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import models
require('../models/User');
require('../models/Role');
require('../models/Candidate');
require('../models/JobOpening');
require('../models/Application');
require('../models/Requisition');
require('../models/Offer');

const Offer = mongoose.model('Offer');
const Candidate = mongoose.model('Candidate');
const Application = mongoose.model('Application');

const testOfferCreation = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Find a candidate and application
    const candidate = await Candidate.findOne();
    if (!candidate) {
      console.log('❌ No candidate found. Please create a candidate first.');
      process.exit(1);
    }

    const application = await Application.findOne({ candidateId: candidate._id }).populate('jobId');
    if (!application) {
      console.log('❌ No application found for candidate.');
      process.exit(1);
    }

    console.log('Found candidate:', candidate.candidateId);
    console.log('Found application:', application.applicationId);

    // Generate offer ID manually to test
    const generateOfferId = async () => {
      const year = new Date().getFullYear();
      const count = await Offer.countDocuments({
        offerId: new RegExp(`OFF-${year}-`, 'i')
      });
      return `OFF-${year}-${(count + 1).toString().padStart(5, '0')}`;
    };

    const offerId = await generateOfferId();
    console.log('Generated offerId:', offerId);

    // Create test offer
    const offerData = {
      offerId,
      candidateId: candidate._id,
      applicationId: application._id,
      jobId: application.jobId._id,
      ctcDetails: {
        basic: 25000,
        hra: 12500,
        conveyanceAllowance: 1600,
        medicalAllowance: 1250,
        specialAllowance: 3000,
        bonus: 25000,
        gratuity: 12000,
        employerPf: 36000,
        employerEsi: 9750
      },
      offerDetails: {
        designation: application.jobId.title,
        department: application.jobId.department,
        location: application.jobId.location,
        reportingTo: 'Production Manager',
        employmentType: 'Permanent',
        probationPeriod: 6,
        noticePeriod: 30,
        joiningDate: new Date('2024-07-01'),
        benefits: ['Medical Insurance', 'Annual Bonus']
      },
      status: 'draft',
      createdBy: new mongoose.Types.ObjectId(),
      createdByName: 'Test HR',
      expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    };

    console.log('Creating offer with data:', offerData);

    const offer = await Offer.create(offerData);
    console.log('✅ Offer created successfully:', {
      offerId: offer.offerId,
      _id: offer._id,
      status: offer.status
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

testOfferCreation();