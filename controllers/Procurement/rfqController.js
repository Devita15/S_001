// controllers/Procurement/rfqController.js
const RFQ = require('../../models/Procurement/RFQ');
const PurchaseRequisition = require('../../models/Procurement/PurchaseRequisition');
const Vendor = require('../../models/CRM/Vendor');
const Item = require('../../models/CRM/Item');
const emailService = require('../../services/emailService');
const PDFDocument = require('pdfkit'); // Install: npm install pdfkit
const fs = require('fs');
const path = require('path');

// Helper function to generate RFQ PDF
const generateRFQPDF = async (rfq, vendor) => {
  return new Promise((resolve, reject) => {
    try {
      const pdfDir = path.join(__dirname, '../../uploads/rfq-pdfs');
      if (!fs.existsSync(pdfDir)) {
        fs.mkdirSync(pdfDir, { recursive: true });
      }

      const filename = `RFQ_${rfq.rfq_number}_${vendor.vendor_name.replace(/\s/g, '_')}.pdf`;
      const filepath = path.join(pdfDir, filename);

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('REQUEST FOR QUOTATION', { align: 'center' });
      doc.moveDown();
      doc.fontSize(16).text(rfq.rfq_number, { align: 'center' });
      doc.moveDown();

      // Company Details
      doc.fontSize(10).font('Helvetica');
      doc.text('Suyash Enterprises', { align: 'right' });
      doc.text('Mumbai, Maharashtra', { align: 'right' });
      doc.text('GSTIN: 27ABCDE1234F1Z5', { align: 'right' });
      doc.moveDown();

      // Vendor Details
      doc.fontSize(12).font('Helvetica-Bold').text('To:');
      doc.fontSize(10).font('Helvetica');
      doc.text(vendor.vendor_name);
      doc.text(vendor.vendor_id.address || '');
      doc.text(`Email: ${vendor.vendor_id.email || ''}`);
      doc.text(`GSTIN: ${vendor.vendor_id.gstin || ''}`);
      doc.moveDown();

      // RFQ Details Box
      doc.rect(50, doc.y, 495, 60).stroke();
      doc.fontSize(10).font('Helvetica');
      doc.text(`RFQ Date: ${new Date(rfq.rfq_date).toLocaleDateString('en-IN')}`, 60, doc.y + 10);
      doc.text(`Valid Till: ${new Date(rfq.valid_till).toLocaleDateString('en-IN')}`, 60, doc.y + 25);
      doc.text(`PR Reference: ${rfq.pr_id?.pr_number || 'N/A'}`, 60, doc.y + 40);
      doc.moveDown(2);

      // Items Table Header
      const tableTop = doc.y;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Sl No', 50, tableTop);
      doc.text('Part No', 100, tableTop);
      doc.text('Description', 180, tableTop);
      doc.text('Quantity', 350, tableTop);
      doc.text('Unit', 420, tableTop);
      
      doc.moveDown();
      doc.strokeColor('#000').lineWidth(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      
      // Items Table Rows
      let yPos = doc.y + 5;
      doc.fontSize(9).font('Helvetica');
      
      rfq.items.forEach((item, index) => {
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }
        
        doc.text((index + 1).toString(), 50, yPos);
        doc.text(item.part_no, 100, yPos);
        doc.text(item.description?.substring(0, 50) || '-', 180, yPos);
        doc.text(item.required_qty.toString(), 350, yPos);
        doc.text(item.unit, 420, yPos);
        
        yPos += 20;
      });
      
      doc.moveDown(2);
      
      // Terms & Conditions
      doc.fontSize(10).font('Helvetica-Bold').text('Terms & Conditions:', 50, yPos + 10);
      doc.fontSize(8).font('Helvetica');
      doc.text('1. Quotes must be submitted before the valid till date', 70, yPos + 25);
      doc.text('2. Please mention delivery timeline in days', 70, yPos + 40);
      doc.text('3. Include GST details in your quote', 70, yPos + 55);
      doc.text('4. Mention payment terms (Net 30, Net 45, etc.)', 70, yPos + 70);
      
      // Footer
      doc.fontSize(8).text('This is a system-generated document. For queries, contact purchase@suyashenterprises.com', 50, 750, { align: 'center' });
      
      doc.end();
      
      stream.on('finish', () => resolve(filepath));
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};

// ======================================================
// CREATE RFQ FROM PR
// POST /api/rfqs
// ======================================================
exports.createRFQ = async (req, res) => {
  try {
    const {
      pr_id,
      valid_till,
      vendor_ids,
      items
    } = req.body;

    // ========== VALIDATIONS ==========

    // 1. Validate PR exists and is approved
    const pr = await PurchaseRequisition.findById(pr_id);
    if (!pr) {
      return res.status(404).json({
        success: false,
        message: 'Purchase requisition not found',
        error: 'PR_NOT_FOUND'
      });
    }

    if (pr.status !== 'Approved') {
      return res.status(400).json({
        success: false,
        message: `Cannot create RFQ from PR with status: ${pr.status}. PR must be Approved`,
        error: 'INVALID_PR_STATUS'
      });
    }

    // 2. Validate vendors exist and are AVL approved
    if (!vendor_ids || vendor_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one vendor is required',
        error: 'VENDORS_REQUIRED'
      });
    }

    const vendors = await Vendor.find({
      _id: { $in: vendor_ids },
      avl_approved: true,
      is_active: true,
      blacklisted: false
    });

    if (vendors.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid AVL-approved vendors found',
        error: 'NO_VALID_VENDORS'
      });
    }

    // Check if all requested vendors are valid
    if (vendors.length !== vendor_ids.length) {
      const foundIds = vendors.map(v => v._id.toString());
      const missingIds = vendor_ids.filter(id => !foundIds.includes(id));
      return res.status(400).json({
        success: false,
        message: 'Some vendors are not AVL-approved or are inactive',
        error: 'INVALID_VENDORS',
        invalid_vendors: missingIds
      });
    }

    // 3. Validate items and per-item vendor availability
    let rfqItems = [];
    if (items && items.length > 0) {
      for (const item of items) {
        const itemDetails = await Item.findById(item.item_id);
        if (!itemDetails) {
          return res.status(400).json({
            success: false,
            message: `Item with ID ${item.item_id} not found`,
            error: 'ITEM_NOT_FOUND'
          });
        }
        
        // Check if at least 3 vendors supply this item
        const vendorsForItem = vendors.filter(v => 
          v.avl_items && v.avl_items.some(avlItem => avlItem.toString() === item.item_id)
        );
        
        if (vendorsForItem.length < 3) {
          return res.status(400).json({
            success: false,
            message: `Item ${itemDetails.part_no} requires minimum 3 vendors. Only ${vendorsForItem.length} AVL vendors found for this item`,
            error: 'INSUFFICIENT_VENDORS_FOR_ITEM',
            item_part_no: itemDetails.part_no,
            vendors_found: vendorsForItem.length,
            vendors_required: 3
          });
        }
        
        rfqItems.push({
          item_id: item.item_id,
          part_no: itemDetails.part_no,
          description: itemDetails.part_description,
          required_qty: item.required_qty,
          unit: itemDetails.unit,
          technical_specs: item.technical_specs || ''
        });
      }
    } else {
      // Use items from PR
      for (const prItem of pr.items) {
        const itemDetails = await Item.findById(prItem.item_id);
        if (itemDetails) {
          // Check if at least 3 vendors supply this item
          const vendorsForItem = vendors.filter(v => 
            v.avl_items && v.avl_items.some(avlItem => avlItem.toString() === prItem.item_id.toString())
          );
          
          if (vendorsForItem.length < 3) {
            return res.status(400).json({
              success: false,
              message: `Item ${itemDetails.part_no} requires minimum 3 vendors. Only ${vendorsForItem.length} AVL vendors found for this item`,
              error: 'INSUFFICIENT_VENDORS_FOR_ITEM',
              item_part_no: itemDetails.part_no,
              vendors_found: vendorsForItem.length,
              vendors_required: 3
            });
          }
          
          rfqItems.push({
            item_id: prItem.item_id,
            part_no: itemDetails.part_no,
            description: itemDetails.part_description,
            required_qty: prItem.required_qty,
            unit: itemDetails.unit,
            technical_specs: ''
          });
        }
      }
    }

    if (rfqItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid items to quote',
        error: 'NO_ITEMS'
      });
    }

    // 4. Validate valid_till is future date
    const validTillDate = new Date(valid_till);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (validTillDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Valid till date must be a future date',
        error: 'INVALID_VALID_TILL'
      });
    }

    // Minimum 7 days validity
    const minValidity = new Date();
    minValidity.setDate(minValidity.getDate() + 7);
    if (validTillDate < minValidity) {
      return res.status(400).json({
        success: false,
        message: 'Valid till date should be at least 7 days from now',
        error: 'VALIDITY_TOO_SHORT'
      });
    }

    // ========== CREATE RFQ ==========
    
    // Prepare vendors array
    const vendorsWithDate = vendors.map(vendor => ({
      vendor_id: vendor._id,
      vendor_name: vendor.vendor_name,
      sent_at: null,
      responded_at: null,
      response_items: [],
      overall_remarks: '',
      is_complete: false
    }));

    const rfq = new RFQ({
      rfq_date: new Date(),
      pr_id,
      valid_till: validTillDate,
      items: rfqItems,
      vendors: vendorsWithDate,
      status: 'Draft',
      created_by: req.user._id,
      updated_by: req.user._id
    });

    await rfq.save();

    res.status(201).json({
      success: true,
      message: 'RFQ created successfully',
      data: {
        _id: rfq._id,
        rfq_number: rfq.rfq_number,
        rfq_date: rfq.rfq_date,
        valid_till: rfq.valid_till,
        items_count: rfq.items.length,
        vendors_count: rfq.vendors.length,
        status: rfq.status
      }
    });

  } catch (error) {
    console.error('Create RFQ error:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate RFQ number generated',
        error: 'DUPLICATE_RFQ_NUMBER'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create RFQ',
      error: error.message
    });
  }
};

