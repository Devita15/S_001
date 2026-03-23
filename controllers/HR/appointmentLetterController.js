// controllers/appointmentLetterController.js
const Employee = require('../../models/HR/Employee');
const Candidate = require('../../models/HR/Candidate');
const Offer = require('../../models/HR/Offer');
const Document = require('../../models/HR/Document');
const EmployeeOnboarding = require('../../models/HR/EmployeeOnboarding');
const appointmentLetterService = require('../../services/appointmentLetterService');
const emailService = require('../../services/emailService');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// @desc    Generate appointment letter and return HTML/PDF
// @route   POST /api/appointment-letter/generate
// @access  Private (HR)
const generateAppointmentLetter = async (req, res) => {
  const startTime = Date.now();
  console.log('📄 ===== GENERATE APPOINTMENT LETTER STARTED =====');
  console.log(`📝 Request body:`, JSON.stringify(req.body, null, 2));
  console.log(`👤 User:`, req.user?._id || req.user?.id || 'Unknown');

  try {
    const { candidateId, offerId, joiningDate, returnFormat = 'html' } = req.body;

    // Validation
    if (!candidateId || !offerId) {
      console.warn('❌ Missing required fields:', { candidateId, offerId });
      return res.status(400).json({
        success: false,
        message: 'Candidate ID and Offer ID are required'
      });
    }

    // Validate MongoDB ObjectIds
    if (!mongoose.Types.ObjectId.isValid(candidateId) || !mongoose.Types.ObjectId.isValid(offerId)) {
      console.warn('❌ Invalid ID format:', { candidateId, offerId });
      return res.status(400).json({
        success: false,
        message: 'Invalid Candidate ID or Offer ID format'
      });
    }

    console.log(`🔍 Fetching candidate: ${candidateId}`);
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      console.warn(`❌ Candidate not found: ${candidateId}`);
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }
    console.log(`✅ Candidate found: ${candidate.fullName || candidate.name} (${candidate.email})`);

    console.log(`🔍 Fetching offer: ${offerId}`);
    const offer = await Offer.findById(offerId);
    if (!offer) {
      console.warn(`❌ Offer not found: ${offerId}`);
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }
    console.log(`✅ Offer found: ${offer.offerDetails?.designation || offer.offerDetails?.position}`);

    // Check if appointment letter already exists
    console.log(`🔍 Checking for existing appointment letters for candidate ${candidateId}`);
    const existingDocument = await Document.findOne({
      candidateId: candidate._id,
      type: 'appointment_letter'
    }).sort({ createdAt: -1 });

    if (existingDocument) {
      console.log(`⚠️ Existing appointment letter found for candidate ${candidateId} with status: ${existingDocument.status}`);
      
      if (existingDocument.status === 'draft' || existingDocument.status === 'generated') {
        console.log(`🔄 Regenerating - previous status: ${existingDocument.status}`);
        // Option to delete old document? 
        // await Document.deleteOne({ _id: existingDocument._id });
        // console.log(`🗑️ Deleted old document: ${existingDocument._id}`);
      } else if (existingDocument.status !== 'rejected') {
        console.log(`⏸️ Cannot regenerate - document status: ${existingDocument.status}`);
        return res.status(400).json({
          success: false,
          message: `An appointment letter with status '${existingDocument.status}' already exists for this candidate`,
          data: {
            documentId: existingDocument._id,
            status: existingDocument.status,
            fileUrl: existingDocument.fileUrl,
            generatedAt: existingDocument.generatedAt
          }
        });
      }
    }

    // Generate HTML appointment letter
    console.log(`📝 Generating appointment letter HTML...`);
    let htmlContent = appointmentLetterService.generateHTML(
      candidate, 
      offer, 
      joiningDate || offer.offerDetails?.joiningDate || new Date()
    );
    console.log(`✅ HTML generated, size: ${Buffer.byteLength(htmlContent, 'utf8')} bytes`);

    // Create filename
    const sanitizedName = (candidate.fullName || candidate.name || 'candidate')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
    const timestamp = Date.now();
    const htmlFileName = `appointment_letter_${sanitizedName}_${timestamp}.html`;
    const pdfFileName = `appointment_letter_${sanitizedName}_${timestamp}.pdf`;
    
    console.log(`📄 HTML filename: ${htmlFileName}`);
    console.log(`📄 PDF filename: ${pdfFileName}`);

    // Define upload directory
    const uploadDir = path.join(__dirname, '../uploads/appointment-letters');
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      console.log(`📁 Creating upload directory: ${uploadDir}`);
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Save HTML file
    const htmlFilePath = path.join(uploadDir, htmlFileName);
    fs.writeFileSync(htmlFilePath, htmlContent, 'utf8');
    console.log(`💾 HTML file saved: ${htmlFilePath}`);

    // Generate PDF version if needed
    let pdfFilePath = null;
    let fileUrl = null;
    let mimeType = 'text/html';
    let fileSize = fs.statSync(htmlFilePath).size;

    // Check if PDF generation is requested or if we should generate both
    if (returnFormat === 'pdf' || returnFormat === 'both') {
      try {
        console.log(`📑 Generating PDF version...`);
        // You'll need to implement PDF generation (using puppeteer or similar)
        // For now, we'll just note that it's not implemented
        console.warn(`⚠️ PDF generation not implemented, using HTML only`);
      } catch (pdfError) {
        console.error(`❌ PDF generation failed:`, pdfError);
      }
    }

    // Create document record
    console.log(`📝 Creating document record in database...`);
    let document;
    try {
      document = await Document.create({
        type: 'appointment_letter',
        filename: htmlFileName,
        originalFilename: `Appointment_Letter_${candidate.fullName || candidate.name}.html`,
        fileUrl: `/uploads/appointment-letters/${htmlFileName}`, // Relative URL
        filePath: htmlFilePath, // Store full path for internal use
        fileSize: fileSize,
        mimeType: mimeType,
        candidateId: candidate._id,
        offerId: offer._id,
        uploadedBy: req.user?._id || req.user?.id,
        status: 'generated',
        generatedAt: new Date(),
        metadata: {
          candidateName: candidate.fullName || candidate.name,
          candidateEmail: candidate.email,
          offerDesignation: offer.offerDetails?.designation || offer.offerDetails?.position,
          joiningDate: joiningDate || offer.offerDetails?.joiningDate,
          format: 'html'
        }
      });
      console.log(`✅ Document record created with ID: ${document._id}`);
    } catch (docError) {
      console.error(`❌ Document creation failed:`, docError);
      // Clean up saved file
      if (fs.existsSync(htmlFilePath)) {
        fs.unlinkSync(htmlFilePath);
        console.log(`🧹 Cleaned up file: ${htmlFilePath}`);
      }
      return res.status(500).json({
        success: false,
        message: 'Failed to create document record',
        error: docError.message
      });
    }

    // Update candidate status (FIXED: Check valid enum values first)
    try {
      console.log(`🔄 Checking candidate status update...`);
      
      // First, check what status values are allowed in the schema
      const candidateSchema = Candidate.schema;
      const statusEnum = candidateSchema.path('status')?.enumValues;
      console.log(`📋 Candidate status allowed values:`, statusEnum);
      
      // Determine appropriate status
      let newStatus = 'onboarding'; // Default fallback
      
      if (statusEnum) {
        if (statusEnum.includes('appointment_letter_generated')) {
          newStatus = 'appointment_letter_generated';
        } else if (statusEnum.includes('offer_accepted')) {
          newStatus = 'offer_accepted';
        } else if (statusEnum.includes('onboarding')) {
          newStatus = 'onboarding';
        }
      }
      
      console.log(`🔄 Attempting to update candidate status to: ${newStatus}`);
      
      if (candidate.status !== newStatus) {
        candidate.status = newStatus;
        candidate.onboardingStage = 'appointment_letter';
        await candidate.save();
        console.log(`✅ Candidate status updated to: ${newStatus}`);
      } else {
        console.log(`⏸️ Candidate status already set to: ${candidate.status}`);
      }
    } catch (candidateError) {
      console.error(`❌ Failed to update candidate status:`, candidateError.message);
      // Don't fail the whole operation
    }

    // Update onboarding record
    try {
      console.log(`🔄 Updating onboarding record...`);
      const onboarding = await EmployeeOnboarding.findOne({
        candidateId: candidate._id
      });

      if (onboarding) {
        console.log(`✅ Onboarding record found: ${onboarding._id}`);
        
        if (!onboarding.steps) onboarding.steps = [];
        
        if (Array.isArray(onboarding.steps)) {
          const letterStep = onboarding.steps.find(s => s && s.step === 'appointment_letter_generation');
          
          if (letterStep) {
            letterStep.status = 'completed';
            letterStep.completedAt = new Date();
            letterStep.completedBy = req.user?._id || req.user?.id;
            letterStep.documentId = document._id;
            console.log(`✅ Updated existing appointment letter step`);
          } else {
            onboarding.steps.push({
              step: 'appointment_letter_generation',
              status: 'completed',
              completedAt: new Date(),
              completedBy: req.user?._id || req.user?.id,
              documentId: document._id
            });
            console.log(`✅ Added new appointment letter step`);
          }
          
          await onboarding.save();
          console.log(`✅ Onboarding record updated`);
        }
      } else {
        console.log(`ℹ️ No onboarding record found for candidate ${candidateId}`);
      }
    } catch (onboardingError) {
      console.error(`❌ Error updating onboarding:`, onboardingError.message);
    }

    // Add metadata to HTML
    const documentMetaData = `
      <!-- Document Metadata -->
      <div style="display: none;" id="appointment-letter-metadata"
           data-document-id="${document._id}" 
           data-document-status="${document.status}"
           data-candidate-id="${candidate._id}"
           data-candidate-name="${candidate.fullName || candidate.name}"
           data-offer-id="${offer._id}"
           data-generated-at="${document.generatedAt.toISOString()}"
           data-file-url="/uploads/appointment-letters/${htmlFileName}">
      </div>
      <script>
        window.appointmentLetterData = {
          documentId: "${document._id}",
          documentStatus: "${document.status}",
          candidateId: "${candidate._id}",
          candidateName: "${candidate.fullName || candidate.name}",
          offerId: "${offer._id}",
          generatedAt: "${document.generatedAt.toISOString()}",
          fileUrl: "/uploads/appointment-letters/${htmlFileName}"
        };
        console.log('✅ Appointment Letter Generated - ID:', window.appointmentLetterData.documentId);
      </script>
    `;

    htmlContent = htmlContent.replace('</body>', `${documentMetaData}\n</body>`);

    const endTime = Date.now();
    console.log(`✅ ===== GENERATE APPOINTMENT LETTER COMPLETED in ${endTime - startTime}ms =====`);
    console.log(`📊 Document ID: ${document._id}`);
    console.log(`📊 File URL: /uploads/appointment-letters/${htmlFileName}`);
    console.log(`📊 File Path: ${htmlFilePath}`);

    // Handle response based on return format
    if (returnFormat === 'json') {
      return res.json({
        success: true,
        message: 'Appointment letter generated successfully',
        data: {
          documentId: document._id,
          documentStatus: document.status,
          candidateId: candidate._id,
          candidateName: candidate.fullName || candidate.name,
          offerId: offer._id,
          generatedAt: document.generatedAt,
          fileUrl: `/uploads/appointment-letters/${htmlFileName}`,
          html: htmlContent
        }
      });
    }

    // Default: Return HTML
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Document-ID', document._id.toString());
    res.setHeader('X-Document-Status', document.status);
    res.setHeader('X-File-URL', `/uploads/appointment-letters/${htmlFileName}`);
    res.send(htmlContent);

  } catch (error) {
    console.error(`❌ ===== GENERATE APPOINTMENT LETTER ERROR =====`);
    console.error(`❌ Error:`, error);
    console.error(`❌ Stack:`, error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Server error while generating appointment letter',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
    
// @desc    Send appointment letter via email (with attachment)
// @route   POST /api/appointment-letter/send/:id
// @access  Private (HR)
const sendAppointmentLetter = async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    const document = await Document.findById(id)
      .populate('candidateId')
      .populate('offerId');

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Get the local file path
    const fileName = document.filename;
    const filePath = path.join(__dirname, '../uploads/appointment-letters', fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Appointment letter file not found on server'
      });
    }

    // Get candidate and offer details
    const candidate = document.candidateId;
    const offer = document.offerId;
    
    // Extract offer details with correct paths
    const offerDetails = offer.offerDetails || {};
    const ctcDetails = offer.ctcDetails || {};

    // Create accept link (one-click accept)
    const acceptUrl = `${process.env.BASE_URL || 'http://localhost:5009'}/api/appointment-letter/accept/${document._id}`;

    // Prepare email content with CORRECT field paths
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #003366; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { padding: 20px; background: #f9f9f9; border: 1px solid #ddd; }
          .button { 
            display: inline-block; 
            background: #28a745; 
            color: white; 
            padding: 15px 30px; 
            text-decoration: none; 
            border-radius: 5px;
            margin: 20px 0;
            font-weight: bold;
            font-size: 18px;
          }
          .button:hover { background: #218838; }
          .details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          table { width: 100%; border-collapse: collapse; }
          td, th { padding: 10px; border: 1px solid #ddd; }
          th { background: #003366; color: white; }
          .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
          .total { font-weight: bold; background: #e8f4f8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>SUYASH ENTERPRISES</h2>
            <h3>Appointment Letter</h3>
          </div>
          <div class="content">
            <h3>Dear ${candidate.fullName || candidate.name || 'Candidate'},</h3>
            
            <p>Congratulations! We are pleased to appoint you as an employee of Suyash Enterprises.</p>
            
            <div class="details">
              <h4>📋 APPOINTMENT DETAILS:</h4>
              <table>
                <tr><td><strong>Position:</strong></td><td>${offerDetails.designation || offerDetails.position || 'Not Specified'}</td></tr>
                <tr><td><strong>Department:</strong></td><td>${offerDetails.department || 'Not Specified'}</td></tr>
                <tr><td><strong>Location:</strong></td><td>${offerDetails.location || 'Not Specified'}</td></tr>
                <tr><td><strong>Reporting To:</strong></td><td>${offerDetails.reportingTo || 'Not Specified'}</td></tr>
                <tr><td><strong>Date of Joining:</strong></td><td>${offerDetails.joiningDate ? new Date(offerDetails.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'To be confirmed'}</td></tr>
                <tr><td><strong>Employment Type:</strong></td><td>${offerDetails.employmentType || 'Full Time'}</td></tr>
                <tr><td><strong>Probation Period:</strong></td><td>${offerDetails.probationPeriod || '6'} months</td></tr>
              </table>
            </div>
            
            <div class="details">
              <h4>💰 COMPENSATION SUMMARY:</h4>
              <table>
                <tr><th>Component</th><th>Monthly (₹)</th><th>Annual (₹)</th></tr>
                <tr><td>Basic Salary</td><td>${(ctcDetails.basic || 0).toLocaleString()}</td><td>${((ctcDetails.basic || 0) * 12).toLocaleString()}</td></tr>
                <tr><td>HRA</td><td>${(ctcDetails.hra || 0).toLocaleString()}</td><td>${((ctcDetails.hra || 0) * 12).toLocaleString()}</td></tr>
                <tr><td>Conveyance</td><td>${(ctcDetails.conveyanceAllowance || 0).toLocaleString()}</td><td>${((ctcDetails.conveyanceAllowance || 0) * 12).toLocaleString()}</td></tr>
                <tr><td>Medical</td><td>${(ctcDetails.medicalAllowance || 0).toLocaleString()}</td><td>${((ctcDetails.medicalAllowance || 0) * 12).toLocaleString()}</td></tr>
                <tr><td>Special</td><td>${(ctcDetails.specialAllowance || 0).toLocaleString()}</td><td>${((ctcDetails.specialAllowance || 0) * 12).toLocaleString()}</td></tr>
                <tr class="total"><td colspan="2"><strong>Total CTC (Annual)</strong></td><td><strong>₹${(ctcDetails.totalCtc || 0).toLocaleString()}</strong></td></tr>
              </table>
            </div>
            
            <p><strong>📎 Your detailed appointment letter is attached to this email.</strong> Please download and save it for your records.</p>
            
            <div style="text-align: center;">
              <a href="${acceptUrl}" class="button">✅ CLICK HERE TO ACCEPT APPOINTMENT</a>
            </div>
            
            <p><strong>What happens next?</strong></p>
            <ul>
              <li>Click the button above to accept your appointment</li>
              <li>After acceptance, your employee ID will be generated</li>
              <li>You'll receive onboarding instructions with HRMS access</li>
            </ul>
            
            <p>If you have any questions, please contact HR.</p>
            
            <p>Best regards,<br>
            <strong>HR Team</strong><br>
            Suyash Enterprises</p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} Suyash Enterprises. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email with attachment
    try {
      await emailService.sendEmail({
        to: email || candidate.email,
        subject: `Appointment Letter - ${candidate.fullName || candidate.name} - Suyash Enterprises`,
        html: emailHtml,
        attachments: [{
          filename: document.filename,
          path: filePath
        }]
      });

      // Update document status
      document.status = 'sent';
      document.sentAt = new Date();
      await document.save();

      // Update onboarding if exists
      await EmployeeOnboarding.findOneAndUpdate(
        { candidateId: candidate._id },
        { 
          'appointmentLetter.sentAt': new Date(),
          'appointmentLetter.status': 'sent'
        }
      );

    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send email',
        error: emailError.message
      });
    }

    res.json({
      success: true,
      message: 'Appointment letter sent successfully',
      data: {
        documentId: document._id,
        sentTo: email || candidate.email,
        sentAt: document.sentAt,
        status: document.status
      }
    });

  } catch (error) {
    console.error('Send appointment letter error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};
// @desc    Accept appointment letter (one-click accept)
// @route   GET /api/appointment-letter/accept/:id
// @access  Public
const acceptAppointmentLetter = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the document
    const document = await Document.findById(id)
      .populate('candidateId')
      .populate('offerId');

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Appointment letter not found'
      });
    }

    // Check if already accepted
    if (document.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Appointment letter already accepted',
        data: {
          documentId: document._id,
          status: document.status,
          acceptedAt: document.acceptedAt,
          candidateName: document.candidateId?.fullName
        }
      });
    }

    // Update document status
    document.status = 'accepted';
    document.acceptedAt = new Date();
    await document.save();

    // Update onboarding if exists
    try {
      await EmployeeOnboarding.findOneAndUpdate(
        { candidateId: document.candidateId._id },
        { 
          'appointmentLetter.acceptedAt': new Date(),
          'appointmentLetter.status': 'accepted',
          'appointmentLetter.stepCompleted': true
        }
      );
    } catch (onboardingError) {
      console.warn('Failed to update onboarding:', onboardingError.message);
    }

    // Return JSON response (note: employee doesn't exist yet)
    return res.json({
      success: true,
      message: 'Appointment letter accepted successfully',
      data: {
        documentId: document._id,
        status: document.status,
        acceptedAt: document.acceptedAt,
        candidateId: document.candidateId?._id,
        candidateName: document.candidateId?.fullName,
        candidateEmail: document.candidateId?.email,
        fileUrl: document.fileUrl,
        nextStep: 'Employee creation pending - HR will now create employee record in HRMS'
      }
    });

  } catch (error) {
    console.error('Accept appointment letter error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};

// @desc    Get appointment letter status by candidate ID
// @route   GET /api/appointment-letter/status/candidate/:candidateId
// @access  Private (HR)
const getAppointmentLetterStatusByCandidate = async (req, res) => {
  try {
    const { candidateId } = req.params;

    // Find candidate
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    // Find the LATEST document for this candidate
    const document = await Document.findOne({ 
      candidateId: candidate._id,
      type: 'appointment_letter'
    }).sort({ createdAt: -1 });

    if (!document) {
      return res.json({
        success: true,
        data: {
          exists: false,
          message: 'No appointment letter found for this candidate'
        }
      });
    }

    // Check if employee has been created after acceptance
    let employee = null;
    if (document.status === 'accepted') {
      employee = await Employee.findOne({ 
        $or: [
          { candidateId: candidate._id },
          { email: candidate.email }
        ]
      });
    }

    // Check for multiple documents
    const documentCount = await Document.countDocuments({ 
      candidateId: candidate._id,
      type: 'appointment_letter'
    });

    if (documentCount > 1) {
      console.warn(`Candidate ${candidateId} has ${documentCount} appointment letter documents`);
    }

    // Return status
    res.json({
      success: true,
      data: {
        exists: true,
        documentId: document._id,
        fileUrl: document.fileUrl,
        status: document.status,
        generatedAt: document.generatedAt,
        sentAt: document.sentAt,
        acceptedAt: document.acceptedAt,
        candidateId: candidate._id,
        candidateName: candidate.fullName,
        candidateEmail: candidate.email,
        employeeCreated: !!employee,
        employeeId: employee?.EmployeeID || null,
        _debug: documentCount > 1 ? {
          documentCount,
          allDocumentIds: await Document.find({ 
            candidateId: candidate._id, 
            type: 'appointment_letter' 
          }).distinct('_id')
        } : undefined
      }
    });

  } catch (error) {
    console.error('Get appointment letter status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};
  
  

// @desc    Get appointment letter status by document ID
// @route   GET /api/appointment-letter/status/:documentId
// @access  Private (HR)
const getAppointmentLetterStatusById = async (req, res) => {
  try {
    const { documentId } = req.params;

    const document = await Document.findById(documentId)
      .populate('candidateId');

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check if employee has been created after acceptance
    let employee = null;
    if (document.status === 'accepted' && document.candidateId) {
      employee = await Employee.findOne({ 
        $or: [
          { candidateId: document.candidateId._id },
          { email: document.candidateId.email }
        ]
      });
    }

    res.json({
      success: true,
      data: {
        documentId: document._id,
        fileUrl: document.fileUrl,
        status: document.status,
        generatedAt: document.generatedAt,
        sentAt: document.sentAt,
        acceptedAt: document.acceptedAt,
        candidateId: document.candidateId?._id,
        candidateName: document.candidateId?.fullName,
        candidateEmail: document.candidateId?.email,
        employeeCreated: !!employee,
        employeeId: employee?.EmployeeID || null
      }
    });

  } catch (error) {
    console.error('Get appointment letter status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};
  
// @desc    Get all appointment letters with filtering and pagination
// @route   GET /api/appointment-letter/all
// @access  Private (HR/Admin)
const getAllAppointmentLetters = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      candidateId,
      fromDate,
      toDate,
      search,
      sortBy = 'generatedAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = { type: 'appointment_letter' };

    // Filter by status
    if (status) {
      filter.status = status;
    }

    // Filter by candidate ID
    if (candidateId) {
      if (!mongoose.Types.ObjectId.isValid(candidateId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid candidate ID format'
        });
      }
      filter.candidateId = candidateId;
    }

    // Filter by date range
    if (fromDate || toDate) {
      filter.generatedAt = {};
      if (fromDate) {
        filter.generatedAt.$gte = new Date(fromDate);
      }
      if (toDate) {
        filter.generatedAt.$lte = new Date(toDate);
      }
    }

    // Search by candidate name or email
    if (search) {
      const candidates = await Candidate.find({
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      const candidateIds = candidates.map(c => c._id);
      
      if (candidateIds.length > 0) {
        filter.candidateId = { $in: candidateIds };
      } else {
        return res.json({
          success: true,
          data: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: 0
          }
        });
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with population
    const documents = await Document.find(filter)
      .populate('candidateId', 'firstName lastName name email')
      .populate('offerId', 'offerDetails.designation ctcDetails.totalCtc')
      .populate('uploadedBy', 'name')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Document.countDocuments(filter);

    // Get simple statistics
    const statistics = {
      total: await Document.countDocuments({ type: 'appointment_letter' }),
      generated: await Document.countDocuments({ type: 'appointment_letter', status: 'generated' }),
      sent: await Document.countDocuments({ type: 'appointment_letter', status: 'sent' }),
      accepted: await Document.countDocuments({ type: 'appointment_letter', status: 'accepted' })
    };

    res.json({
      success: true,
      data: documents,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      statistics,
      summary: {
        acceptanceRate: statistics.total > 0 
          ? Math.round((statistics.accepted / statistics.total) * 100) 
          : 0
      }
    });

  } catch (error) {
    console.error('Get all appointment letters error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error: ' + error.message
    });
  }
};
  

module.exports = {
  generateAppointmentLetter,
  sendAppointmentLetter,
  acceptAppointmentLetter,
  getAppointmentLetterStatusByCandidate,
  getAppointmentLetterStatusById,
  getAllAppointmentLetters
};