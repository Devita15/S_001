const Offer = require('../models/Offer');
const OfferApprovalFlow = require('../models/OfferApprovalFlow');
const Candidate = require('../models/Candidate');
const Application = require('../models/Application');
const JobOpening = require('../models/JobOpening');
const Requisition = require('../../models/HR/Requisition');
const User = require('../../models/User');
const ctcCalculator = require('../../services/ctcCalculatorService');
const pdfGenerator = require('../../services/playwrightPdfGenerator');
const workflowService = require('../../services/workflowService');
const emailService = require('../../services/emailService');
const notificationService = require('../../services/notificationService');
const auditService = require('../../services/auditService');
const cloudStorage = require('../../services/cloudStorageService');
const mongoose = require('mongoose');

// In offerController.js, add this helper function at the top
const generateOfferId = async () => {
  const Offer = require('../models/Offer');
  const year = new Date().getFullYear();
  const count = await Offer.countDocuments({
    offerId: new RegExp(`OFF-${year}-`, 'i')
  });
  return `OFF-${year}-${(count + 1).toString().padStart(5, '0')}`;
};

// Then update your initiateOffer function:

const initiateOffer = async (req, res) => {
  try {
    const {
      candidateId,
      applicationId,
      ctcComponents,
      offerDetails,
      joiningDate
    } = req.body;

    // Validate required fields
    if (!candidateId || !applicationId || !ctcComponents || !ctcComponents.basic) {
      return res.status(400).json({
        success: false,
        message: 'Candidate ID, Application ID, and basic salary are required'
      });
    }

    // Get candidate and application
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    const application = await Application.findById(applicationId)
      .populate('jobId');
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // Validate CTC components
    const validation = ctcCalculator.validateCTC(ctcComponents);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid CTC components',
        errors: validation.errors
      });
    }

    // Calculate CTC
    const calculatedCTC = ctcCalculator.calculateCTC(ctcComponents);

    // Get job and requisition details
    const job = application.jobId;
    const requisition = await Requisition.findById(job.requisitionId);

    // GENERATE OFFER ID HERE - THIS IS THE KEY FIX
    const offerId = await generateOfferId();
    console.log('Generated offerId:', offerId);

    // Prepare offer data with explicit offerId
    const offerData = {
      offerId, // Explicitly set the generated ID
      candidateId: candidate._id,
      applicationId: application._id,
      jobId: job._id,
      requisitionId: requisition?._id,
      ctcDetails: {
        basic: ctcComponents.basic,
        hra: calculatedCTC.monthly.hra,
        conveyanceAllowance: calculatedCTC.monthly.conveyance,
        medicalAllowance: calculatedCTC.monthly.medical,
        specialAllowance: calculatedCTC.monthly.special,
        bonus: calculatedCTC.annual.bonus,
        gratuity: calculatedCTC.annual.gratuity,
        employerPf: calculatedCTC.annual.employerPf,
        employerEsi: calculatedCTC.annual.employerEsi,
        otherAllowances: ctcComponents.otherAllowances || 0,
        gross: calculatedCTC.monthly.gross,
        totalCtc: calculatedCTC.annual.totalCTC
      },
      offerDetails: {
        designation: job.title,
        department: job.department,
        location: job.location,
        reportingTo: offerDetails?.reportingTo,
        employmentType: job.employmentType,
        probationPeriod: offerDetails?.probationPeriod || 6,
        noticePeriod: offerDetails?.noticePeriod || 30,
        joiningDate: joiningDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        benefits: offerDetails?.benefits || []
      },
      status: 'initiated',
      createdBy: req.user._id,
      createdByName: req.user.Username || 'HR',
      expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 days
    };

    console.log('Creating offer with data:', offerData);

    const offer = await Offer.create(offerData);
    console.log('✅ Offer created successfully:', offer.offerId);

    // Log audit
    await auditService.log(
      'CREATE',
      'Offer',
      offer._id,
      req.user,
      { offerData },
      req
    );

    res.status(201).json({
      success: true,
      data: {
        offerId: offer.offerId,
        _id: offer._id,
        ctcDetails: offer.ctcDetails,
        status: offer.status
      },
      message: 'Offer initiated successfully'
    });

  } catch (error) {
    console.error('Initiate offer error:', error);

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
        message: 'Duplicate offer ID. Please try again.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Submit offer for approval
// @route   POST /api/offers/:id/submit-approval
// @access  Private (HR only)
const submitForApproval = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid offer ID format'
      });
    }

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }

    if (offer.status !== 'initiated') {
      return res.status(400).json({
        success: false,
        message: `Cannot submit offer with status: ${offer.status}`
      });
    }

    // Initialize approval workflow
    const approvalFlow = await workflowService.initApprovalFlow(offer, req.user);

    // Update offer
    offer.status = 'pending_approval';
    offer.approvalFlow = approvalFlow._id;
    await offer.save();

    res.json({
      success: true,
      data: {
        offerId: offer.offerId,
        status: offer.status,
        approvalFlowId: approvalFlow._id
      },
      message: 'Offer submitted for approval successfully'
    });

  } catch (error) {
    console.error('Submit for approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Approve offer (for approvers)
// @route   POST /api/offers/:id/approve
// @access  Private (Hiring Manager, Finance Head, CEO/SuperAdmin)
const approveOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments, signature } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid offer ID format'
      });
    }

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }

    if (!offer.approvalFlow) {
      return res.status(400).json({
        success: false,
        message: 'No approval flow found for this offer'
      });
    }

    // Process approval
    const approvalFlow = await workflowService.processApproval(
      offer.approvalFlow,
      req.user._id,
      'approved',
      {
        approverName: req.user.Username,
        comments,
        signature
      }
    );

    // ✅ REFRESH the offer to get the updated status from database
    const updatedOffer = await Offer.findById(id);

    // If offer is now approved, try to generate offer letter
    if (approvalFlow.status === 'completed') {
      const candidate = await Candidate.findById(updatedOffer.candidateId);
      const job = await JobOpening.findById(updatedOffer.jobId);
      
      // Try to generate PDF, but catch any errors so the approval still succeeds
      try {
        console.log('Attempting to generate offer letter PDF...');
        const pdfBuffer = await pdfGenerator.generateOfferLetter(updatedOffer, candidate, job);
        
        // Upload to cloud storage
        const fileName = `offer_letter_${updatedOffer.offerId}.pdf`;
        const tempDir = path.join(__dirname, '../temp');
        
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, pdfBuffer);
        
        const uploadResult = await cloudStorage.uploadFile(filePath, 'offers/letters');
        fs.unlinkSync(filePath);

        // Update offer with document
        updatedOffer.documents.push({
          type: 'offer_letter',
          fileUrl: uploadResult.fileUrl,
          filename: fileName,
          generatedAt: new Date()
        });
        await updatedOffer.save();

        // Send email with attachment
        await emailService.sendOfferLetter(updatedOffer, candidate, uploadResult.fileUrl);
        
        console.log('✅ Offer letter generated and sent successfully');
      } catch (pdfError) {
        console.warn('⚠️ Could not generate offer letter PDF:', pdfError.message);
        
        // Send a simple notification email without attachment
        try {
          await emailService.sendSimpleNotification(updatedOffer, candidate);
        } catch (emailError) {
          console.error('Email sending also failed:', emailError);
        }
      }
    }

    // Log audit with updated offer
    await auditService.log(
      'APPROVE',
      'Offer',
      updatedOffer._id,
      req.user,
      { approvalFlowId: approvalFlow._id, comments },
      req
    );

    res.json({
      success: true,
      data: {
        offerId: updatedOffer.offerId,
        status: updatedOffer.status,  // ✅ Now this will be 'approved' if completed
        approvalStatus: approvalFlow.status
      },
      message: 'Offer approved successfully'
    });

  } catch (error) {
    console.error('Approve offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Reject offer
// @route   POST /api/offers/:id/reject
// @access  Private (Hiring Manager, Finance Head, CEO/SuperAdmin)
const rejectOffer = async (req, res) => {
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
        message: 'Invalid offer ID format'
      });
    }

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }

    if (!offer.approvalFlow) {
      return res.status(400).json({
        success: false,
        message: 'No approval flow found for this offer'
      });
    }

    // Process rejection
    const approvalFlow = await workflowService.processApproval(
      offer.approvalFlow,
      req.user._id,
      'rejected',
      {
        approverName: req.user.Username,
        comments: reason
      }
    );

    // Log audit
    await auditService.log(
      'REJECT',
      'Offer',
      offer._id,
      req.user,
      { approvalFlowId: approvalFlow._id, reason },
      req
    );

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
          type: 'offer_rejected',
          title: 'Offer Rejected',
          message: `Offer ${offer.offerId} has been rejected. Reason: ${reason}`,
          data: {
            offerId: offer._id,
            link: `/offers/${offer._id}`
          }
        });
      }
    }

    res.json({
      success: true,
      message: 'Offer rejected successfully',
      data: {
        offerId: offer.offerId,
        status: offer.status
      }
    });

  } catch (error) {
    console.error('Reject offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Generate offer letter
// @route   GET /api/offers/:id/generate-letter
// @access  Private (HR only)
const generateOfferLetter = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid offer ID format'
      });
    }

    const offer = await Offer.findById(id);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }

    const candidate = await Candidate.findById(offer.candidateId);
    const job = await JobOpening.findById(offer.jobId);

    // Instead of generating PDF, return HTML or a message
    // Option 1: Return HTML that can be viewed in browser
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Offer Letter - ${candidate.firstName} ${candidate.lastName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
          .container { max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #003366; padding-bottom: 20px; }
          .company-name { font-size: 24px; font-weight: bold; color: #003366; }
          .section { margin: 30px 0; }
          table { width: 100%; border-collapse: collapse; }
          td, th { padding: 10px; border: 1px solid #ddd; }
          th { background: #003366; color: white; }
          .total { font-weight: bold; background: #f0f0f0; }
          .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; }
          .note { background: #fff3cd; border: 1px solid #ffeeba; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .status-badge { 
            display: inline-block;
            padding: 5px 10px;
            background: #28a745;
            color: white;
            border-radius: 4px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="note">
            <strong>Note:</strong> PDF generation is currently unavailable. Please view this HTML version or use the candidate portal.
          </div>
          
          <div class="header">
            <div class="company-name">Suyash Enterprises</div>
            <h2>Offer of Employment</h2>
            <p>Status: <span class="status-badge">${offer.status.toUpperCase()}</span></p>
          </div>

          <p>Date: ${new Date().toLocaleDateString()}</p>
          <p>Offer ID: ${offer.offerId}</p>
          <p>Dear <strong>${candidate.firstName} ${candidate.lastName}</strong>,</p>

          <p>We are pleased to offer you the position of <strong>${job.title}</strong> at Suyash Enterprises.</p>

          <div class="section">
            <h3>Position Details</h3>
            <table>
              <tr><td><strong>Position</strong></td><td>${job.title}</td></tr>
              <tr><td><strong>Department</strong></td><td>${offer.offerDetails.department}</td></tr>
              <tr><td><strong>Location</strong></td><td>${offer.offerDetails.location}</td></tr>
              <tr><td><strong>Joining Date</strong></td><td>${new Date(offer.offerDetails.joiningDate).toLocaleDateString()}</td></tr>
              <tr><td><strong>Reporting To</strong></td><td>${offer.offerDetails.reportingTo || 'Not specified'}</td></tr>
            </table>
          </div>

          <div class="section">
            <h3>Compensation Details</h3>
            <table>
              <tr><th>Component</th><th>Monthly (₹)</th><th>Annual (₹)</th></tr>
              <tr><td>Basic Salary</td><td>${offer.ctcDetails.basic.toLocaleString()}</td><td>${(offer.ctcDetails.basic * 12).toLocaleString()}</td></tr>
              <tr><td>HRA</td><td>${offer.ctcDetails.hra.toLocaleString()}</td><td>${(offer.ctcDetails.hra * 12).toLocaleString()}</td></tr>
              <tr><td>Conveyance Allowance</td><td>${offer.ctcDetails.conveyanceAllowance.toLocaleString()}</td><td>${(offer.ctcDetails.conveyanceAllowance * 12).toLocaleString()}</td></tr>
              <tr><td>Medical Allowance</td><td>${offer.ctcDetails.medicalAllowance.toLocaleString()}</td><td>${(offer.ctcDetails.medicalAllowance * 12).toLocaleString()}</td></tr>
              <tr><td>Special Allowance</td><td>${offer.ctcDetails.specialAllowance.toLocaleString()}</td><td>${(offer.ctcDetails.specialAllowance * 12).toLocaleString()}</td></tr>
              <tr class="total"><td><strong>Total CTC</strong></td><td></td><td><strong>₹${offer.ctcDetails.totalCtc.toLocaleString()}</strong></td></tr>
            </table>
          </div>

          <div class="footer">
            <p>This offer is valid for 15 days from the date of issue.</p>
            <p>Best regards,<br>HR Team<br>Suyash Enterprises</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send HTML response
    res.setHeader('Content-Type', 'text/html');
    res.send(html);

  } catch (error) {
    console.error('Generate offer letter error:', error);
    
    // Return a user-friendly error response
    res.status(500).json({
      success: false,
      message: 'PDF generation is currently unavailable due to server configuration. Please use the view offer endpoint instead.',
      suggestion: 'Try accessing /api/offers/view/:token or /api/offers/:id/html'
    });
  }
}; 

// @desc    Send offer letter to candidate
// @route   POST /api/offers/:id/send
// @access  Private (HR only)
const sendOfferLetter = async (req, res) => {
  try {
    const { id } = req.params;
    const { emailOverride } = req.body; // Optional: send to different email than candidate's

    // Validate offer ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid offer ID format'
      });
    }

    // Fetch offer with all necessary relations
    const offer = await Offer.findById(id)
      .populate('candidateId')
      .populate('jobId')
      .populate('requisitionId');

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }

    // Validate offer status
    if (offer.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: `Offer must be approved before sending. Current status: ${offer.status}`
      });
    }

    // Check if already sent
    if (offer.sentToCandidate && offer.sentToCandidate.sentAt) {
      return res.status(400).json({
        success: false,
        message: 'Offer has already been sent to candidate',
        data: {
          sentAt: offer.sentToCandidate.sentAt,
          sentTo: offer.sentToCandidate.email
        }
      });
    }

    const candidate = offer.candidateId;
    
    // Validate candidate has email
    const candidateEmail = emailOverride || candidate.email;
    if (!candidateEmail) {
      return res.status(400).json({
        success: false,
        message: 'Candidate does not have an email address. Please provide emailOverride.'
      });
    }

    // Generate secure access token for candidate
    const crypto = require('crypto');
    const accessToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Create acceptance tracking object
    offer.acceptance = {
      token: accessToken,
      tokenExpiry,
      emailSentTo: candidateEmail,
      sentAt: new Date()
    };

    // Create sent tracking
    offer.sentToCandidate = {
      sentAt: new Date(),
      email: candidateEmail,
      method: 'email'
    };

    // Generate view offer URL
    const baseUrl = process.env.BASE_URL || 'http://localhost:5009';
    const viewOfferUrl = `${baseUrl}/api/offers/${offer._id}/html?token=${accessToken}`;
    const acceptOfferUrl = `${baseUrl}/api/offers/${offer._id}/accept-offer?token=${accessToken}`;
    
    // Prepare response data
    const responseData = {
      token: accessToken,
      tokenExpiry,
      viewUrl: viewOfferUrl,
      acceptUrl: acceptOfferUrl,
      candidateEmail: candidateEmail,
      offerId: offer.offerId,
      candidateName: `${candidate.firstName} ${candidate.lastName}`
    };

    // Check if offer letter document exists
    const offerLetter = offer.documents?.find(d => d.type === 'offer_letter');
    
    let emailSent = false;
    let emailError = null;

    // Try to send email with appropriate method
    try {
      if (offerLetter && offerLetter.fileUrl) {
        // Send email with PDF attachment
        console.log('📧 Sending offer letter with PDF attachment to:', candidateEmail);
        
        // Check if email service has sendOfferLetter method
        if (typeof emailService.sendOfferLetter === 'function') {
          await emailService.sendOfferLetter(
            offer, 
            candidate, 
            offerLetter.fileUrl, 
            accessToken,
            viewOfferUrl,
            candidateEmail // override email if provided
          );
          emailSent = true;
        } else {
          throw new Error('emailService.sendOfferLetter is not a function');
        }
      } else {
        // Send email without PDF, with link to view online
        console.log('📧 No PDF found, sending HTML email with view link to:', candidateEmail);
        
        // Check if email service has sendSimpleOfferEmail method
        if (typeof emailService.sendSimpleOfferEmail === 'function') {
          await emailService.sendSimpleOfferEmail(
            offer, 
            candidate, 
            viewOfferUrl,
            acceptOfferUrl,
            candidateEmail // override email if provided
          );
          emailSent = true;
        } 
        // Fallback to sendOfferLetter if sendSimpleOfferEmail doesn't exist
        else if (typeof emailService.sendOfferLetter === 'function') {
          console.log('⚠️ sendSimpleOfferEmail not found, falling back to sendOfferLetter');
          await emailService.sendOfferLetter(
            offer, 
            candidate, 
            null, // no PDF
            accessToken,
            viewOfferUrl,
            candidateEmail
          );
          emailSent = true;
        } else {
          throw new Error('No email sending function available');
        }
      }
      
      // Update offer with sent status
      offer.sentToCandidate.emailSent = true;
      offer.sentToCandidate.emailSentAt = new Date();
      
      // KEY CHANGE: Update offer status to 'sent' when email is successfully sent
      if (emailSent) {
        offer.status = 'sent';
        console.log(`✅ Offer status updated to 'sent' for offer: ${offer.offerId}`);
      }
      
    } catch (emailError) {
      console.error('❌ Failed to send email:', emailError);
      emailError = emailError.message;
      
      // Still save the token even if email fails
      responseData.warning = 'Token generated but email sending failed. Token can be shared manually.';
      responseData.emailError = emailError;
      
      //  IMPORTANT: Don't change status to 'sent' if email failed
      // Status remains 'approved'
    }

    // Save offer with all updates
    await offer.save();

    // Log audit
    await auditService.log(
      'SEND_OFFER',
      'Offer',
      offer._id,
      req.user,
      {
        sentTo: candidateEmail,
        hasPDF: !!offerLetter,
        emailSent,
        tokenGenerated: true,
        newStatus: emailSent ? 'sent' : 'approved' // Log the new status
      },
      req
    );

    // Create notification for HR
    await notificationService.createNotification({
      userId: req.user._id,
      type: 'offer_sent',
      title: 'Offer Sent',
      message: `Offer ${offer.offerId} has been sent to ${candidate.firstName} ${candidate.lastName}`,
      data: {
        offerId: offer._id,
        candidateId: candidate._id,
        link: `/offers/${offer._id}`
      }
    });

    // Send success response
    const message = emailSent 
      ? 'Offer letter sent successfully to candidate' 
      : 'Token generated but email delivery failed. Use the token to share the offer manually.';

    res.json({
      success: true,
      message,
      data: {
        ...responseData,
        //  Include the new status in response
        status: offer.status
      }
    });

  } catch (error) {
    console.error('Send offer letter error:', error);
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error: ' + error.message
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate entry error'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
};
// @desc    View offer (public with token)
// @route   GET /api/offers/view/:token
// @access  Public (with token)
const viewOffer = async (req, res) => {
  try {
    const { token } = req.params;

    const offer = await Offer.findOne({ 'acceptance.token': token })
      .populate('candidateId')
      .populate('jobId');

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    if (offer.acceptance.tokenExpiry < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Token has expired'
      });
    }

    if (offer.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Offer has already been accepted'
      });
    }

    if (offer.status === 'declined') {
      return res.status(400).json({
        success: false,
        message: 'Offer has been declined'
      });
    }

    res.json({
      success: true,
      data: {
        offerId: offer.offerId,
        candidateName: `${offer.candidateId.firstName} ${offer.candidateId.lastName}`,
        position: offer.offerDetails.designation,
        department: offer.offerDetails.department,
        joiningDate: offer.offerDetails.joiningDate,
        ctcDetails: offer.ctcDetails,
        offerDetails: offer.offerDetails,
        offerLetter: offer.documents.find(d => d.type === 'offer_letter')
      }
    });

  } catch (error) {
    console.error('View offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Accept offer
// @route   POST /api/offers/:id/accept
// @access  Private (Candidate with token) or Public with validation
const acceptOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { signature, signatureType } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid offer ID format'
      });
    }

    const offer = await Offer.findById(id)
      .populate('candidateId')
      .populate('jobId');

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }



    if (offer.expiryDate && offer.expiryDate < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Offer has expired'
      });
    }

    // Update offer
    offer.status = 'accepted';
    
    // Initialize acceptance object if it doesn't exist
    if (!offer.acceptance) {
      offer.acceptance = {};
    }
    
    offer.acceptance.acceptedAt = new Date();
    offer.acceptance.ipAddress = req.ip;
    offer.acceptance.userAgent = req.get('User-Agent');
    offer.acceptance.signature = signature;
    offer.acceptance.signatureType = signatureType || 'text';
    
    await offer.save();

    // Update application
    await Application.findByIdAndUpdate(offer.applicationId, {
      status: 'offered',
      offerDetails: {
        offeredSalary: offer.ctcDetails.totalCtc,
        offeredDate: offer.offerDate,
        joiningDate: offer.offerDetails.joiningDate,
        acceptanceDate: new Date(),
        status: 'accepted'
      }
    });

    // Notify HR
    const hrUsers = await User.find()
      .populate({
        path: 'RoleID',
        match: { RoleName: 'HR' }
      })
      .select('_id');

    for (const hr of hrUsers) {
      if (hr.RoleID) {
        try {
          await notificationService.createNotification({
            userId: hr._id,
            type: 'offer_accepted',
            title: 'Offer Accepted',
            message: `${offer.candidateId.firstName} ${offer.candidateId.lastName} has accepted the offer`,
            data: {
              offerId: offer._id,
              candidateId: offer.candidateId._id,
              link: `/offers/${offer._id}`
            }
          });
        } catch (notifyError) {
          console.error('Error sending notification:', notifyError);
        }
      }
    }

    res.json({
      success: true,
      message: 'Offer accepted successfully',
      data: {
        offerId: offer.offerId,
        candidateName: `${offer.candidateId.firstName} ${offer.candidateId.lastName}`,
        position: offer.offerDetails.designation,
        joiningDate: offer.offerDetails.joiningDate,
        status: offer.status
      }
    });

  } catch (error) {
    console.error('Accept offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};


// @desc    Get all offers with filters
// @route   GET /api/offers
// @access  Private
const getOffers = async (req, res) => {
  try {
    const {
      status,
      candidateId,
      jobId,
      department,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};

    // Filter by status (supports multiple statuses)
    if (status) {
      if (status.includes(',')) {
        filter.status = { $in: status.split(',') };
      } else {
        filter.status = status;
      }
    }

    // Filter by candidate
    if (candidateId) {
      filter.candidateId = candidateId;
    }

    // Filter by job
    if (jobId) {
      filter.jobId = jobId;
    }

    // Filter by department (in offerDetails)
    if (department) {
      filter['offerDetails.department'] = department;
    }

    // Filter by date range
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) {
        filter.createdAt.$gte = new Date(fromDate);
      }
      if (toDate) {
        filter.createdAt.$lte = new Date(toDate);
      }
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with population
    const offers = await Offer.find(filter)
      .populate({
        path: 'candidateId',
        select: 'firstName lastName email phone candidateId'
      })
      .populate({
        path: 'jobId',
        select: 'title jobId department location'
      })
      .populate({
        path: 'requisitionId',
        select: 'requisitionId title department'
      })
      .populate({
        path: 'createdBy',
        select: 'Username firstName lastName email'
      })
      .populate('approvalFlow')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count for pagination
    const totalOffers = await Offer.countDocuments(filter);

   // Get status counts from database
      const statusCounts = await Offer.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Initialize all statuses from enum with 0 count
      //  Make sure 'sent' is included here
      const allStatuses = ['initiated', 'pending_approval', 'sent', 'approved', 'rejected', 'accepted', 'declined', 'expired', 'draft'];
      const counts = {};
      allStatuses.forEach(status => {
        counts[status] = 0;
      });

      // Update with actual counts
      statusCounts.forEach(item => {
        counts[item._id] = item.count;
      });
    
    // Calculate pagination info
    const totalPages = Math.ceil(totalOffers / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    // Format offers for response
    const formattedOffers = offers.map(offer => ({
      _id: offer._id,
      offerId: offer.offerId,
      status: offer.status,
      offerDate: offer.offerDate,
      expiryDate: offer.expiryDate,
      candidate: offer.candidateId ? {
        _id: offer.candidateId._id,
        candidateId: offer.candidateId.candidateId,
        name: `${offer.candidateId.firstName} ${offer.candidateId.lastName}`,
        firstName: offer.candidateId.firstName,
        lastName: offer.candidateId.lastName,
        email: offer.candidateId.email,
        phone: offer.candidateId.phone
      } : null,
      job: offer.jobId ? {
        _id: offer.jobId._id,
        title: offer.jobId.title,
        jobId: offer.jobId.jobId,
        department: offer.jobId.department,
        location: offer.jobId.location
      } : null,
      requisition: offer.requisitionId ? {
        _id: offer.requisitionId._id,
        requisitionId: offer.requisitionId.requisitionId,
        title: offer.requisitionId.title
      } : null,
      ctcDetails: {
        basic: offer.ctcDetails?.basic,
        hra: offer.ctcDetails?.hra,
        gross: offer.ctcDetails?.gross,
        totalCtc: offer.ctcDetails?.totalCtc,
        currency: offer.ctcDetails?.currency || 'INR'
      },
      offerDetails: {
        designation: offer.offerDetails?.designation,
        department: offer.offerDetails?.department,
        location: offer.offerDetails?.location,
        joiningDate: offer.offerDetails?.joiningDate,
        employmentType: offer.offerDetails?.employmentType,
        probationPeriod: offer.offerDetails?.probationPeriod
      },
      acceptance: offer.acceptance ? {
        acceptedAt: offer.acceptance.acceptedAt,
        hasSignature: !!offer.acceptance.signature
      } : null,
      documents: offer.documents?.map(doc => ({
        type: doc.type,
        filename: doc.filename,
        fileUrl: doc.fileUrl,
        generatedAt: doc.generatedAt
      })),
      createdBy: offer.createdBy ? {
        name: offer.createdBy.Username || `${offer.createdBy.firstName} ${offer.createdBy.lastName}`,
        email: offer.createdBy.email
      } : {
        name: offer.createdByName || 'Unknown'
      },
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt
    }));

    res.json({
      success: true,
      data: {
        offers: formattedOffers,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalOffers,
          hasNextPage,
          hasPrevPage,
          limit: limitNum
        },
        filters: {
          status: status || 'all',
          statusCounts: counts,
          availableStatuses: ['initiated', 'pending_approval', 'approved', 'sent', 'rejected', 'accepted', 'declined', 'expired']
        }
      },
      message: 'Offers retrieved successfully'
    });

  } catch (error) {
    console.error('Get offers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};


// @desc    View offer as HTML (fallback when PDF fails)
// @route   GET /api/offers/:id/html
// @access  Public (with token)
const viewOfferHTML = async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;

    const offer = await Offer.findById(id)
      .populate('candidateId')
      .populate('jobId');

    if (!offer) {
      return res.status(404).send('Offer not found');
    }

    // Verify token
    if (offer.acceptance?.token !== token) {
      return res.status(401).send('Invalid token');
    }

    const candidate = offer.candidateId;
    const job = offer.jobId;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Offer Letter - ${candidate.firstName} ${candidate.lastName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
          .container { max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #003366; padding-bottom: 20px; }
          .company-name { font-size: 24px; font-weight: bold; color: #003366; }
          .section { margin: 30px 0; }
          table { width: 100%; border-collapse: collapse; }
          td, th { padding: 10px; border: 1px solid #ddd; }
          th { background: #003366; color: white; }
          .total { font-weight: bold; background: #f0f0f0; }
          .accept-btn { 
            background: #003366; 
            color: white; 
            padding: 15px 30px; 
            text-decoration: none; 
            display: inline-block; 
            margin: 20px 0;
            border-radius: 5px;
          }
          .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="company-name">Suyash Enterprises</div>
            <h2>Offer of Employment</h2>
          </div>

          <p>Date: ${new Date().toLocaleDateString()}</p>
          <p>Dear <strong>${candidate.firstName} ${candidate.lastName}</strong>,</p>

          <p>We are pleased to offer you the position of <strong>${job.title}</strong> at Suyash Enterprises.</p>

          <div class="section">
            <h3>Position Details</h3>
            <table>
              <tr><td><strong>Position</strong></td><td>${job.title}</td></tr>
              <tr><td><strong>Department</strong></td><td>${offer.offerDetails.department}</td></tr>
              <tr><td><strong>Location</strong></td><td>${offer.offerDetails.location}</td></tr>
              <tr><td><strong>Joining Date</strong></td><td>${new Date(offer.offerDetails.joiningDate).toLocaleDateString()}</td></tr>
              <tr><td><strong>Reporting To</strong></td><td>${offer.offerDetails.reportingTo || 'Not specified'}</td></tr>
            </table>
          </div>

          <div class="section">
            <h3>Compensation Details</h3>
            <table>
              <tr><th>Component</th><th>Amount (₹)</th></tr>
              <tr><td>Basic Salary</td><td>${offer.ctcDetails.basic.toLocaleString()}</td></tr>
              <tr><td>HRA</td><td>${offer.ctcDetails.hra.toLocaleString()}</td></tr>
              <tr><td>Conveyance Allowance</td><td>${offer.ctcDetails.conveyanceAllowance.toLocaleString()}</td></tr>
              <tr><td>Medical Allowance</td><td>${offer.ctcDetails.medicalAllowance.toLocaleString()}</td></tr>
              <tr><td>Special Allowance</td><td>${offer.ctcDetails.specialAllowance.toLocaleString()}</td></tr>
              <tr class="total"><td><strong>Total CTC</strong></td><td><strong>₹${offer.ctcDetails.totalCtc.toLocaleString()}</strong></td></tr>
            </table>
          </div>

          <div style="text-align: center;">
            <a href="/api/offers/${offer._id}/accept?token=${token}" class="accept-btn">Accept Offer</a>
          </div>

          <div class="footer">
            <p>This offer is valid for 15 days from the date of issue.</p>
            <p>Best regards,<br>HR Team<br>Suyash Enterprises</p>
          </div>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('View offer HTML error:', error);
    res.status(500).send('Server error');
  }
};


// @desc    Get approved offers for a candidate
// @route   GET /api/offers/candidate/:candidateId/approved
// @access  Private
const getCandidateApprovedOffers = async (req, res) => {
  try {
    const { candidateId } = req.params;

    // Validate candidate ID
    if (!mongoose.Types.ObjectId.isValid(candidateId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid candidate ID format'
      });
    }

    // Check if candidate exists
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    // Find approved offers for the candidate
    const approvedOffers = await Offer.find({
      candidateId: candidateId,
      status: { $in: ['approved', 'accepted'] }
    })
    .populate({
      path: 'jobId',
      select: 'title jobId location department requisitionId'
    })
    .populate({
      path: 'applicationId',
      select: 'applicationId status appliedAt'
    })
    .populate({
      path: 'requisitionId',
      select: 'requisitionId title department'
    })
    .populate({
      path: 'createdBy',
      select: 'Username firstName lastName email'
    })
    .populate('approvalFlow')
    .sort('-createdAt')
    .lean();

    // Get additional stats
    const totalApprovedOffers = approvedOffers.length;
    const acceptedOffers = approvedOffers.filter(offer => offer.status === 'accepted').length;
    const pendingAcceptance = approvedOffers.filter(offer => offer.status === 'approved').length;

    // Format offers for response
    const formattedOffers = approvedOffers.map(offer => ({
      _id: offer._id,
      offerId: offer.offerId,
      status: offer.status,
      offerDate: offer.offerDate,
      expiryDate: offer.expiryDate,
      ctcDetails: {
        totalCtc: offer.ctcDetails?.totalCtc,
        currency: offer.ctcDetails?.currency || 'INR',
        gross: offer.ctcDetails?.gross,
        basic: offer.ctcDetails?.basic
      },
      offerDetails: {
        designation: offer.offerDetails?.designation,
        department: offer.offerDetails?.department,
        location: offer.offerDetails?.location,
        employmentType: offer.offerDetails?.employmentType,
        joiningDate: offer.offerDetails?.joiningDate,
        probationPeriod: offer.offerDetails?.probationPeriod
      },
      job: offer.jobId ? {
        _id: offer.jobId._id,
        title: offer.jobId.title,
        jobId: offer.jobId.jobId,
        location: offer.jobId.location
      } : null,
      application: offer.applicationId ? {
        _id: offer.applicationId._id,
        applicationId: offer.applicationId.applicationId,
        status: offer.applicationId.status,
        appliedAt: offer.applicationId.appliedAt
      } : null,
      requisition: offer.requisitionId ? {
        _id: offer.requisitionId._id,
        requisitionId: offer.requisitionId.requisitionId,
        title: offer.requisitionId.title
      } : null,
      acceptance: offer.acceptance ? {
        acceptedAt: offer.acceptance.acceptedAt,
        signature: offer.acceptance.signature ? true : false
      } : null,
      documents: offer.documents?.map(doc => ({
        type: doc.type,
        filename: doc.filename,
        fileUrl: doc.fileUrl,
        generatedAt: doc.generatedAt
      })),
      createdBy: offer.createdBy ? {
        name: offer.createdBy.Username || `${offer.createdBy.firstName} ${offer.createdBy.lastName}`,
        email: offer.createdBy.email
      } : null,
      createdAt: offer.createdAt,
      reminderSent: offer.reminderSent,
      reminderSentAt: offer.reminderSentAt
    }));

    res.json({
      success: true,
      data: {
        candidate: {
          _id: candidate._id,
          candidateId: candidate.candidateId,
          fullName: candidate.fullName,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone
        },
        offers: formattedOffers,
        stats: {
          totalApprovedOffers,
          acceptedOffers,
          pendingAcceptance,
          hasActiveOffer: pendingAcceptance > 0,
          hasAcceptedOffer: acceptedOffers > 0
        }
      },
      message: 'Approved offers retrieved successfully'
    });

  } catch (error) {
    console.error('Get candidate approved offers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

module.exports = {
  initiateOffer,
  submitForApproval,
  approveOffer,
  rejectOffer,
  generateOfferLetter,
  sendOfferLetter,
  viewOffer,
  acceptOffer,
  viewOfferHTML,  // Add this line
  getCandidateApprovedOffers,
  getOffers

};