// ======================================================
// SEND RFQ TO VENDORS (with PDF generation)
// PUT /api/rfqs/:id/send
// ======================================================
exports.sendRFQ = async (req, res) => {
  try {
    const { id } = req.params;
    const { send_email = true, include_pdf = true } = req.body;

    const rfq = await RFQ.findById(id)
      .populate('items.item_id')
      .populate('vendors.vendor_id')
      .populate('pr_id');

    if (!rfq) {
      return res.status(404).json({
        success: false,
        message: 'RFQ not found',
        error: 'RFQ_NOT_FOUND'
      });
    }

    // Check if RFQ can be sent
    if (rfq.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: `Cannot send RFQ with status: ${rfq.status}. Only Draft RFQs can be sent`,
        error: 'INVALID_RFQ_STATUS'
      });
    }

    // Check if valid_till is still valid
    const validTill = new Date(rfq.valid_till);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (validTill < today) {
      return res.status(400).json({
        success: false,
        message: 'RFQ validity date has passed. Please update valid_till before sending',
        error: 'VALIDITY_EXPIRED'
      });
    }

    // Update sent_at for all vendors
    const now = new Date();
    rfq.vendors.forEach(vendor => {
      vendor.sent_at = now;
    });

    // Send emails if requested
    const emailResults = [];
    if (send_email) {
      for (const vendor of rfq.vendors) {
        try {
          const vendorEmail = vendor.vendor_id?.email;
          
          if (!vendorEmail) {
            emailResults.push({
              vendor_name: vendor.vendor_name,
              email: 'No email found',
              status: 'failed',
              error: 'Vendor has no email address'
            });
            continue;
          }
          
          // Generate PDF if requested
          let pdfPath = null;
          if (include_pdf) {
            try {
              pdfPath = await generateRFQPDF(rfq, vendor);
              console.log(`✅ PDF generated for ${vendor.vendor_name}`);
            } catch (pdfError) {
              console.error(`PDF generation failed for ${vendor.vendor_name}:`, pdfError);
              // Continue without PDF
            }
          }
          
          // Prepare RFQ email content
          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #003366; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
                .content { padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
                th { background: #003366; color: white; }
                .footer { margin-top: 20px; text-align: center; color: #666; font-size: 12px; }
                .warning { background: #fff3cd; border: 1px solid #ffeeba; color: #856404; padding: 15px; border-radius: 5px; margin: 15px 0; }
                .instructions { background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #003366; }
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
                      <tr><th>Part No</th><th>Description</th><th>Quantity</th><th>Unit</th></tr>
                    </thead>
                    <tbody>
                      ${rfq.items.map(item => `
                        <tr><td>${item.part_no}</td><td>${item.description || '-'}</td><td>${item.required_qty}</td><td>${item.unit}</td></tr>
                      `).join('')}
                    </tbody>
                  </table>
                  
                  <p><strong>Valid Till:</strong> ${new Date(rfq.valid_till).toLocaleDateString('en-IN')}</p>
                  <p><strong>RFQ Date:</strong> ${new Date(rfq.rfq_date).toLocaleDateString('en-IN')}</p>
                  
                  ${include_pdf && pdfPath ? `
                    <div class="instructions">
                      <strong>📎 ATTACHMENT:</strong> RFQ PDF is attached to this email.
                    </div>
                  ` : ''}
                  
                  <div class="instructions">
                    <strong>📧 HOW TO SUBMIT YOUR QUOTATION:</strong>
                    <p>Please reply to this email with your rates in the following format:</p>
                    <ul>
                      ${rfq.items.map(item => `<li>${item.part_no}: ₹_____ per ${item.unit}, Delivery: _____ days, Payment Terms: _____</li>`).join('')}
                    </ul>
                    <p>Or contact our purchase team at purchase@suyashenterprises.com</p>
                  </div>
                  
                  <div class="warning">
                    <strong>📋 Please Note:</strong>
                    <ul>
                      <li>Quotes must be submitted before ${new Date(rfq.valid_till).toLocaleDateString('en-IN')}</li>
                      <li>Please mention delivery timeline</li>
                      <li>Include GST details in your quote</li>
                      <li>Mention payment terms (e.g., Net 30, Net 45)</li>
                    </ul>
                  </div>
                  
                  <p>Thank you for your prompt response.</p>
                  
                  <p>Best regards,<br>
                  <strong>Purchase Team</strong><br>
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

          // Prepare attachments
          const attachments = [];
          if (pdfPath) {
            attachments.push({
              filename: `RFQ_${rfq.rfq_number}.pdf`,
              path: pdfPath
            });
          }

          // Send email
          await emailService.sendEmail({
            to: vendorEmail,
            subject: `${rfq.rfq_number} - Request for Quotation - Suyash Enterprises`,
            html: emailHtml,
            attachments
          });
          
          emailResults.push({
            vendor_name: vendor.vendor_name,
            email: vendorEmail,
            status: 'sent',
            sent_at: now,
            pdf_generated: !!pdfPath
          });
          
          console.log(`✅ RFQ email sent to ${vendor.vendor_name} (${vendorEmail})`);
          
        } catch (emailError) {
          console.error(`❌ Failed to send email to ${vendor.vendor_name}:`, emailError.message);
          emailResults.push({
            vendor_name: vendor.vendor_name,
            email: vendor.vendor_id?.email || 'No email',
            status: 'failed',
            error: emailError.message
          });
        }
      }
    }

    // Update RFQ status
    rfq.status = 'Sent';
    rfq.updated_by = req.user._id;
    await rfq.save();

    res.status(200).json({
      success: true,
      message: 'RFQ sent successfully',
      data: {
        rfq_number: rfq.rfq_number,
        status: rfq.status,
        sent_at: now,
        email_results: emailResults,
        vendors_count: rfq.vendors.length,
        emails_sent: emailResults.filter(r => r.status === 'sent').length,
        emails_failed: emailResults.filter(r => r.status === 'failed').length
      }
    });

  } catch (error) {
    console.error('Send RFQ error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send RFQ',
      error: error.message
    });
  }
};

// ======================================================
// SUBMIT VENDOR QUOTATION
// POST /api/rfqs/:id/submit-quote
// ======================================================
exports.submitVendorQuote = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendor_id, response_items, overall_remarks } = req.body;

    const rfq = await RFQ.findById(id);
    if (!rfq) {
      return res.status(404).json({
        success: false,
        message: 'RFQ not found',
        error: 'RFQ_NOT_FOUND'
      });
    }

    // Check if RFQ is still open
    if (rfq.status === 'Closed') {
      return res.status(400).json({
        success: false,
        message: 'RFQ is already closed',
        error: 'RFQ_CLOSED'
      });
    }

    // Check if valid_till has passed
    const validTill = new Date(rfq.valid_till);
    const now = new Date();
    if (now > validTill) {
      return res.status(400).json({
        success: false,
        message: 'RFQ validity period has expired',
        error: 'RFQ_EXPIRED'
      });
    }

    // Find vendor in RFQ
    const vendorIndex = rfq.vendors.findIndex(
      v => v.vendor_id.toString() === vendor_id
    );

    if (vendorIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found in this RFQ',
        error: 'VENDOR_NOT_IN_RFQ'
      });
    }

    // Check if vendor already responded
    if (rfq.vendors[vendorIndex].responded_at) {
      return res.status(400).json({
        success: false,
        message: 'Vendor has already submitted a quotation',
        error: 'ALREADY_RESPONDED'
      });
    }

    // Validate response items
    if (!response_items || response_items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one item quote is required',
        error: 'ITEMS_REQUIRED'
      });
    }

    // Validate all items are from RFQ
    const validItemIds = rfq.items.map(item => item.item_id.toString());
    const validatedResponseItems = [];

    for (const responseItem of response_items) {
      if (!validItemIds.includes(responseItem.item_id)) {
        return res.status(400).json({
          success: false,
          message: `Item ${responseItem.item_id} is not part of this RFQ`,
          error: 'INVALID_ITEM'
        });
      }

      if (!responseItem.quoted_rate || responseItem.quoted_rate < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid quoted rate for item`,
          error: 'INVALID_QUOTED_RATE'
        });
      }

      if (responseItem.delivery_days === undefined || responseItem.delivery_days < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid delivery days for item`,
          error: 'INVALID_DELIVERY_DAYS'
        });
      }

      validatedResponseItems.push({
        item_id: responseItem.item_id,
        quoted_rate: responseItem.quoted_rate,
        delivery_days: responseItem.delivery_days,
        moq: responseItem.moq || 0,
        payment_terms: responseItem.payment_terms || '',
        remarks: responseItem.remarks || ''
      });
    }

    // Check if all items are quoted
    const quotedItemIds = validatedResponseItems.map(i => i.item_id);
    const missingItems = validItemIds.filter(id => !quotedItemIds.includes(id));
    const isComplete = missingItems.length === 0;

    // Update vendor response
    rfq.vendors[vendorIndex].response_items = validatedResponseItems;
    rfq.vendors[vendorIndex].responded_at = new Date();
    rfq.vendors[vendorIndex].overall_remarks = overall_remarks || '';
    rfq.vendors[vendorIndex].is_complete = isComplete;

    // Update RFQ status
    const allResponded = rfq.vendors.every(v => v.responded_at !== null);
    const anyResponded = rfq.vendors.some(v => v.responded_at !== null);
    
    if (allResponded) {
      rfq.status = 'Fully Responded';
      // Build comparison matrix immediately when all responded
      rfq.buildComparisonMatrix();
    } else if (anyResponded) {
      rfq.status = 'Partially Responded';
    }

    rfq.updated_by = req.user._id;
    await rfq.save();

    res.status(200).json({
      success: true,
      message: 'Quotation submitted successfully',
      data: {
        rfq_number: rfq.rfq_number,
        vendor_name: rfq.vendors[vendorIndex].vendor_name,
        is_complete: isComplete,
        missing_items_count: missingItems.length,
        status: rfq.status
      }
    });

  } catch (error) {
    console.error('Submit vendor quote error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit quotation',
      error: error.message
    });
  }
};

