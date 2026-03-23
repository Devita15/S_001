// controllers/Procurement/purchaseOrderController.js
const PurchaseOrder = require('../../models/Procurement/PurchaseOrder');
const PurchaseRequisition = require('../../models/Procurement/PurchaseRequisition');
const RFQ = require('../../models/Procurement/RFQ');
const Vendor = require('../../models/CRM/Vendor');
const Company = require('../../models/user\'s & setting\'s/Company');
const Item = require('../../models/CRM/Item');
const emailService = require('../../services/emailService');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Helper function to generate PO PDF
const generatePOPDF = async (po, vendor, company) => {
  return new Promise((resolve, reject) => {
    try {
      const pdfDir = path.join(__dirname, '../../uploads/po-pdfs');
      if (!fs.existsSync(pdfDir)) {
        fs.mkdirSync(pdfDir, { recursive: true });
      }

      const filename = `PO_${po.po_number}_${vendor.vendor_name.replace(/\s/g, '_')}.pdf`;
      const filepath = path.join(pdfDir, filename);

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('PURCHASE ORDER', { align: 'center' });
      doc.moveDown();
      doc.fontSize(16).text(po.po_number, { align: 'center' });
      doc.moveDown();

      // Company Details
      doc.fontSize(10).font('Helvetica');
      doc.text(company.company_name, { align: 'right' });
      doc.text(company.address, { align: 'right' });
      doc.text(`GSTIN: ${company.gstin}`, { align: 'right' });
      doc.text(`State: ${company.state} (Code: ${company.state_code})`, { align: 'right' });
      doc.moveDown();

      // Vendor Details
      doc.fontSize(12).font('Helvetica-Bold').text('To:');
      doc.fontSize(10).font('Helvetica');
      doc.text(vendor.vendor_name);
      doc.text(vendor.address);
      doc.text(`GSTIN: ${vendor.gstin}`);
      doc.text(`State: ${vendor.state} (Code: ${vendor.state_code})`);
      doc.moveDown();

      // PO Details Box
      doc.rect(50, doc.y, 495, 80).stroke();
      doc.fontSize(10).font('Helvetica');
      doc.text(`PO Date: ${new Date(po.po_date).toLocaleDateString('en-IN')}`, 60, doc.y + 10);
      doc.text(`Delivery Date: ${new Date(po.delivery_date).toLocaleDateString('en-IN')}`, 60, doc.y + 25);
      doc.text(`Payment Terms: ${po.payment_terms || vendor.payment_terms || 'Net 30'}`, 60, doc.y + 40);
      doc.text(`GST Type: ${po.gst_type}`, 60, doc.y + 55);
      doc.moveDown(2);

      // Items Table Header
      const tableTop = doc.y;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Sl No', 50, tableTop);
      doc.text('Part No', 100, tableTop);
      doc.text('Description', 180, tableTop);
      doc.text('Qty', 320, tableTop);
      doc.text('Unit', 360, tableTop);
      doc.text('Unit Price', 410, tableTop);
      doc.text('Total', 480, tableTop);
      
      doc.moveDown();
      doc.strokeColor('#000').lineWidth(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      
      // Items Table Rows
      let yPos = doc.y + 5;
      doc.fontSize(9).font('Helvetica');
      
      po.items.forEach((item, index) => {
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }
        
        doc.text((index + 1).toString(), 50, yPos);
        doc.text(item.part_no, 100, yPos);
        doc.text(item.description?.substring(0, 40) || '-', 180, yPos);
        doc.text(item.ordered_qty.toString(), 320, yPos);
        doc.text(item.unit, 360, yPos);
        doc.text(`₹${item.unit_price.toFixed(2)}`, 410, yPos);
        doc.text(`₹${item.total_amount.toFixed(2)}`, 480, yPos);
        
        yPos += 20;
      });
      
      doc.moveDown(2);
      
      // Totals
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`Subtotal: ₹${po.subtotal.toFixed(2)}`, 400, yPos + 10);
      doc.text(`GST (${po.gst_type === 'CGST/SGST' ? 'CGST+SGST' : 'IGST'}): ₹${po.gst_total.toFixed(2)}`, 400, yPos + 25);
      doc.text(`Grand Total: ₹${po.grand_total.toFixed(2)}`, 400, yPos + 40);
      
      // Terms & Conditions
      doc.fontSize(10).font('Helvetica-Bold').text('Terms & Conditions:', 50, yPos + 70);
      doc.fontSize(8).font('Helvetica');
      doc.text('1. Goods must be delivered by the delivery date mentioned above', 70, yPos + 85);
      doc.text('2. Please acknowledge receipt of this Purchase Order within 24 hours', 70, yPos + 100);
      doc.text('3. Invoice must reference this PO number', 70, yPos + 115);
      doc.text('4. Payment terms are as agreed', 70, yPos + 130);
      
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
// CREATE PO FROM RFQ
// POST /api/purchase-orders
// ======================================================
exports.createPurchaseOrder = async (req, res) => {
  try {
    const {
      rfq_id,
      delivery_date,
      delivery_address,
      payment_terms,
      internal_remarks
    } = req.body;

    // 1. Validate RFQ exists and has selected vendor
    const rfq = await RFQ.findById(rfq_id)
      .populate('pr_id')
      .populate('recommended_vendor')
      .populate('items.item_id');

    if (!rfq) {
      return res.status(404).json({
        success: false,
        message: 'RFQ not found',
        error: 'RFQ_NOT_FOUND'
      });
    }

    if (rfq.status !== 'Compared') {
      return res.status(400).json({
        success: false,
        message: `Cannot create PO from RFQ with status: ${rfq.status}. RFQ must be Compared`,
        error: 'INVALID_RFQ_STATUS'
      });
    }

    if (!rfq.recommended_vendor) {
      return res.status(400).json({
        success: false,
        message: 'No vendor selected in RFQ',
        error: 'NO_VENDOR_SELECTED'
      });
    }

    // 2. Get vendor details
    const vendor = await Vendor.findById(rfq.recommended_vendor._id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
        error: 'VENDOR_NOT_FOUND'
      });
    }

    // 3. Get company details
    const company = await Company.findOne({ is_active: true });
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'No active company found',
        error: 'COMPANY_NOT_FOUND'
      });
    }

    // 4. Get the selected vendor's response items
    const selectedVendorResponse = rfq.vendors.find(
      v => v.vendor_id.toString() === rfq.recommended_vendor._id.toString()
    );

    if (!selectedVendorResponse || !selectedVendorResponse.responded_at) {
      return res.status(400).json({
        success: false,
        message: 'Selected vendor has not submitted quote',
        error: 'VENDOR_NO_QUOTE'
      });
    }

    // 5. Build PO items from RFQ items and vendor response
    const poItems = [];
    for (const rfqItem of rfq.items) {
      const vendorResponse = selectedVendorResponse.response_items.find(
        ri => ri.item_id.toString() === rfqItem.item_id._id.toString()
      );

      if (!vendorResponse) {
        return res.status(400).json({
          success: false,
          message: `Vendor did not quote for item: ${rfqItem.part_no}`,
          error: 'ITEM_NOT_QUOTED'
        });
      }

      const itemDetails = await Item.findById(rfqItem.item_id._id);
      
      poItems.push({
        item_id: rfqItem.item_id._id,
        part_no: rfqItem.part_no,
        description: rfqItem.description,
        hsn_code: itemDetails.hsn_code,
        ordered_qty: rfqItem.required_qty,
        received_qty: 0,
        pending_qty: rfqItem.required_qty,
        unit: rfqItem.unit,
        unit_price: vendorResponse.quoted_rate,
        discount_percent: 0,
        gst_percent: itemDetails.hsn_code ? 18 : 18, // Default GST, can be fetched from Tax master
        required_date: new Date(delivery_date),
        item_status: 'Pending'
      });
    }

    // 6. Determine delivery address
    const finalDeliveryAddress = delivery_address || {
      line1: company.address,
      city: company.city || '',
      state: company.state,
      state_code: company.state_code,
      pincode: company.pincode || '',
      country: 'India'
    };

    // 7. Create PO
    const po = new PurchaseOrder({
      po_date: new Date(),
      po_type: 'Regular',
      pr_id: rfq.pr_id._id,
      rfq_id: rfq._id,
      vendor_id: vendor._id,
      vendor_name: vendor.vendor_name,
      vendor_gstin: vendor.gstin,
      vendor_state: vendor.state,
      vendor_state_code: vendor.state_code,
      company_id: company._id,
      company_name: company.company_name,
      company_gstin: company.gstin,
      company_state_code: company.state_code,
      delivery_address: finalDeliveryAddress,
      delivery_date: new Date(delivery_date),
      items: poItems,
      payment_terms: payment_terms || vendor.payment_terms || 'Net 30',
      internal_remarks: internal_remarks || '',
      status: 'Draft',
      created_by: req.user._id,
      updated_by: req.user._id
    });

    await po.save();

    res.status(201).json({
      success: true,
      message: 'Purchase Order created successfully',
      data: {
        _id: po._id,
        po_number: po.po_number,
        po_date: po.po_date,
        vendor_name: po.vendor_name,
        grand_total: po.grand_total,
        status: po.status,
        next_step: 'PO requires approval before sending to vendor'
      }
    });

  } catch (error) {
    console.error('Create PO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create purchase order',
      error: error.message
    });
  }
};

