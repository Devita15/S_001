// controllers/Procurement/purchaseInvoiceController.js
const PurchaseInvoice = require('../../models/Procurement/PurchaseInvoice');
const PurchaseOrder = require('../../models/Procurement/PurchaseOrder');
const GRN = require('../../models/Procurement/GRN');
const Vendor = require('../../models/CRM/Vendor');
const Company = require('../../models/user\'s & setting\'s/Company');

// ======================================================
// CREATE PURCHASE INVOICE
// POST /api/purchase-invoices
// ======================================================
exports.createPurchaseInvoice = async (req, res) => {
  try {
    const {
      po_id,
      grn_ids,
      vendor_invoice_no,
      vendor_invoice_date,
      invoice_date,
      items,
      discount_total,
      tds_applicable,
      tds_section,
      tds_rate,
      due_date,
      internal_remarks
    } = req.body;

    // 1. Validate PO exists
    const po = await PurchaseOrder.findById(po_id)
      .populate('vendor_id')
      .populate('items.item_id');

    if (!po) {
      return res.status(404).json({
        success: false,
        message: 'Purchase Order not found',
        error: 'PO_NOT_FOUND'
      });
    }

    // 2. Validate PO status
    if (!['Partially Received', 'Fully Received'].includes(po.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot create invoice for PO with status: ${po.status}. PO must have received goods`,
        error: 'INVALID_PO_STATUS'
      });
    }

    // 3. Validate vendor
    const vendor = await Vendor.findById(po.vendor_id._id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
        error: 'VENDOR_NOT_FOUND'
      });
    }

    // 4. Validate GRNs
    const grns = await GRN.find({ _id: { $in: grn_ids } });
    if (grns.length !== grn_ids.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more GRNs not found',
        error: 'GRN_NOT_FOUND'
      });
    }

    // 5. Check for duplicate vendor invoice
    const existingInvoice = await PurchaseInvoice.findOne({
      vendor_invoice_no: vendor_invoice_no,
      vendor_id: vendor._id
    });
    if (existingInvoice) {
      return res.status(409).json({
        success: false,
        message: `Invoice ${vendor_invoice_no} already exists for this vendor`,
        error: 'DUPLICATE_INVOICE'
      });
    }

    // 6. Get company details
    const company = await Company.findOne({ is_active: true });
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'No active company found',
        error: 'COMPANY_NOT_FOUND'
      });
    }

    // 7. Process invoice items
    const invoiceItems = [];
    let taxableTotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    for (const item of items) {
      // Find PO item
      const poItem = po.items.find(i => i._id.toString() === item.po_item_id);
      if (!poItem) {
        return res.status(400).json({
          success: false,
          message: `PO item not found: ${item.po_item_id}`,
          error: 'PO_ITEM_NOT_FOUND'
        });
      }

      // Find GRN item
      let grnItem = null;
      for (const grn of grns) {
        const found = grn.items.find(i => i.po_item_id.toString() === item.po_item_id);
        if (found) {
          grnItem = found;
          break;
        }
      }

      if (!grnItem) {
        return res.status(400).json({
          success: false,
          message: `GRN item not found for PO item: ${poItem.part_no}`,
          error: 'GRN_ITEM_NOT_FOUND'
        });
      }

      // Determine GST split based on GST type
      let cgstPercent = 0, sgstPercent = 0, igstPercent = 0;
      let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;

      if (vendor.state_code === company.state_code) {
        // CGST + SGST (Intra-state)
        cgstPercent = item.gst_percent / 2;
        sgstPercent = item.gst_percent / 2;
        cgstAmount = (item.taxable_amount * cgstPercent) / 100;
        sgstAmount = (item.taxable_amount * sgstPercent) / 100;
        totalCgst += cgstAmount;
        totalSgst += sgstAmount;
      } else {
        // IGST (Inter-state)
        igstPercent = item.gst_percent;
        igstAmount = (item.taxable_amount * igstPercent) / 100;
        totalIgst += igstAmount;
      }

      const totalGstAmount = cgstAmount + sgstAmount + igstAmount;

      invoiceItems.push({
        po_item_id: item.po_item_id,
        grn_item_id: grnItem._id,
        item_id: poItem.item_id,
        part_no: poItem.part_no,
        description: poItem.description,
        hsn_code: poItem.hsn_code,
        quantity: item.quantity,
        unit: poItem.unit,
        unit_price: item.unit_price,
        po_unit_price: poItem.unit_price,
        discount_percent: item.discount_percent || 0,
        discount_amount: item.discount_amount || 0,
        taxable_amount: item.taxable_amount,
        gst_percent: item.gst_percent,
        cgst_percent: cgstPercent,
        sgst_percent: sgstPercent,
        igst_percent: igstPercent,
        cgst_amount: cgstAmount,
        sgst_amount: sgstAmount,
        igst_amount: igstAmount,
        total_gst_amount: totalGstAmount,
        total_amount: item.taxable_amount + totalGstAmount,
        grn_id: grnItem._id,
        grn_number: grns.find(g => g._id.toString() === grnItem._id.toString())?.grn_number,
        match_status: 'Not Checked',
        match_notes: null
      });

      taxableTotal += item.taxable_amount;
    }

    // 8. Determine GST type
    const gstType = vendor.state_code === company.state_code ? 'CGST/SGST' : 'IGST';

    // 9. Calculate totals
    const totalTax = totalCgst + totalSgst + totalIgst;
    const grandTotal = taxableTotal + totalTax;
    
    // Calculate TDS amount
    let tdsAmount = 0;
    if (tds_applicable && tds_rate) {
      tdsAmount = (taxableTotal * tds_rate) / 100;
    }
    
    const netPayable = grandTotal - tdsAmount;

    // 10. Create invoice
    const invoice = new PurchaseInvoice({
      invoice_date: invoice_date || new Date(),
      vendor_invoice_no,
      vendor_invoice_date: new Date(vendor_invoice_date),
      vendor_id: vendor._id,
      vendor_name: vendor.vendor_name,
      vendor_gstin: vendor.gstin,
      vendor_pan: vendor.pan,
      vendor_state: vendor.state,
      vendor_state_code: vendor.state_code,
      vendor_address: vendor.address,
      po_id: po._id,
      po_number: po.po_number,
      grn_ids: grn_ids,
      grn_numbers: grns.map(g => g.grn_number),
      company_id: company._id,
      company_name: company.company_name,
      company_gstin: company.gstin,
      company_state_code: company.state_code,
      items: invoiceItems,
      taxable_total: taxableTotal,
      discount_total: discount_total || 0,
      cgst_total: totalCgst,
      sgst_total: totalSgst,
      igst_total: totalIgst,
      total_tax: totalTax,
      grand_total: grandTotal,
      gst_type: gstType,
      tds_applicable: tds_applicable || false,
      tds_section: tds_section || null,
      tds_rate: tds_rate || 0,
      tds_amount: tdsAmount,
      net_payable: netPayable,
      due_date: due_date ? new Date(due_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      internal_remarks: internal_remarks || '',
      status: 'Pending',
      matching_status: 'Not Started',
      created_by: req.user._id
    });

    await invoice.save();

    // 11. Perform initial two-way match (PO vs Invoice)
    await performTwoWayMatch(invoice, po);

    res.status(201).json({
      success: true,
      message: 'Purchase Invoice created successfully',
      data: {
        _id: invoice._id,
        purchase_invoice_number: invoice.purchase_invoice_number,
        vendor_invoice_no: invoice.vendor_invoice_no,
        grand_total: invoice.grand_total,
        net_payable: invoice.net_payable,
        tds_amount: invoice.tds_amount,
        matching_status: invoice.matching_status,
        status: invoice.status
      }
    });

  } catch (error) {
    console.error('Create Purchase Invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create purchase invoice',
      error: error.message
    });
  }
};

// Helper: Perform two-way match (PO vs Invoice)
async function performTwoWayMatch(invoice, po) {
  let allMatched = true;
  
  for (const item of invoice.items) {
    const poItem = po.items.find(i => i._id.toString() === item.po_item_id.toString());
    
    if (!poItem) {
      item.match_status = 'Quantity Mismatch';
      item.match_notes = 'PO item not found';
      allMatched = false;
      continue;
    }
    
    // Price match check (allow 0.5% tolerance)
    const priceDiff = Math.abs(item.unit_price - poItem.unit_price);
    if (priceDiff > 0.01) {
      const diffPercent = (priceDiff / poItem.unit_price) * 100;
      if (diffPercent > 0.5) {
        item.match_status = 'Price Mismatch';
        item.match_notes = `PO price: ${poItem.unit_price}, Invoice price: ${item.unit_price}, Diff: ${diffPercent.toFixed(2)}%`;
        allMatched = false;
        continue;
      }
    }
    
    item.match_status = 'Matched';
    item.po_unit_price = poItem.unit_price;
  }
  
  invoice.matching_status = allMatched ? '2-way Matched' : 'Exception';
  await invoice.save();
  
  return allMatched;
}

// ======================================================
// PERFORM THREE-WAY MATCH
// PUT /api/purchase-invoices/:id/three-way-match
// ======================================================
exports.performThreeWayMatch = async (req, res) => {
  try {
    const { id } = req.params;
    
    const invoice = await PurchaseInvoice.findById(id)
      .populate('po_id')
      .populate('grn_ids');
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Purchase Invoice not found',
        error: 'INVOICE_NOT_FOUND'
      });
    }
    
    if (invoice.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot perform three-way match on invoice with status: ${invoice.status}`,
        error: 'INVALID_INVOICE_STATUS'
      });
    }
    
    const po = invoice.po_id;
    const grns = invoice.grn_ids;
    
    let allMatched = true;
    const matchResults = [];
    
    for (const item of invoice.items) {
      // Find PO item
      const poItem = po.items.find(i => i._id.toString() === item.po_item_id.toString());
      
      if (!poItem) {
        matchResults.push({
          part_no: item.part_no,
          match_status: 'Exception',
          message: 'PO item not found'
        });
        allMatched = false;
        continue;
      }
      
      // Calculate total GRN accepted quantity
      let totalGRNAcceptedQty = 0;
      for (const grn of grns) {
        const grnItem = grn.items.find(i => i.po_item_id.toString() === item.po_item_id.toString());
        if (grnItem) {
          totalGRNAcceptedQty += grnItem.accepted_qty;
        }
      }
      
      // Calculate expected amount: PO Unit Price × GRN Accepted Qty
      const expectedAmount = poItem.unit_price * totalGRNAcceptedQty;
      const invoiceAmount = item.taxable_amount;
      const diffAmount = Math.abs(invoiceAmount - expectedAmount);
      const diffPercent = expectedAmount > 0 ? (diffAmount / expectedAmount) * 100 : 0;
      
      const result = {
        part_no: item.part_no,
        po_price: poItem.unit_price,
        po_ordered_qty: poItem.ordered_qty,
        grn_accepted_qty: totalGRNAcceptedQty,
        expected_amount: expectedAmount,
        invoice_qty: item.quantity,
        invoice_price: item.unit_price,
        invoice_amount: invoiceAmount,
        difference: diffAmount,
        difference_percent: diffPercent.toFixed(2)
      };
      
      if (diffPercent > 0.5) {
        result.match_status = 'Exception';
        item.match_status = 'Exception';
        item.match_notes = `Amount mismatch: Expected ₹${expectedAmount.toFixed(2)}, Got ₹${invoiceAmount.toFixed(2)} (${diffPercent.toFixed(2)}% diff)`;
        allMatched = false;
      } else {
        result.match_status = 'Matched';
        item.match_status = 'Matched';
        item.match_notes = null;
      }
      
      matchResults.push(result);
    }
    
    // Update invoice matching status
    invoice.matching_status = allMatched ? '3-way Matched' : 'Exception';
    invoice.matching_completed_at = new Date();
    invoice.matching_completed_by = req.user._id;
    
    await invoice.save();
    
    res.status(200).json({
      success: true,
      message: allMatched ? 'Three-way match completed - All items matched' : 'Three-way match completed - Exceptions found',
      data: {
        invoice_number: invoice.purchase_invoice_number,
        matching_status: invoice.matching_status,
        matches: matchResults,
        summary: {
          total_items: matchResults.length,
          matched_items: matchResults.filter(m => m.match_status === 'Matched').length,
          exception_items: matchResults.filter(m => m.match_status === 'Exception').length
        }
      }
    });
    
  } catch (error) {
    console.error('Three-way match error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform three-way match',
      error: error.message
    });
  }
};