// ======================================================
// GET RFQ WITH COMPARISON MATRIX
// GET /api/rfqs/:id/comparison
// ======================================================
exports.getRFQComparison = async (req, res) => {
  try {
    const { id } = req.params;

    const rfq = await RFQ.findById(id)
      .populate('items.item_id')
      .populate('vendors.vendor_id')
      .populate('pr_id');

    if (!rfq) {
      return res.status(404).json({
        success: false,
        message: 'RFQ not found',
        error: 'RFQ_NOT_FOUND'
      });
    }

    // Build comparison matrix if not already built and status is not Draft
    if (Object.keys(rfq.comparison_matrix).length === 0 && rfq.status !== 'Draft') {
      rfq.buildComparisonMatrix();
      await rfq.save();
    }

    // Calculate item-wise comparison with L1/L2/L3 highlighting
    const itemWiseComparison = [];
    let totalLowestValue = 0;
    let totalHighestValue = 0;

    for (const item of rfq.items) {
      const itemId = item.item_id._id.toString();
      const quotes = [];

      for (const vendor of rfq.vendors) {
        if (vendor.responded_at) {
          const responseItem = vendor.response_items.find(
            ri => ri.item_id.toString() === itemId
          );
          
          if (responseItem) {
            const totalValue = responseItem.quoted_rate * item.required_qty;
            quotes.push({
              vendor_id: vendor.vendor_id._id,
              vendor_name: vendor.vendor_name,
              quoted_rate: responseItem.quoted_rate,
              total_value: totalValue,
              delivery_days: responseItem.delivery_days,
              payment_terms: responseItem.payment_terms,
              moq: responseItem.moq,
              rating: vendor.vendor_id.overall_rating || 0,
              rank: null // Will be set after sorting
            });
          }
        }
      }

      // Sort by price and assign L1/L2/L3 ranks
      quotes.sort((a, b) => a.quoted_rate - b.quoted_rate);
      quotes.forEach((quote, idx) => {
        quote.rank = idx === 0 ? 'L1' : idx === 1 ? 'L2' : idx === 2 ? 'L3' : `L${idx + 1}`;
      });

      // Update totals
      if (quotes.length > 0) {
        totalLowestValue += quotes[0]?.total_value || 0;
        totalHighestValue += quotes[quotes.length - 1]?.total_value || 0;
      }

      itemWiseComparison.push({
        item_id: item.item_id._id,
        part_no: item.part_no,
        description: item.description,
        required_qty: item.required_qty,
        unit: item.unit,
        best_price: quotes[0]?.quoted_rate || null,
        best_vendor: quotes[0]?.vendor_name || null,
        best_vendor_rank: quotes[0]?.rank || null,
        quotes: quotes
      });
    }

    // Vendor-wise summary with rank
    const vendorWiseSummary = {};
    for (const vendor of rfq.vendors) {
      if (vendor.responded_at) {
        let totalValue = 0;
        let itemsQuoted = 0;
        
        for (const item of rfq.items) {
          const responseItem = vendor.response_items.find(
            ri => ri.item_id.toString() === item.item_id._id.toString()
          );
          if (responseItem) {
            totalValue += responseItem.quoted_rate * item.required_qty;
            itemsQuoted++;
          }
        }

        vendorWiseSummary[vendor.vendor_name] = {
          vendor_id: vendor.vendor_id._id,
          total_value: totalValue,
          items_quoted: itemsQuoted,
          total_items: rfq.items.length,
          responded_at: vendor.responded_at,
          rating: vendor.vendor_id.overall_rating || 0
        };
      }
    }

    // Find best overall vendor (lowest total value with all items quoted)
    let bestVendor = null;
    let bestValue = Infinity;
    for (const [name, data] of Object.entries(vendorWiseSummary)) {
      if (data.items_quoted === rfq.items.length && data.total_value < bestValue) {
        bestValue = data.total_value;
        bestVendor = name;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        rfq_number: rfq.rfq_number,
        rfq_date: rfq.rfq_date,
        valid_till: rfq.valid_till,
        status: rfq.status,
        summary: {
          total_items: rfq.items.length,
          vendors_invited: rfq.vendors.length,
          vendors_responded: rfq.vendors.filter(v => v.responded_at).length,
          lowest_total_value: totalLowestValue,
          highest_total_value: totalHighestValue,
          potential_savings: totalHighestValue - totalLowestValue,
          best_overall_vendor: bestVendor
        },
        item_wise_comparison: itemWiseComparison,
        vendor_wise_summary: vendorWiseSummary
      }
    });

  } catch (error) {
    console.error('Get RFQ comparison error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get RFQ comparison',
      error: error.message
    });
  }
};

