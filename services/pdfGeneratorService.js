// services/pdfGeneratorService.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const handlebars = require('handlebars');

class PDFGeneratorService {
  
  async generatePDF(templateName, data) {
    const browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    // ... rest similar to puppeteer
    await browser.close();
  }

  
  constructor() {
    this.templateDir = path.join(__dirname, '../templates');
  }

  // Generate PDF from HTML template
  async generatePDF(templateName, data, options = {}) {
    try {
      const templatePath = path.join(this.templateDir, `${templateName}.html`);
      const templateHtml = fs.readFileSync(templatePath, 'utf8');
      const template = handlebars.compile(templateHtml);
      const finalHtml = template(data);

      // Launch browser with explicit cache directory and no-sandbox
      const browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ],
        env: {
          ...process.env,
          PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR || path.join(__dirname, '../.cache/puppeteer')
        }
      });
      
      const page = await browser.newPage();
      await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

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
      return pdfBuffer;
    } catch (error) {
      console.error('PDF generation error:', error);
      throw error;
    }
  }


  // Generate offer letter
  async generateOfferLetter(offer, candidate, job) {
    const data = {
      offerId: offer.offerId,
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      candidateAddress: candidate.address,
      position: job.title,
      department: job.department,
      location: offer.offerDetails.location || job.location,
      joiningDate: new Date(offer.offerDetails.joiningDate).toLocaleDateString('en-IN'),
      ctc: {
        monthly: offer.ctcDetails.gross,
        annual: offer.ctcDetails.totalCtc,
        breakdown: offer.ctcDetails
      },
      offerDetails: offer.offerDetails,
      companyName: 'Suyash Enterprises',
      companyAddress: '123 Industrial Area, Mumbai - 400001',
      generatedDate: new Date().toLocaleDateString('en-IN')
    };

    return this.generatePDF('offer-letter', data);
  }

  // Generate appointment letter
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

  // Generate CTC breakdown PDF
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
}

module.exports = new PDFGeneratorService();