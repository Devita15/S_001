// services/playwrightPdfGenerator.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');

class PlaywrightPDFGenerator {
  
  constructor() {
    this.templateDir = path.join(__dirname, '../templates');
  }

  async generatePDF(templateName, data, options = {}) {
    let browser = null;
    try {
      // Load and compile template
      const templatePath = path.join(this.templateDir, `${templateName}.html`);
      const templateHtml = fs.readFileSync(templatePath, 'utf8');
      const template = handlebars.compile(templateHtml);
      const finalHtml = template(data);

      // Launch browser with no-sandbox for restricted environments
      browser = await chromium.launch({
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080'
        ],
        headless: true
      });
      
      const page = await browser.newPage();
      
      // Set content
      await page.setContent(finalHtml, {
        waitUntil: 'networkidle0'
      });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        },
        ...options
      });

      await browser.close();
      browser = null;

      return pdfBuffer;
    } catch (error) {
      console.error('Playwright PDF generation error:', error);
      if (browser) {
        await browser.close().catch(e => console.error('Error closing browser:', e));
      }
      throw error;
    }
  }

  async generateOfferLetter(offer, candidate, job) {
    const data = {
      offerId: offer.offerId,
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      candidateAddress: candidate.address ? 
        `${candidate.address.street || ''}, ${candidate.address.city || ''}` : 'Not provided',
      position: job.title,
      department: job.department,
      location: offer.offerDetails.location || job.location,
      joiningDate: new Date(offer.offerDetails.joiningDate).toLocaleDateString('en-IN'),
      ctc: {
        monthly: {
          basic: offer.ctcDetails.basic,
          hra: offer.ctcDetails.hra,
          conveyance: offer.ctcDetails.conveyanceAllowance,
          medical: offer.ctcDetails.medicalAllowance,
          special: offer.ctcDetails.specialAllowance,
          gross: offer.ctcDetails.gross
        },
        annual: {
          basic: offer.ctcDetails.basic * 12,
          hra: offer.ctcDetails.hra * 12,
          conveyance: offer.ctcDetails.conveyanceAllowance * 12,
          medical: offer.ctcDetails.medicalAllowance * 12,
          special: offer.ctcDetails.specialAllowance * 12,
          gross: offer.ctcDetails.gross * 12,
          employerPf: offer.ctcDetails.employerPf * 12,
          employerEsi: offer.ctcDetails.employerEsi * 12,
          bonus: offer.ctcDetails.bonus * 12,
          gratuity: offer.ctcDetails.gratuity * 12,
          total: offer.ctcDetails.totalCtc
        }
      },
      offerDetails: offer.offerDetails,
      companyName: 'Suyash Enterprises',
      companyAddress: '123 Industrial Area, Mumbai - 400001',
      generatedDate: new Date().toLocaleDateString('en-IN')
    };

    return this.generatePDF('offer-letter', data);
  }

  async generateCTCBreakdown(offer, candidate) {
    const data = {
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      offerId: offer.offerId,
      monthly: offer.ctcDetails,
      annual: {
        basic: offer.ctcDetails.basic * 12,
        hra: offer.ctcDetails.hra * 12,
        conveyance: offer.ctcDetails.conveyanceAllowance * 12,
        medical: offer.ctcDetails.medicalAllowance * 12,
        special: offer.ctcDetails.specialAllowance * 12,
        gross: offer.ctcDetails.gross * 12,
        employerPf: offer.ctcDetails.employerPf * 12,
        employerEsi: offer.ctcDetails.employerEsi * 12,
        gratuity: offer.ctcDetails.gratuity * 12,
        bonus: offer.ctcDetails.bonus * 12,
        total: offer.ctcDetails.totalCtc
      },
      generatedDate: new Date().toLocaleDateString('en-IN')
    };

    return this.generatePDF('ctc-breakdown', data);
  }

  async generateAppointmentLetter(employee, offer, candidate) {
    const data = {
      employeeId: employee.EmployeeID,
      employeeName: `${candidate.firstName} ${candidate.lastName}`,
      designation: offer.offerDetails.designation,
      department: offer.offerDetails.department,
      joiningDate: new Date(offer.offerDetails.joiningDate).toLocaleDateString('en-IN'),
      probationPeriod: offer.offerDetails.probationPeriod,
      reportingTo: offer.offerDetails.reportingTo,
      companyName: 'Suyash Enterprises',
      generatedDate: new Date().toLocaleDateString('en-IN')
    };

    return this.generatePDF('appointment-letter', data);
  }
}

module.exports = new PlaywrightPDFGenerator();