// ======================================================
// SELECT WINNING VENDOR
// PUT /api/rfqs/:id/select-vendor
// ======================================================
exports.selectVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendor_id, recommendation_notes } = req.body;

    const rfq = await RFQ.findById(id)
      .populate('vendors.vendor_id');

    if (!rfq) {
      return res.status(404).json({
        success: false,
        message: 'RFQ not found',
        error: 'RFQ_NOT_FOUND'
      });
    }

    // Check if RFQ has responses
    const hasResponses = rfq.vendors.some(v => v.responded_at);
    if (!hasResponses) {
      return res.status(400).json({
        success: false,
        message: 'No vendor responses yet',
        error: 'NO_RESPONSES'
      });
    }

    // Verify vendor exists and has responded
    const selectedVendor = rfq.vendors.find(
      v => v.vendor_id._id.toString() === vendor_id
    );

    if (!selectedVendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found in this RFQ',
        error: 'VENDOR_NOT_FOUND'
      });
    }

    if (!selectedVendor.responded_at) {
      return res.status(400).json({
        success: false,
        message: 'Selected vendor has not responded to RFQ',
        error: 'VENDOR_NOT_RESPONDED'
      });
    }

    // Verify all items are quoted
    const allItemsQuoted = selectedVendor.response_items.length === rfq.items.length;
    if (!allItemsQuoted) {
      return res.status(400).json({
        success: false,
        message: 'Selected vendor has not quoted for all items',
        error: 'INCOMPLETE_QUOTE'
      });
    }

    // Update RFQ
    rfq.recommended_vendor = vendor_id;
    rfq.recommendation_notes = recommendation_notes || '';
    rfq.recommended_by = req.user._id;
    rfq.recommended_at = new Date();
    rfq.status = 'Compared';

    await rfq.save();

    res.status(200).json({
      success: true,
      message: 'Vendor selected successfully',
      data: {
        rfq_number: rfq.rfq_number,
        selected_vendor: selectedVendor.vendor_name,
        recommendation_notes: rfq.recommendation_notes,
        status: rfq.status,
        next_step: 'You can now create Purchase Order from this RFQ'
      }
    });

  } catch (error) {
    console.error('Select vendor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to select vendor',
      error: error.message
    });
  }
};

