// services/pdfApiService.js
const axios = require('axios');
const fs = require('fs');
const handlebars = require('handlebars');

class PDFApiService {
  constructor() {
    this.apiKey = process.env.PDF_API_KEY;
    this.apiUrl = process.env.PDF_API_URL || 'https://api.pdf.co/v1';
  }

  async generatePDF(templateName, data, outputPath) {
    try {
      // Read and compile template
      const templatePath = path.join(__dirname, '../templates', `${templateName}.html`);
      const templateHtml = fs.readFileSync(templatePath, 'utf8');
      const template = handlebars.compile(templateHtml);
      const html = template(data);

      // Call PDF generation API
      const response = await axios.post(`${this.apiUrl}/pdf/convert/from/html`, {
        html,
        name: `${templateName}_${Date.now()}.pdf`,
        margins: '20px 15px 20px 15px',
        paperSize: 'A4',
        printBackground: true
      }, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.error) {
        throw new Error(response.data.message);
      }

      // Download the generated PDF
      const pdfResponse = await axios.get(response.data.url, {
        responseType: 'arraybuffer'
      });

      fs.writeFileSync(outputPath, pdfResponse.data);
      return outputPath;
    } catch (error) {
      console.error('PDF generation API error:', error);
      throw error;
    }
  }
}

module.exports = new PDFApiService();