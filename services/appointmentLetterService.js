// services/appointmentLetterService.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class AppointmentLetterService {
  
  /**
   * Generate appointment letter PDF - OPTIMIZED FOR SINGLE PAGE
   */
  async generateLetter(candidate, offer, joiningDate) {
    return new Promise((resolve, reject) => {
      try {
        // Create PDF with smaller margins and custom size
        const doc = new PDFDocument({ 
          margin: 30,  // Reduced margins
          size: 'A4',
          layout: 'portrait'
        });
        
        // Collect PDF chunks
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // === HEADER SECTION (compact) ===
        doc.fontSize(16).font('Helvetica-Bold')
          .text('SUYASH ENTERPRISES', { align: 'center' });
        
        doc.fontSize(12).font('Helvetica-Bold')
          .text('APPOINTMENT LETTER', { align: 'center' });
        
        // Horizontal line
        doc.moveTo(30, doc.y + 5)
          .lineTo(580, doc.y + 5)
          .strokeColor('#003366')
          .lineWidth(1)
          .stroke();
        
        doc.moveDown(0.5);
        
        // === DATE AND REFERENCE (compact, side by side) ===
        const dateY = doc.y;
        doc.fontSize(9).font('Helvetica')
          .text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 30, dateY);
        
        doc.text(`Ref: APPT/${candidate._id.toString().slice(-6)}/${new Date().getFullYear()}`, 
          400, dateY, { align: 'right' });
        
        doc.moveDown(1);
        
        // === CANDIDATE GREETING ===
        doc.fontSize(11).font('Helvetica-Bold')
          .text(`Dear ${candidate.fullName || `${candidate.firstName} ${candidate.lastName}`},`);
        
        doc.moveDown(0.3);
        
        // === OPENING PARAGRAPH (compact) ===
        doc.fontSize(9.5).font('Helvetica')
          .text('We are pleased to appoint you as an employee of Suyash Enterprises, subject to the terms and conditions set out in this letter.', {
            align: 'justify',
            lineGap: 2
          });
        
        doc.moveDown(0.5);
        
        // === POSITION DETAILS - COMPACT TABLE ===
        doc.fontSize(10).font('Helvetica-Bold')
          .fillColor('#003366')
          .text('POSITION DETAILS', { underline: false });
        
        doc.fillColor('black');
        
        const startY = doc.y;
        const col1 = 30;
        const col2 = 150;
        
        // Two-column layout for position details
        doc.fontSize(9).font('Helvetica-Bold')
          .text('Position:', col1, startY);
        doc.font('Helvetica')
          .text(offer.position || offer.designation || 'Not Specified', col2, startY);
        
        doc.font('Helvetica-Bold')
          .text('Department:', col1, startY + 15);
        doc.font('Helvetica')
          .text(offer.department || 'Not Specified', col2, startY + 15);
        
        doc.font('Helvetica-Bold')
          .text('Location:', col1, startY + 30);
        doc.font('Helvetica')
          .text(offer.location || 'Head Office', col2, startY + 30);
        
        doc.font('Helvetica-Bold')
          .text('Reporting To:', col1, startY + 45);
        doc.font('Helvetica')
          .text(offer.reportingTo || 'Department Head', col2, startY + 45);
        
        doc.font('Helvetica-Bold')
          .text('Joining Date:', col1, startY + 60);
        doc.font('Helvetica')
          .text(new Date(joiningDate || offer.joiningDate).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric'
          }), col2, startY + 60);
        
        doc.y = startY + 80;
        doc.moveDown(0.5);
        
        // === COMPENSATION TABLE - COMPACT ===
        doc.fontSize(10).font('Helvetica-Bold')
          .fillColor('#003366')
          .text('COMPENSATION DETAILS', { underline: false });
        
        doc.fillColor('black');
        doc.moveDown(0.2);
        
        const ctc = offer.ctcDetails || {};
        
        // Draw compact table
        const tableTop = doc.y;
        const tableLeft = 30;
        const colWidths = [200, 150, 150];
        
        // Table headers
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('Component', tableLeft, tableTop);
        doc.text('Monthly (₹)', tableLeft + colWidths[0], tableTop);
        doc.text('Annual (₹)', tableLeft + colWidths[0] + colWidths[1], tableTop);
        
        // Draw header line
        doc.moveTo(tableLeft, tableTop + 15)
          .lineTo(tableLeft + colWidths[0] + colWidths[1] + colWidths[2], tableTop + 15)
          .stroke();
        
        // Table rows (compact)
        const rows = [
          ['Basic Salary', ctc.basic || 0, (ctc.basic || 0) * 12],
          ['HRA', ctc.hra || 0, (ctc.hra || 0) * 12],
          ['Conveyance', ctc.conveyanceAllowance || 0, (ctc.conveyanceAllowance || 0) * 12],
          ['Medical', ctc.medicalAllowance || 0, (ctc.medicalAllowance || 0) * 12],
          ['Special', ctc.specialAllowance || 0, (ctc.specialAllowance || 0) * 12]
        ];
        
        let rowY = tableTop + 20;
        doc.font('Helvetica').fontSize(8.5);
        
        rows.forEach((row, index) => {
          doc.text(row[0], tableLeft, rowY);
          doc.text(row[1].toLocaleString(), tableLeft + colWidths[0], rowY);
          doc.text(row[2].toLocaleString(), tableLeft + colWidths[0] + colWidths[1], rowY);
          rowY += 14;  // Reduced row height
        });
        
        // Total row
        doc.font('Helvetica-Bold');
        doc.text('Total CTC', tableLeft, rowY);
        doc.text('', tableLeft + colWidths[0], rowY);
        doc.text(`₹${(ctc.totalCtc || 0).toLocaleString()}`, tableLeft + colWidths[0] + colWidths[1], rowY);
        
        doc.y = rowY + 20;
        doc.moveDown(0.5);
        
        // === TERMS AND CONDITIONS - COMPACT ===
        doc.fontSize(10).font('Helvetica-Bold')
          .fillColor('#003366')
          .text('TERMS AND CONDITIONS', { underline: false });
        
        doc.fillColor('black');
        doc.moveDown(0.2);
        
        doc.font('Helvetica').fontSize(8.5);
        const terms = [
          `• Probation: ${offer.probationPeriod || '6'} months`,
          `• Notice Period: ${offer.noticePeriod || '30'} days by either party`,
          `• Background verification subject to clearance`,
          `• Company rules and regulations apply`
        ];
        
        terms.forEach(term => {
          doc.text(term, { indent: 15, lineGap: 2 });
        });
        
        doc.moveDown(0.5);
        
        // === SIGNATURE SECTION - COMPACT ===
        // Company signature (left)
        const sigY = doc.y;
        doc.fontSize(9).font('Helvetica')
          .text('For Suyash Enterprises', 30, sigY);
        
        doc.moveDown(0.5);
        doc.text('(Authorized Signatory)', 30, doc.y);
        
        // Candidate acceptance (right)
        doc.font('Helvetica')
          .text('I accept the above terms:', 300, sigY);
        
        doc.moveDown(0.5);
        doc.text('Signature: _________________________', 300, doc.y);
        
        doc.moveDown(0.3);
        doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 300, doc.y);
        
        // === FOOTER (always at bottom) ===
        const pageHeight = doc.page.height - 30;
        doc.fontSize(7).font('Helvetica')
          .fillColor('#666666')
          .text('This is a system generated document. No signature required.', 
            30, pageHeight, { align: 'center', width: 550 });
        
        // Finalize
        doc.end();
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Alternative: Generate compact HTML version
   */
  generateHTML(candidate, offer, joiningDate) {
    const ctc = offer.ctcDetails || {};
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Appointment Letter</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 15px; 
            line-height: 1.3;
            font-size: 11px;
          }
          .container { 
            max-width: 1000px; 
            margin: 0 auto; 
            border: 1px solid #ddd;
            padding: 20px;
          }
          .header { 
            text-align: center; 
            border-bottom: 2px solid #003366; 
            padding-bottom: 5px;
            margin-bottom: 10px;
          }
          .company-name { 
            font-size: 20px; 
            font-weight: bold; 
            color: #003366; 
          }
          .title { 
            font-size: 14px; 
            font-weight: bold; 
          }
          .section { 
            margin: 10px 0;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
          }
          .section-title { 
            font-weight: bold; 
            color: #003366;
            font-size: 12px;
            margin-bottom: 3px;
          }
          .details-grid {
            display: grid;
            grid-template-columns: 120px 1fr 120px 1fr;
            gap: 5px;
            margin: 5px 0;
          }
          .label { font-weight: bold; }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            font-size: 10px;
          }
          th, td { 
            padding: 4px; 
            border: 1px solid #ddd; 
          }
          th { 
            background: #003366; 
            color: white; 
          }
          .total-row { 
            font-weight: bold; 
            background: #f0f0f0; 
          }
          .signature-section {
            margin-top: 15px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
          }
          .footer { 
            margin-top: 15px; 
            text-align: center; 
            font-size: 8px; 
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 5px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="company-name">SUYASH ENTERPRISES</div>
            <div class="title">APPOINTMENT LETTER</div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 10px;">
            <span>Date: ${new Date().toLocaleDateString('en-IN')}</span>
            <span>Ref: APPT/${candidate._id?.toString().slice(-6) || '0000'}/${new Date().getFullYear()}</span>
          </div>

          <p><strong>Dear ${candidate.fullName || `${candidate.firstName} ${candidate.lastName}`},</strong></p>
          
          <p style="text-align: justify;">We are pleased to appoint you as an employee of Suyash Enterprises, subject to the terms and conditions set out in this letter.</p>

          <div class="section">
            <div class="section-title">POSITION DETAILS</div>
            <div class="details-grid">
              <span class="label">Position:</span>
              <span>${offer.position || offer.designation || 'Not Specified'}</span>
              <span class="label">Department:</span>
              <span>${offer.department || 'Not Specified'}</span>
              
              <span class="label">Location:</span>
              <span>${offer.location || 'Head Office'}</span>
              <span class="label">Reporting To:</span>
              <span>${offer.reportingTo || 'Department Head'}</span>
              
              <span class="label">Joining Date:</span>
              <span colspan="3">${new Date(joiningDate || offer.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">COMPENSATION DETAILS</div>
            <table>
              <tr><th>Component</th><th>Monthly (₹)</th><th>Annual (₹)</th></tr>
              <tr><td>Basic Salary</td><td>${(ctc.basic || 0).toLocaleString()}</td><td>${((ctc.basic || 0) * 12).toLocaleString()}</td></tr>
              <tr><td>HRA</td><td>${(ctc.hra || 0).toLocaleString()}</td><td>${((ctc.hra || 0) * 12).toLocaleString()}</td></tr>
              <tr><td>Conveyance</td><td>${(ctc.conveyanceAllowance || 0).toLocaleString()}</td><td>${((ctc.conveyanceAllowance || 0) * 12).toLocaleString()}</td></tr>
              <tr><td>Medical</td><td>${(ctc.medicalAllowance || 0).toLocaleString()}</td><td>${((ctc.medicalAllowance || 0) * 12).toLocaleString()}</td></tr>
              <tr><td>Special</td><td>${(ctc.specialAllowance || 0).toLocaleString()}</td><td>${((ctc.specialAllowance || 0) * 12).toLocaleString()}</td></tr>
              <tr class="total-row"><td colspan="2"><strong>Total CTC (Annual)</strong></td><td><strong>₹${(ctc.totalCtc || 0).toLocaleString()}</strong></td></tr>
            </table>
          </div>

          <div class="section">
            <div class="section-title">TERMS AND CONDITIONS</div>
            <ul style="margin: 2px 0; padding-left: 20px; font-size: 10px;">
              <li>Probation period: ${offer.probationPeriod || '6'} months</li>
              <li>Notice period: ${offer.noticePeriod || '30'} days by either party</li>
              <li>Subject to background verification clearance</li>
              <li>Company rules and regulations apply</li>
            </ul>
          </div>

          <div class="signature-section">
            <div>
              <p>For Suyash Enterprises</p>
              <p><br><br></p>
              <p>(Authorized Signatory)</p>
            </div>
            <div>
              <p>I accept the above terms:</p>
              <p>Signature: _________________________</p>
              <p>Date: ${new Date().toLocaleDateString('en-IN')}</p>
            </div>
          </div>

          <div class="footer">
            This is a system generated document
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = new AppointmentLetterService();