// ======================================================
// AUTO-COMPUTE ON VALID_TILL EXPIRY (Cron Job)
// POST /api/rfqs/auto-compute-expired
// ======================================================
exports.autoComputeExpiredRFQs = async (req, res) => {
  try {
    const expiredRFQs = await RFQ.find({
      valid_till: { $lt: new Date() },
      status: { $in: ['Sent', 'Partially Responded'] }
    });

    const results = [];
    for (const rfq of expiredRFQs) {
      // Build comparison matrix
      rfq.buildComparisonMatrix();
      
      // Update status
      if (rfq.vendors.some(v => v.responded_at)) {
        rfq.status = 'Fully Responded';
      } else {
        rfq.status = 'Closed';
      }
      
      await rfq.save();
      
      results.push({
        rfq_number: rfq.rfq_number,
        old_status: rfq.status === 'Fully Responded' ? 'Partially Responded' : 'Sent',
        new_status: rfq.status,
        responded_vendors: rfq.vendors.filter(v => v.responded_at).length
      });
    }

    res.status(200).json({
      success: true,
      message: `${results.length} expired RFQs processed`,
      data: results
    });

  } catch (error) {
    console.error('Auto-compute expired RFQs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process expired RFQs',
      error: error.message
    });
  }
};

// ======================================================
// GET ALL RFQs (with filters)
// GET /api/rfqs
// ======================================================
exports.getAllRFQs = async (req, res) => {
  try {
    const {
      status,
      from_date,
      to_date,
      vendor_id,
      pr_id,
      page = 1,
      limit = 20,
      sort_by = 'createdAt',
      sort_order = 'desc'
    } = req.query;

    let filter = {};

    if (status) filter.status = status;
    if (pr_id) filter.pr_id = pr_id;

    if (from_date || to_date) {
      filter.rfq_date = {};
      if (from_date) filter.rfq_date.$gte = new Date(from_date);
      if (to_date) filter.rfq_date.$lte = new Date(to_date);
    }

    if (vendor_id) {
      filter['vendors.vendor_id'] = vendor_id;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sort_by] = sort_order === 'asc' ? 1 : -1;

    const rfqs = await RFQ.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('pr_id', 'pr_number')
      .populate('vendors.vendor_id', 'vendor_name vendor_code')
      .populate('recommended_vendor', 'vendor_name')
      .populate('created_by', 'Username Email');

    const total = await RFQ.countDocuments(filter);

    const enrichedRFQs = rfqs.map(rfq => {
      const respondedCount = rfq.vendors.filter(v => v.responded_at).length;
      return {
        ...rfq.toObject(),
        response_stats: {
          total_vendors: rfq.vendors.length,
          responded_vendors: respondedCount,
          response_rate: rfq.vendors.length > 0 
            ? Math.round((respondedCount / rfq.vendors.length) * 100) 
            : 0
        }
      };
    });

    res.status(200).json({
      success: true,
      data: enrichedRFQs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get all RFQs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch RFQs',
      error: error.message
    });
  }
};