// ======================================================
// APPROVE PURCHASE INVOICE
// PUT /api/purchase-invoices/:id/approve
// ======================================================
exports.approvePurchaseInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { approval_remarks } = req.body;
    
    const invoice = await PurchaseInvoice.findById(id)
      .populate('po_id')
      .populate('vendor_id');
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Purchase Invoice not found',
        error: 'INVOICE_NOT_FOUND'
      });
    }
    
    if (invoice.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve invoice with status: ${invoice.status}`,
        error: 'INVALID_INVOICE_STATUS'
      });
    }
    
    // Check if three-way match is required
    if (invoice.matching_status !== '3-way Matched' && invoice.matching_status !== 'Exception') {
      return res.status(400).json({
        success: false,
        message: 'Please perform three-way match before approval',
        error: 'THREE_WAY_MATCH_REQUIRED'
      });
    }
    
    // If exception exists, require special approval
    if (invoice.matching_status === 'Exception') {
      // Check if user has authority to approve exceptions
      const userRole = req.user.RoleName;
      if (!['admin', 'manager', 'finance_head', 'SuperAdmin'].includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Exceptions require finance team approval',
          error: 'EXCEPTION_APPROVAL_REQUIRED'
        });
      }
    }
    
    // Update invoice status
    invoice.status = 'Approved';
    invoice.approval_remarks = approval_remarks || '';
    invoice.updated_by = req.user._id;
    
    // Compute ITC (Input Tax Credit)
    invoice.itc_eligible = true;
    invoice.itc_amount = invoice.total_tax;
    invoice.itc_claimed_in = null; // Will be set when claimed in GSTR-3B
    
    await invoice.save();
    
    res.status(200).json({
      success: true,
      message: 'Purchase Invoice approved successfully',
      data: {
        invoice_number: invoice.purchase_invoice_number,
        vendor_invoice_no: invoice.vendor_invoice_no,
        status: invoice.status,
        matching_status: invoice.matching_status,
        itc_amount: invoice.itc_amount,
        net_payable: invoice.net_payable
      }
    });
    
  } catch (error) {
    console.error('Approve invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve invoice',
      error: error.message
    });
  }
};

// ======================================================
// GET ALL PURCHASE INVOICES
// GET /api/purchase-invoices
// ======================================================
exports.getAllPurchaseInvoices = async (req, res) => {
  try {
    const {
      status,
      matching_status,
      payment_status,
      vendor_id,
      po_id,
      from_date,
      to_date,
      page = 1,
      limit = 20,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;
    
    let filter = {};
    
    if (status) filter.status = status;
    if (matching_status) filter.matching_status = matching_status;
    if (payment_status) filter.payment_status = payment_status;
    if (vendor_id) filter.vendor_id = vendor_id;
    if (po_id) filter.po_id = po_id;
    
    if (from_date || to_date) {
      filter.invoice_date = {};
      if (from_date) filter.invoice_date.$gte = new Date(from_date);
      if (to_date) filter.invoice_date.$lte = new Date(to_date);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sort_by] = sort_order === 'asc' ? 1 : -1;
    
    const invoices = await PurchaseInvoice.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('vendor_id', 'vendor_name vendor_code')
      .populate('po_id', 'po_number')
      .populate('created_by', 'Username Email');
    
    const total = await PurchaseInvoice.countDocuments(filter);
    
    // Summary statistics
    const stats = await PurchaseInvoice.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total_invoices: { $sum: 1 },
          total_amount: { $sum: '$grand_total' },
          total_paid: { $sum: '$paid_amount' },
          total_due: { $sum: '$balance_due' },
          total_tax: { $sum: '$total_tax' },
          total_itc: { $sum: '$itc_amount' },
          pending_count: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          approved_count: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } },
          exception_count: { $sum: { $cond: [{ $eq: ['$matching_status', 'Exception'] }, 1, 0] } }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: invoices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      statistics: stats[0] || {
        total_invoices: 0,
        total_amount: 0,
        total_paid: 0,
        total_due: 0,
        total_tax: 0,
        total_itc: 0,
        pending_count: 0,
        approved_count: 0,
        exception_count: 0
      }
    });
    
  } catch (error) {
    console.error('Get all invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message
    });
  }
};

// ======================================================
// GET PURCHASE INVOICE BY ID
// GET /api/purchase-invoices/:id
// ======================================================
exports.getPurchaseInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const invoice = await PurchaseInvoice.findById(id)
      .populate('vendor_id', 'vendor_name vendor_code gstin pan state state_code')
      .populate('po_id', 'po_number po_date')
      .populate('grn_ids', 'grn_number grn_date')
      .populate('created_by', 'Username Email')
      .populate('updated_by', 'Username Email');
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Purchase Invoice not found',
        error: 'INVOICE_NOT_FOUND'
      });
    }
    
    res.status(200).json({
      success: true,
      data: invoice
    });
    
  } catch (error) {
    console.error('Get invoice by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice',
      error: error.message
    });
  }
};