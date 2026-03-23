// services/emailService.js
const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false // Only for development
      }
    });

    // Verify connection configuration
    this.verifyConnection();
  }

  // Verify SMTP connection
  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log(' SMTP server is ready to send emails');
    } catch (error) {
      console.error(' SMTP connection error:', error);
    }
  }

  // Generic send email method
  async sendEmail({ to, subject, html, attachments = [] }) {
    try {
      console.log(' Attempting to send email to:', to);
      console.log('Subject:', subject);
      
      const mailOptions = {
        from: `"Suyash Enterprises" <${process.env.SMTP_USER}>`,
        to: to,
        subject: subject,
        html: html,
        attachments: attachments.map(att => ({
          filename: att.filename,
          path: att.path
        }))
      };

      // Send email
      const info = await this.transporter.sendMail(mailOptions);
      
      console.log(' Email sent successfully:', {
        messageId: info.messageId,
        to: to,
        subject: subject,
        response: info.response
      });
      
      return info;
    } catch (error) {
      console.error(' Send email error:', error);
      console.error('Error details:', {
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode
      });
      throw error;
    }
  }

  // Send appointment letter for signing
  async sendAppointmentLetterForSigning(to, candidateName, signingUrl, attachmentPath, filename) {
    try {
      const html = `
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
              background: #003366; 
              color: white; 
              padding: 12px 30px; 
              text-decoration: none; 
              border-radius: 5px;
              margin: 20px 0;
              font-weight: bold;
            }
            .button:hover { background: #002244; }
            .footer { margin-top: 20px; text-align: center; color: #666; font-size: 12px; }
            .warning { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>SUYASH ENTERPRISES</h2>
            </div>
            <div class="content">
              <h3>Dear ${candidateName},</h3>
              
              <p>Congratulations on your selection! We are pleased to send you your appointment letter.</p>
              
              <p>Please review the attached appointment letter carefully. Once you have reviewed it, click the button below to sign it electronically:</p>
              
              <div style="text-align: center;">
                <a href="${signingUrl}" class="button">✍️ CLICK HERE TO SIGN YOUR LETTER</a>
              </div>
              
              <div class="warning">
                <strong>⚠️ Important Information:</strong>
                <ul style="margin-top: 10px;">
                  <li>This link will expire in 7 days</li>
                  <li>You will need to type your full name as your digital signature</li>
                  <li>After signing, you will receive a confirmation email</li>
                  <li>The signed copy will be available for download</li>
                </ul>
              </div>
              
              <p>If you have any questions or concerns, please contact the HR department.</p>
              
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

      const attachments = attachmentPath ? [{
        filename: filename,
        path: attachmentPath
      }] : [];

      return await this.sendEmail({
        to,
        subject: 'Appointment Letter for Signing - Suyash Enterprises',
        html,
        attachments
      });
    } catch (error) {
      console.error('Send appointment letter error:', error);
      throw error;
    }
  }

  // Send interview invitation
  async sendInterviewInvitation(interview, application) {
    try {
      const candidate = application.candidateId;
      const job = application.jobId;

      const mailOptions = {
        from: `"Recruitment Team" <${process.env.SMTP_USER}>`,
        to: candidate.email,
        subject: `Interview Scheduled: ${job.title} - ${interview.round} Round`,
        html: `
          <h2>Interview Scheduled</h2>
          <p>Dear ${candidate.firstName} ${candidate.lastName},</p>
          <p>Your interview for <strong>${job.title}</strong> position has been scheduled.</p>
          <h3>Details:</h3>
          <ul>
            <li><strong>Round:</strong> ${interview.round}</li>
            <li><strong>Date:</strong> ${new Date(interview.scheduledAt).toLocaleDateString()}</li>
            <li><strong>Time:</strong> ${new Date(interview.scheduledAt).toLocaleTimeString()}</li>
            <li><strong>Duration:</strong> ${interview.duration} minutes</li>
            <li><strong>Type:</strong> ${interview.type}</li>
            ${interview.location ? `<li><strong>Location:</strong> ${interview.location}</li>` : ''}
            ${interview.meetingLink ? `<li><strong>Meeting Link:</strong> <a href="${interview.meetingLink}">${interview.meetingLink}</a></li>` : ''}
          </ul>
          <h3>Interviewers:</h3>
          <ul>
            ${interview.interviewers.map(i => `<li>${i.name}</li>`).join('')}
          </ul>
          <p>Please be prepared and arrive 10 minutes before the scheduled time.</p>
          <p>Best regards,<br>Recruitment Team</p>
        `
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Interview invitation sent to ${candidate.email}`);
    } catch (error) {
      console.error('Send interview invitation error:', error);
    }
  }

  // Send interview reschedule notification
  async sendInterviewReschedule(interview, reason) {
    try {
      const application = await interview.populate('applicationId');
      const candidate = application.applicationId.candidateId;

      const mailOptions = {
        from: `"Recruitment Team" <${process.env.SMTP_USER}>`,
        to: candidate.email,
        subject: `Interview Rescheduled: ${application.applicationId.jobId.title}`,
        html: `
          <h2>Interview Rescheduled</h2>
          <p>Dear ${candidate.firstName} ${candidate.lastName},</p>
          <p>Your interview has been rescheduled.</p>
          <h3>New Schedule:</h3>
          <ul>
            <li><strong>Date:</strong> ${new Date(interview.scheduledAt).toLocaleDateString()}</li>
            <li><strong>Time:</strong> ${new Date(interview.scheduledAt).toLocaleTimeString()}</li>
          </ul>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>Best regards,<br>Recruitment Team</p>
        `
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Send interview reschedule error:', error);
    }
  }

  // Send interview cancellation notification
  async sendInterviewCancellation(interview, reason) {
    try {
      const application = await interview.populate('applicationId');
      const candidate = application.applicationId.candidateId;

      const mailOptions = {
        from: `"Recruitment Team" <${process.env.SMTP_USER}>`,
        to: candidate.email,
        subject: `Interview Cancelled`,
        html: `
          <h2>Interview Cancelled</h2>
          <p>Dear ${candidate.firstName} ${candidate.lastName},</p>
          <p>Your interview has been cancelled.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p>We will contact you soon to reschedule.</p>
          <p>Best regards,<br>Recruitment Team</p>
        `
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Send interview cancellation error:', error);
    }
  }

  // Send offer letter
  async sendOfferLetter(offer, candidate, offerLetterUrl, accessToken) {
    try {
      const mailOptions = {
        from: `"HR Team" <${process.env.SMTP_USER}>`,
        to: candidate.email,
        subject: `Offer Letter: ${offer.offerDetails.designation} Position`,
        html: `
          <h2>Offer of Employment</h2>
          <p>Dear ${candidate.firstName} ${candidate.lastName},</p>
          <p>We are pleased to offer you the position of <strong>${offer.offerDetails.designation}</strong>.</p>
          <h3>Offer Details:</h3>
          <ul>
            <li><strong>Position:</strong> ${offer.offerDetails.designation}</li>
            <li><strong>Location:</strong> ${offer.offerDetails.location}</li>
            <li><strong>Joining Date:</strong> ${new Date(offer.offerDetails.joiningDate).toLocaleDateString()}</li>
          </ul>
          ${offerLetterUrl ? `<p>Please find attached your offer letter.</p>` : ''}
          <p>To view and accept your offer, please click the link below:</p>
          <p><a href="${process.env.BASE_URL || 'http://localhost:5009'}/api/offers/view/${accessToken || offer._id}">View Offer</a></p>
          <p>Best regards,<br>HR Team</p>
        `,
        attachments: offerLetterUrl ? [{
          filename: `offer_letter_${offer.offerId}.pdf`,
          path: offerLetterUrl
        }] : []
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Offer letter sent to ${candidate.email}`);
    } catch (error) {
      console.error('Send offer letter error:', error);
      throw error;
    }
  }

  
// Send RFQ email to vendors
async sendRFQEmail(vendor, rfq, pdfPath = null) {
  try {
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #003366; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
          .button { 
            display: inline-block; 
            background: #28a745; 
            color: white; 
            padding: 12px 30px; 
            text-decoration: none; 
            border-radius: 5px;
            margin: 20px 0;
            font-weight: bold;
          }
          .button:hover { background: #218838; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
          th { background: #003366; color: white; }
          .footer { margin-top: 20px; text-align: center; color: #666; font-size: 12px; }
          .warning { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>REQUEST FOR QUOTATION</h2>
            <h3>${rfq.rfq_number}</h3>
          </div>
          <div class="content">
            <p>Dear ${vendor.vendor_name},</p>
            
            <p>We would like to request a quotation for the following items:</p>
            
            <table>
              <thead>
                <tr>
                  <th>Part No</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                ${rfq.items.map(item => `
                  <tr>
                    <td>${item.part_no}</td>
                    <td>${item.description || '-'}</td>
                    <td>${item.required_qty}</td>
                    <td>${item.unit}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <p><strong>Valid Till:</strong> ${new Date(rfq.valid_till).toLocaleDateString('en-IN')}</p>
            <p><strong>RFQ Date:</strong> ${new Date(rfq.rfq_date).toLocaleDateString('en-IN')}</p>
            
            <div class="warning">
              <strong>📋 Please Note:</strong>
              <ul style="margin-top: 10px;">
                <li>Quotes must be submitted before the valid till date</li>
                <li>Please mention delivery timeline</li>
                <li>Include GST details in your quote</li>
                <li>Mention payment terms (e.g., Net 30, Net 45)</li>
              </ul>
            </div>
            
            
            <p>If you have any questions or need clarifications, please contact:</p>
            <p>
              <strong>Purchase Department</strong><br>
              Email: purchase@suyashenterprises.com<br>
              Phone: +91-XXXXXXXXXX
            </p>
            
            <p>Thank you for your prompt response.</p>
            
            <p>Best regards,<br>
            <strong>Purchase Team</strong><br>
            Suyash Enterprises</p>
          </div>
          <div class="footer">
            <p>This is an automated email from Suyash Enterprises. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} Suyash Enterprises. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const attachments = pdfPath ? [{
      filename: `RFQ_${rfq.rfq_number}.pdf`,
      path: pdfPath
    }] : [];

    console.log(`📧 Sending RFQ email to ${vendor.vendor_name} (${vendor.email})`);
    
    return await this.sendEmail({
      to: vendor.email,
      subject: `${rfq.rfq_number} - Request for Quotation - Suyash Enterprises`,
      html: emailHtml,
      attachments
    });
    
  } catch (error) {
    console.error('❌ Send RFQ email error:', error);
    throw error;
  }
}


  // Send simple notification when PDF generation fails
  async sendSimpleNotification(offer, candidate) {
    try {
      const mailOptions = {
        from: `"HR Team" <${process.env.SMTP_USER}>`,
        to: candidate.email,
        subject: `Offer Approved - ${offer.offerId}`,
        html: `
          <h2>Offer Approved</h2>
          <p>Dear ${candidate.firstName} ${candidate.lastName},</p>
          <p>We are pleased to inform you that your offer has been approved.</p>
          <h3>Offer Details:</h3>
          <ul>
            <li><strong>Position:</strong> ${offer.offerDetails.designation}</li>
            <li><strong>Location:</strong> ${offer.offerDetails.location}</li>
            <li><strong>Joining Date:</strong> ${new Date(offer.offerDetails.joiningDate).toLocaleDateString()}</li>
            <li><strong>Total CTC:</strong> ₹${offer.ctcDetails.totalCtc.toLocaleString()}</li>
          </ul>
          <p>Please log in to the candidate portal to view and accept your offer:</p>
          <p><a href="${process.env.CANDIDATE_PORTAL_URL || 'http://localhost:3000'}/offers/${offer.offerId}">View Offer</a></p>
          <p>Best regards,<br>HR Team</p>
        `
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Simple notification sent to ${candidate.email}`);
    } catch (error) {
      console.error('Send simple notification error:', error);
      throw error;
    }
  }
  
  // Add this method inside the EmailService class
async sendAppointmentLetterWithAccept(to, candidateName, employeeId, acceptUrl, attachmentPath, filename) {
  try {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #003366; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
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
          .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #ddd; padding-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          td, th { padding: 10px; border: 1px solid #ddd; }
          th { background: #003366; color: white; }
          .note { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>SUYASH ENTERPRISES</h2>
            <h3>Appointment Letter</h3>
          </div>
          <div class="content">
            <h3>Dear ${candidateName},</h3>
            
            <p>Congratulations! We are pleased to appoint you as an employee of Suyash Enterprises.</p>
            
            <div class="details">
              <h4 style="color: #003366; margin-top: 0;">📋 APPOINTMENT DETAILS:</h4>
              <table>
                <tr><td><strong>Employee ID:</strong></td><td>${employeeId}</td></tr>
                <tr><td><strong>Status:</strong></td><td>Appointment Letter Generated</td></tr>
                <tr><td><strong>Date:</strong></td><td>${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
              </table>
            </div>
            
            <div class="note">
              <strong>📎 ATTACHMENT:</strong> Your appointment letter is attached to this email. Please download and save it for your records.
            </div>
            
            <p><strong>✅ ONE-CLICK ACCEPTANCE:</strong></p>
            <p>Please click the button below to formally accept your appointment:</p>
            
            <div style="text-align: center;">
              <a href="${acceptUrl}" class="button">✅ ACCEPT APPOINTMENT</a>
            </div>
            
            <p><strong>What happens after you accept?</strong></p>
            <ul>
              <li>You will receive a confirmation of your acceptance</li>
              <li>HR will contact you with onboarding instructions</li>
              <li>You will receive document upload links</li>
              <li>Joining details will be shared via email</li>
            </ul>
            
            <p>If you have any questions, please reply to this email or contact HR.</p>
            
            <p>Best regards,<br>
            <strong>HR Team</strong><br>
            Suyash Enterprises</p>
            
            <p style="font-size: 12px; color: #999; margin-top: 20px;">
              <strong>Contact:</strong> hr@suyashenterprises.com | Tel: +91-XXXXXXXXXX
            </p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} Suyash Enterprises. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const attachments = attachmentPath ? [{
      filename: filename,
      path: attachmentPath
    }] : [];

    console.log('📧 Sending appointment letter with accept button to:', to);
    
    return await this.sendEmail({
      to,
      subject: `Appointment Letter - ${employeeId} - Suyash Enterprises`,
      html,
      attachments
    });
  } catch (error) {
    console.error('❌ Send appointment letter with accept error:', error);
    throw error;
  }
}

  // NEW: Send simple offer email when PDF is not available
  async sendSimpleOfferEmail(offer, candidate, viewOfferUrl) {
    try {
      const mailOptions = {
        from: `"HR Team" <${process.env.SMTP_USER}>`,
        to: candidate.email,
        subject: `Offer Letter - ${offer.offerDetails.designation} Position`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #003366; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
              .button { 
                display: inline-block; 
                background: #003366; 
                color: white; 
                padding: 12px 30px; 
                text-decoration: none; 
                border-radius: 5px;
                margin: 20px 0;
                font-weight: bold;
              }
              .button:hover { background: #002244; }
              .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #ddd; padding-top: 20px; }
              .details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
              .warning { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
              ul { list-style-type: none; padding: 0; }
              li { padding: 8px 0; border-bottom: 1px solid #eee; }
              li:last-child { border-bottom: none; }
              .total { font-weight: bold; color: #003366; font-size: 18px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>SUYASH ENTERPRISES</h2>
                <p>Offer of Employment</p>
              </div>
              <div class="content">
                <h3>Dear ${candidate.firstName} ${candidate.lastName},</h3>
                
                <p>We are pleased to inform you that your offer for the position of 
                <strong>${offer.offerDetails.designation}</strong> has been approved and is ready for your review.</p>

                <div class="details">
                  <h4 style="color: #003366; margin-top: 0;">Offer Summary:</h4>
                  <ul>
                    <li><strong>Position:</strong> ${offer.offerDetails.designation}</li>
                    <li><strong>Department:</strong> ${offer.offerDetails.department}</li>
                    <li><strong>Location:</strong> ${offer.offerDetails.location}</li>
                    <li><strong>Joining Date:</strong> ${new Date(offer.offerDetails.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</li>
                    <li><strong>Reporting To:</strong> ${offer.offerDetails.reportingTo || 'Not Specified'}</li>
                    <li><strong>Employment Type:</strong> ${offer.offerDetails.employmentType || 'Full Time'}</li>
                    <li><strong>Probation Period:</strong> ${offer.offerDetails.probationPeriod} months</li>
                    <li class="total"><strong>Total CTC:</strong> ₹${offer.ctcDetails.totalCtc.toLocaleString('en-IN')} per annum</li>
                  </ul>
                </div>

                <div class="warning">
                  <strong>📄 Important Information:</strong>
                  <p style="margin-top: 10px;">Due to technical reasons, we're providing an online view instead of a PDF attachment. You can view your complete offer letter including detailed CTC breakdown through the secure link below.</p>
                </div>
                
                <div style="text-align: center;">
                  <a href="${viewOfferUrl}" class="button">📄 VIEW YOUR OFFER LETTER</a>
                </div>
                
                <p><strong>Next Steps:</strong></p>
                <ol style="margin-left: 20px;">
                  <li>Click the button above to view your complete offer letter</li>
                  <li>Review all terms, conditions, and compensation details</li>
                  <li>Accept or decline the offer through the secure portal</li>
                  <li>Upload required documents after acceptance</li>
                </ol>
                
                <p><strong>Note:</strong> This offer is valid for 15 days from the date of this email. The link will expire after that period.</p>
                
                <p>If you have any questions or need clarification, please don't hesitate to contact our HR department.</p>
                
                <p>Best regards,<br>
                <strong>HR Team</strong><br>
                Suyash Enterprises</p>
                
                <p style="font-size: 12px; color: #999; margin-top: 20px;">
                  <strong>Contact:</strong> hr@suyashenterprises.com | Tel: +91-XXXXXXXXXX
                </p>
              </div>
              <div class="footer">
                <p>This is an automated email. Please do not reply to this message.</p>
                <p>&copy; ${new Date().getFullYear()} Suyash Enterprises. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      console.log('📧 Sending simple offer email to:', candidate.email);
      const info = await this.transporter.sendMail(mailOptions);
      
      console.log('✅ Simple offer email sent successfully:', {
        messageId: info.messageId,
        to: candidate.email,
        offerId: offer.offerId
      });
      
      return info;
    } catch (error) {
      console.error('❌ Send simple offer email error:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();