// ======================================================
// GET RFQ BY ID
// GET /api/rfqs/:id
// ======================================================
exports.getRFQById = async (req, res) => {
  try {
    const { id } = req.params;

    const rfq = await RFQ.findById(id)
      .populate('pr_id')
      .populate('items.item_id')
      .populate('vendors.vendor_id')
      .populate('recommended_vendor')
      .populate('recommended_by', 'Username Email')
      .populate('created_by', 'Username Email')
      .populate('updated_by', 'Username Email');

    if (!rfq) {
      return res.status(404).json({
        success: false,
        message: 'RFQ not found',
        error: 'RFQ_NOT_FOUND'
      });
    }

    const respondedVendors = rfq.vendors.filter(v => v.responded_at);
    const responseStats = {
      total: rfq.vendors.length,
      responded: respondedVendors.length,
      pending: rfq.vendors.length - respondedVendors.length,
      response_rate: rfq.vendors.length > 0 
        ? Math.round((respondedVendors.length / rfq.vendors.length) * 100) 
        : 0
    };

    res.status(200).json({
      success: true,
      data: {
        ...rfq.toObject(),
        response_stats: responseStats
      }
    });

  } catch (error) {
    console.error('Get RFQ by id error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch RFQ',
      error: error.message
    });
  }
};

