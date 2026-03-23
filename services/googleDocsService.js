// services/googleDocsService.js
const { google } = require('googleapis');
const docs = google.docs('v1');
const drive = google.drive('v3');

class GoogleDocsService {
  async generateOfferLetter(data, templateId) {
    try {
      // Copy template
      const copy = await drive.files.copy({
        fileId: templateId,
        requestBody: {
          name: `Offer_Letter_${data.candidateName}_${Date.now()}`
        }
      });

      // Replace placeholders
      const requests = Object.keys(data).map(key => ({
        replaceAllText: {
          containsText: { text: `{{${key}}}` },
          replaceText: data[key]
        }
      }));

      await docs.documents.batchUpdate({
        documentId: copy.data.id,
        requestBody: { requests }
      });

      // Export as PDF
      const pdf = await drive.files.export({
        fileId: copy.data.id,
        mimeType: 'application/pdf'
      });

      return pdf.data;
    } catch (error) {
      console.error('Google Docs error:', error);
      throw error;
    }
  }
}