const axios = require('axios');
const BackgroundVerification = require('../models/HR/BackgroundVerification');
const crypto = require('crypto');

class BGVService {
  
  constructor() {
    this.apiKey = process.env.AUTHBRIDGE_API_KEY;
    this.apiSecret = process.env.AUTHBRIDGE_API_SECRET;
    this.baseUrl = process.env.AUTHBRIDGE_API_URL || 'https://api.authbridge.com/v1';
    this.webhookUrl = process.env.BGV_WEBHOOK_URL;
  }

  // Initiate background verification
  async initiateBGV(candidate, offer, documents) {
    try {
      const requestId = crypto.randomBytes(16).toString('hex');

      // Prepare request data for AuthBridge
      const requestData = {
        requestId,
        candidate: {
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          dateOfBirth: candidate.dateOfBirth,
          address: candidate.address
        },
        checks: [
          { type: 'identity', documents: this.prepareIdentityDocs(documents) },
          { type: 'education', documents: this.prepareEducationDocs(documents) },
          { type: 'employment', documents: this.prepareEmploymentDocs(documents) },
          { type: 'address', documents: this.prepareAddressDocs(documents) },
          { type: 'criminal' }
        ],
        webhook: {
          url: `${this.webhookUrl}/bgv-webhook`,
          events: ['completed', 'failed']
        }
      };

      // Call AuthBridge API (simulated)
      // const response = await axios.post(`${this.baseUrl}/verifications`, requestData, {
      //   headers: {
      //     'Authorization': `Bearer ${this.apiKey}`,
      //     'Content-Type': 'application/json'
      //   }
      // });

      // Simulated response
      const response = {
        data: {
          verificationId: `BGV-${Date.now()}`,
          status: 'in_progress',
          estimatedCompletion: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
        }
      };

      // Create BGV record
      const bgv = await BackgroundVerification.create({
        candidateId: candidate._id,
        offerId: offer._id,
        vendor: 'authbridge',
        vendorRequestId: response.data.verificationId,
        status: 'in_progress',
        requestData,
        checks: [
          { type: 'identity', status: 'in_progress' },
          { type: 'education', status: 'pending' },
          { type: 'employment', status: 'pending' },
          { type: 'address', status: 'pending' },
          { type: 'criminal', status: 'pending' }
        ],
        documents: documents.map(d => d._id),
        initiatedBy: offer.createdBy
      });

      return bgv;
    } catch (error) {
      console.error('Initiate BGV error:', error);
      throw error;
    }
  }

  // Handle webhook from BGV vendor
  async handleWebhook(payload) {
    try {
      const { verificationId, status, reports } = payload;

      const bgv = await BackgroundVerification.findOne({ vendorRequestId: verificationId });
      if (!bgv) {
        throw new Error('BGV record not found');
      }

      // Update BGV status
      bgv.status = status;
      bgv.responseData = payload;

      if (status === 'completed') {
        bgv.completedAt = new Date();
        bgv.reportUrl = reports?.reportUrl;

        // Update individual check statuses
        if (reports?.checks) {
          bgv.checks = bgv.checks.map(check => {
            const report = reports.checks.find(r => r.type === check.type);
            if (report) {
              check.status = report.status;
              check.result = report.result;
              check.completedAt = new Date();
              check.reportUrl = report.reportUrl;
            }
            return check;
          });
        }
      }

      // Store webhook event
      bgv.webhookEvents.push({
        event: status,
        receivedAt: new Date(),
        data: payload
      });

      await bgv.save();

      return bgv;
    } catch (error) {
      console.error('Handle BGV webhook error:', error);
      throw error;
    }
  }

  // Prepare identity documents
  prepareIdentityDocs(documents) {
    const identityDocs = documents.filter(d => 
      ['aadhar', 'pan', 'passport', 'voter_id', 'driving_license'].includes(d.type)
    );
    
    return identityDocs.map(doc => ({
      type: doc.type,
      number: this.extractDocumentNumber(doc),
      fileUrl: doc.fileUrl
    }));
  }

  // Prepare education documents
  prepareEducationDocs(documents) {
    const eduDocs = documents.filter(d => 
      ['educational_certificate'].includes(d.type)
    );
    
    return eduDocs.map(doc => ({
      type: doc.type,
      fileUrl: doc.fileUrl
    }));
  }

  // Prepare employment documents
  prepareEmploymentDocs(documents) {
    const empDocs = documents.filter(d => 
      ['experience_certificate', 'salary_slip'].includes(d.type)
    );
    
    return empDocs.map(doc => ({
      type: doc.type,
      fileUrl: doc.fileUrl
    }));
  }

  // Prepare address documents
  prepareAddressDocs(documents) {
    const addressDocs = documents.filter(d => 
      ['aadhar', 'passport', 'driving_license', 'bank_statement'].includes(d.type)
    );
    
    return addressDocs.map(doc => ({
      type: doc.type,
      fileUrl: doc.fileUrl
    }));
  }

  // Extract document number from document metadata
  extractDocumentNumber(doc) {
    // This would extract number from parsed document or metadata
    return doc.parsedData?.documentNumber || '';
  }
}

module.exports = new BGVService();