// controllers/Procurement/purchaseOrderController.js

exports.approvePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { approval_notes } = req.body;

    // DEBUG: Log user info
    console.log('=== APPROVAL DEBUG ===');
    console.log('User object:', JSON.stringify(req.user, null, 2));
    console.log('User RoleName:', req.user.RoleName);
    console.log('User RoleID:', req.user.RoleID);

    const po = await PurchaseOrder.findById(id)
      .populate('vendor_id');

    if (!po) {
      return res.status(404).json({
        success: false,
        message: 'Purchase Order not found',
        error: 'PO_NOT_FOUND'
      });
    }

    if (po.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve PO with status: ${po.status}. Only Draft POs can be approved`,
        error: 'INVALID_PO_STATUS'
      });
    }

    // Value-based approval threshold
    const amount = po.grand_total;
    const userRole = req.user.RoleName;  // ← USE THIS! NOT req.user.role
    
    console.log('Amount:', amount);
    console.log('User Role:', userRole);

    let canApprove = false;
    let approvalLevel = '';

    // APPROVAL MATRIX - Including SuperAdmin and Admin
    if (amount <= 50000) {
      canApprove = ['Manager', 'Admin', 'SuperAdmin', 'CEO'].includes(userRole);
      approvalLevel = 'Manager';
    } else if (amount <= 200000) {
      canApprove = ['Director', 'Manager', 'Admin', 'SuperAdmin', 'CEO'].includes(userRole);
      approvalLevel = 'Director/Manager';
    } else {
      canApprove = ['MD', 'Admin', 'SuperAdmin', 'CEO'].includes(userRole);
      approvalLevel = 'MD/Admin';
    }

    console.log('Can approve:', canApprove);

    if (!canApprove) {
      return res.status(403).json({
        success: false,
        message: `Insufficient权限. PO amount ₹${amount.toFixed(2)} requires ${approvalLevel} approval`,
        error: 'INSUFFICIENT_APPROVAL_LEVEL',
        required_level: approvalLevel,
        po_amount: amount,
        user_role: userRole  // ← Shows what role you actually have
      });
    }

    // Update PO status
    po.status = 'Approved';
    po.approved_by = req.user._id;
    po.approved_at = new Date();
    po.internal_remarks = approval_notes || po.internal_remarks;
    po.updated_by = req.user._id;

    await po.save();

    res.status(200).json({
      success: true,
      message: `Purchase Order approved by ${approvalLevel}`,
      data: {
        po_number: po.po_number,
        status: po.status,
        approved_by: req.user.Username,
        approved_at: po.approved_at,
        approval_level: approvalLevel
      }
    });

  } catch (error) {
    console.error('Approve PO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve purchase order',
      error: error.message
    });
  }
};

// ======================================================
// SEND PO TO VENDOR (with PDF)
// PUT /api/purchase-orders/:id/send
// ======================================================
exports.sendPurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { send_email = true } = req.body;

    const po = await PurchaseOrder.findById(id)
      .populate('vendor_id')
      .populate('company_id')
      .populate('items.item_id');

    if (!po) {
      return res.status(404).json({
        success: false,
        message: 'Purchase Order not found',
        error: 'PO_NOT_FOUND'
      });
    }

    if (po.status !== 'Approved') {
      return res.status(400).json({
        success: false,
        message: `Cannot send PO with status: ${po.status}. PO must be Approved`,
        error: 'INVALID_PO_STATUS'
      });
    }

    const vendor = po.vendor_id;
    const company = po.company_id;

    // Generate PDF
    let pdfPath = null;
    try {
      pdfPath = await generatePOPDF(po, vendor, company);
      console.log(`✅ PDF generated for PO ${po.po_number}`);
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError);
    }

    // Send email
    let emailStatus = 'not_sent';
    if (send_email && vendor.email) {
      try {
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #003366; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #f9f9f9; }
              .button { background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
              table { width: 100%; border-collapse: collapse; margin: 15px 0; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background: #003366; color: white; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>PURCHASE ORDER</h2>
                <h3>${po.po_number}</h3>
              </div>
              <div class="content">
                <p>Dear ${vendor.vendor_name},</p>
                <p>Please find attached Purchase Order ${po.po_number} for your reference.</p>
                
                <p><strong>Order Summary:</strong></p>
                <table>
                  <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
                  <tbody>
                    ${po.items.map(item => `
                      <tr>
                        <td>${item.part_no} - ${item.description}</td>
                        <td>${item.ordered_qty} ${item.unit}</td>
                        <td>₹${item.unit_price.toFixed(2)}</td>
                        <td>₹${item.total_amount.toFixed(2)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
                
                <p><strong>Total Amount: ₹${po.grand_total.toFixed(2)}</strong></p>
                <p><strong>Delivery Date:</strong> ${new Date(po.delivery_date).toLocaleDateString('en-IN')}</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${process.env.FRONTEND_URL}/po/${po._id}/acknowledge" class="button">
                    ✅ ACKNOWLEDGE RECEIPT
                  </a>
                </div>
                
                <p>Please acknowledge receipt of this Purchase Order within 24 hours.</p>
                <p>Thank you for your business!</p>
                <p>Best regards,<br>Purchase Team<br>Suyash Enterprises</p>
              </div>
            </div>
          </body>
          </html>
        `;

        const attachments = pdfPath ? [{
          filename: `PO_${po.po_number}.pdf`,
          path: pdfPath
        }] : [];

        await emailService.sendEmail({
          to: vendor.email,
          subject: `Purchase Order ${po.po_number} - Suyash Enterprises`,
          html: emailHtml,
          attachments
        });

        emailStatus = 'sent';
        console.log(`✅ PO email sent to ${vendor.email}`);
      } catch (emailError) {
        console.error('Email error:', emailError);
        emailStatus = 'failed';
      }
    }

    // Update PO status
    po.status = 'Sent';
    po.updated_by = req.user._id;
    await po.save();

    res.status(200).json({
      success: true,
      message: 'Purchase Order sent successfully',
      data: {
        po_number: po.po_number,
        status: po.status,
        email_status: emailStatus,
        pdf_generated: !!pdfPath
      }
    });

  } catch (error) {
    console.error('Send PO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send purchase order',
      error: error.message
    });
  }
};

// ======================================================
// VENDOR ACKNOWLEDGE PO
// PUT /api/purchase-orders/:id/acknowledge
// ======================================================
exports.acknowledgePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const po = await PurchaseOrder.findById(id)
      .populate('vendor_id');

    if (!po) {
      return res.status(404).json({
        success: false,
        message: 'Purchase Order not found',
        error: 'PO_NOT_FOUND'
      });
    }

    if (po.status !== 'Sent') {
      return res.status(400).json({
        success: false,
        message: `Cannot acknowledge PO with status: ${po.status}. PO must be Sent`,
        error: 'INVALID_PO_STATUS'
      });
    }

    if (po.vendor_acknowledgement) {
      return res.status(400).json({
        success: false,
        message: 'PO already acknowledged',
        error: 'ALREADY_ACKNOWLEDGED'
      });
    }

    po.vendor_acknowledgement = true;
    po.ack_date = new Date();
    po.status = 'Acknowledged';
    po.updated_by = req.user._id;

    await po.save();

    res.status(200).json({
      success: true,
      message: 'Purchase Order acknowledged successfully',
      data: {
        po_number: po.po_number,
        status: po.status,
        ack_date: po.ack_date
      }
    });

  } catch (error) {
    console.error('Acknowledge PO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to acknowledge purchase order',
      error: error.message
    });
  }
};

// ======================================================
// REMIND UNACKNOWLEDGED PO (Manual)
// POST /api/purchase-orders/:id/remind
// ======================================================
exports.remindUnacknowledgedPO = async (req, res) => {
  try {
    const { id } = req.params;

    const po = await PurchaseOrder.findById(id)
      .populate('vendor_id');

    if (!po) {
      return res.status(404).json({
        success: false,
        message: 'Purchase Order not found',
        error: 'PO_NOT_FOUND'
      });
    }

    if (po.vendor_acknowledgement) {
      return res.status(400).json({
        success: false,
        message: 'PO already acknowledged',
        error: 'ALREADY_ACKNOWLEDGED'
      });
    }

    if (po.status !== 'Sent') {
      return res.status(400).json({
        success: false,
        message: `Cannot remind for PO with status: ${po.status}. PO must be Sent`,
        error: 'INVALID_PO_STATUS'
      });
    }

    // Send reminder email
    const vendor = po.vendor_id;
    if (vendor.email) {
      const reminderHtml = `
        <div style="font-family: Arial, sans-serif;">
          <h2>Reminder: Purchase Order ${po.po_number}</h2>
          <p>Dear ${vendor.vendor_name},</p>
          <p>This is a reminder to acknowledge receipt of Purchase Order ${po.po_number}.</p>
          <p>Please acknowledge within 24 hours to confirm acceptance of the order.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/po/${po._id}/acknowledge" 
               style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              ACKNOWLEDGE NOW
            </a>
          </div>
          <p>Thank you,<br>Purchase Team</p>
        </div>
      `;

      await emailService.sendEmail({
        to: vendor.email,
        subject: `Reminder: Acknowledge Purchase Order ${po.po_number}`,
        html: reminderHtml
      });
    }

    res.status(200).json({
      success: true,
      message: 'Reminder sent successfully',
      data: {
        po_number: po.po_number,
        vendor_email: vendor.email,
        reminder_sent_at: new Date()
      }
    });

  } catch (error) {
    console.error('Remind PO error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send reminder',
      error: error.message
    });
  }
};

// ======================================================
// GET ALL PURCHASE ORDERS
// GET /api/purchase-orders
// ======================================================
exports.getAllPurchaseOrders = async (req, res) => {
  try {
    const {
      status,
      vendor_id,
      from_date,
      to_date,
      page = 1,
      limit = 20,
      sort_by = 'createdAt',
      sort_order = 'desc'
    } = req.query;

    let filter = {};

    if (status) filter.status = status;
    if (vendor_id) filter.vendor_id = vendor_id;

    if (from_date || to_date) {
      filter.po_date = {};
      if (from_date) filter.po_date.$gte = new Date(from_date);
      if (to_date) filter.po_date.$lte = new Date(to_date);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sort_by] = sort_order === 'asc' ? 1 : -1;

    const pos = await PurchaseOrder.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('vendor_id', 'vendor_name vendor_code')
      .populate('pr_id', 'pr_number')
      .populate('rfq_id', 'rfq_number')
      .populate('created_by', 'Username Email');

    const total = await PurchaseOrder.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: pos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get all POs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchase orders',
      error: error.message
    });
  }
};

// ======================================================
// GET PURCHASE ORDER BY ID
// GET /api/purchase-orders/:id
// ======================================================
exports.getPurchaseOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const po = await PurchaseOrder.findById(id)
      .populate('vendor_id')
      .populate('pr_id')
      .populate('rfq_id')
      .populate('items.item_id')
      .populate('approved_by', 'Username Email')
      .populate('created_by', 'Username Email')
      .populate('updated_by', 'Username Email');

    if (!po) {
      return res.status(404).json({
        success: false,
        message: 'Purchase Order not found',
        error: 'PO_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: po
    });

  } catch (error) {
    console.error('Get PO by id error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch purchase order',
      error: error.message
    });
  }
};