// ======================================================
// REMIND VENDORS (Send follow-up)
// POST /api/rfqs/:id/remind
// ======================================================
exports.remindVendors = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendor_ids = [] } = req.body;

    const rfq = await RFQ.findById(id)
      .populate('vendors.vendor_id')
      .populate('items.item_id');

    if (!rfq) {
      return res.status(404).json({
        success: false,
        message: 'RFQ not found',
        error: 'RFQ_NOT_FOUND'
      });
    }

    if (rfq.status === 'Closed') {
      return res.status(400).json({
        success: false,
        message: 'RFQ is closed, cannot send reminders',
        error: 'RFQ_CLOSED'
      });
    }

    let vendorsToRemind = rfq.vendors.filter(v => !v.responded_at);
    
    if (vendor_ids.length > 0) {
      vendorsToRemind = vendorsToRemind.filter(v => 
        vendor_ids.includes(v.vendor_id._id.toString())
      );
    }

    if (vendorsToRemind.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pending vendors to remind',
        error: 'NO_PENDING_VENDORS'
      });
    }

    const reminderResults = [];
    for (const vendor of vendorsToRemind) {
      try {
        const reminderHtml = `
          <div style="font-family: Arial, sans-serif;">
            <h2>Reminder: RFQ ${rfq.rfq_number}</h2>
            <p>Dear ${vendor.vendor_name},</p>
            <p>This is a reminder that we are still awaiting your quotation for RFQ ${rfq.rfq_number}.</p>
            <p><strong>Valid Till:</strong> ${new Date(rfq.valid_till).toLocaleDateString('en-IN')}</p>
            <p>Please submit your quotation at the earliest.</p>
            <p>Thank you,<br>Purchase Team</p>
          </div>
        `;
        
        await emailService.sendEmail({
          to: vendor.vendor_id.email,
          subject: `Reminder: ${rfq.rfq_number} - Quotation Request`,
          html: reminderHtml
        });
        
        reminderResults.push({
          vendor_name: vendor.vendor_name,
          email: vendor.vendor_id.email,
          status: 'reminder_sent'
        });
      } catch (emailError) {
        reminderResults.push({
          vendor_name: vendor.vendor_name,
          email: vendor.vendor_id.email,
          status: 'failed',
          error: emailError.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Reminders sent successfully',
      data: {
        reminders_sent: reminderResults.length,
        reminder_results: reminderResults
      }
    });

  } catch (error) {
    console.error('Remind vendors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send reminders',
      error: error.message
    });
  }
};

// ======================================================
// CLOSE RFQ
// PUT /api/rfqs/:id/close
// ======================================================
exports.closeRFQ = async (req, res) => {
  try {
    const { id } = req.params;

    const rfq = await RFQ.findById(id);
    if (!rfq) {
      return res.status(404).json({
        success: false,
        message: 'RFQ not found',
        error: 'RFQ_NOT_FOUND'
      });
    }

    if (rfq.status === 'Closed') {
      return res.status(400).json({
        success: false,
        message: 'RFQ is already closed',
        error: 'ALREADY_CLOSED'
      });
    }

    rfq.status = 'Closed';
    rfq.updated_by = req.user._id;
    await rfq.save();

    res.status(200).json({
      success: true,
      message: 'RFQ closed successfully',
      data: {
        rfq_number: rfq.rfq_number,
        status: rfq.status
      }
    });

  } catch (error) {
    console.error('Close RFQ error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close RFQ',
      error: error.message
    });
  }
};

