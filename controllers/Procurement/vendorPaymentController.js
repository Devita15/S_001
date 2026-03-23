// controllers/Procurement/vendorPaymentController.js
const VendorPayment = require('../../models/Procurement/VendorPayment');
const PurchaseInvoice = require('../../models/Procurement/PurchaseInvoice');
const Vendor = require('../../models/CRM/Vendor');
const GLJournalEntry = require('../../models/Finance/GLJournalEntry');

// ======================================================
// CREATE VENDOR PAYMENT
// POST /api/vendor-payments
// ======================================================
exports.createVendorPayment = async (req, res) => {
  try {
    const {
      vendor_id,
      payment_date,
      amount,
      payment_mode,
      reference_no,
      reference_date,
      from_bank_account,
      bank_charges,
      tds_applicable,
      tds_section,
      tds_rate,
      purchase_invoice_ids,
      allocations,
      remarks,
      internal_notes
    } = req.body;
    
    // 1. Validate vendor
    const vendor = await Vendor.findById(vendor_id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
        error: 'VENDOR_NOT_FOUND'
      });
    }
    
    // 2. Validate invoices
    const invoices = await PurchaseInvoice.find({
      _id: { $in: purchase_invoice_ids },
      vendor_id: vendor_id,
      status: 'Approved',
      payment_status: { $ne: 'Fully Paid' }
    });
    
    if (invoices.length !== purchase_invoice_ids.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more invoices are invalid, not approved, or already fully paid',
        error: 'INVALID_INVOICES'
      });
    }
    
    // 3. Validate allocations
    let totalAllocated = 0;
    const validatedAllocations = [];
    
    for (const alloc of allocations) {
      const invoice = invoices.find(i => i._id.toString() === alloc.purchase_invoice_id);
      if (!invoice) {
        return res.status(400).json({
          success: false,
          message: `Invoice not found: ${alloc.purchase_invoice_id}`,
          error: 'INVOICE_NOT_FOUND'
        });
      }
      
      const balanceDue = invoice.grand_total - invoice.paid_amount;
      if (alloc.allocated_amount > balanceDue) {
        return res.status(400).json({
          success: false,
          message: `Allocated amount ${alloc.allocated_amount} exceeds balance due ${balanceDue} for invoice ${invoice.vendor_invoice_no}`,
          error: 'EXCESS_ALLOCATION'
        });
      }
      
      totalAllocated += alloc.allocated_amount;
      
      validatedAllocations.push({
        purchase_invoice_id: alloc.purchase_invoice_id,
        invoice_number: invoice.purchase_invoice_number,
        invoice_date: invoice.invoice_date,
        invoice_amount: invoice.grand_total,
        allocated_amount: alloc.allocated_amount,
        balance_after_allocation: balanceDue - alloc.allocated_amount,
        allocated_by: req.user._id
      });
    }
    
    // 4. Validate total amount
    if (Math.abs(totalAllocated - amount) > 0.01) {
      return res.status(400).json({
        success: false,
        message: `Total allocated amount ${totalAllocated} does not match payment amount ${amount}`,
        error: 'AMOUNT_MISMATCH'
      });
    }
    
    // 5. Calculate TDS
    let tdsAmount = 0;
    if (tds_applicable && tds_rate) {
      // TDS is calculated on taxable amount (excluding GST)
      const taxableTotal = invoices.reduce((sum, inv) => sum + inv.taxable_total, 0);
      tdsAmount = (taxableTotal * tds_rate) / 100;
    }
    
    // 6. Create payment
    const payment = new VendorPayment({
      payment_date: payment_date || new Date(),
      vendor_id: vendor._id,
      vendor_name: vendor.vendor_name,
      vendor_gstin: vendor.gstin,
      vendor_pan: vendor.pan,
      vendor_bank_details: vendor.bank_details,
      amount: amount,
      payment_mode,
      reference_no,
      reference_date: reference_date || null,
      from_bank_account: from_bank_account || {},
      bank_charges: bank_charges || 0,
      tds_applicable: tds_applicable || false,
      tds_section: tds_section || null,
      tds_rate: tds_rate || 0,
      tds_amount: tdsAmount,
      net_paid: amount - tdsAmount - (bank_charges || 0),
      purchase_invoice_ids: purchase_invoice_ids,
      allocations: validatedAllocations,
      requires_approval: amount > 50000, // ₹50,000 threshold
      remarks: remarks || '',
      internal_notes: internal_notes || '',
      status: 'Pending',
      created_by: req.user._id
    });
    
    await payment.save();
    
    res.status(201).json({
      success: true,
      message: 'Vendor payment created successfully',
      data: {
        _id: payment._id,
        vendor_payment_number: payment.vendor_payment_number,
        amount: payment.amount,
        tds_amount: payment.tds_amount,
        net_paid: payment.net_paid,
        status: payment.status,
        requires_approval: payment.requires_approval
      }
    });
    
  } catch (error) {
    console.error('Create vendor payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create vendor payment',
      error: error.message
    });
  }
};

// ======================================================
// APPROVE VENDOR PAYMENT
// PUT /api/vendor-payments/:id/approve
// ======================================================
exports.approveVendorPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { approval_remarks } = req.body;
    
    const payment = await VendorPayment.findById(id)
      .populate('purchase_invoice_ids');
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Vendor payment not found',
        error: 'PAYMENT_NOT_FOUND'
      });
    }
    
    if (payment.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve payment with status: ${payment.status}`,
        error: 'INVALID_PAYMENT_STATUS'
      });
    }
    
    // Check approval threshold
    if (payment.requires_approval) {
      const userRole = req.user.RoleName;
      if (!['SuperAdmin', 'manager', 'finance_head'].includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: `Payment amount ₹${payment.amount} requires approval from manager/finance`,
          error: 'APPROVAL_REQUIRED'
        });
      }
    }
    
    // Update payment status
    payment.status = 'Paid';
    payment.approved_by = req.user._id;
    payment.approved_at = new Date();
    payment.approval_remarks = approval_remarks || '';
    payment.updated_by = req.user._id;
    
    await payment.save();
    
    // Update invoice payment statuses
    for (const allocation of payment.allocations) {
      const invoice = await PurchaseInvoice.findById(allocation.purchase_invoice_id);
      if (invoice) {
        invoice.paid_amount += allocation.allocated_amount;
        invoice.balance_due = invoice.grand_total - invoice.paid_amount;
        
        if (invoice.balance_due <= 0) {
          invoice.payment_status = 'Fully Paid';
        } else {
          invoice.payment_status = 'Partially Paid';
        }
        
        invoice.payment_ids.push(payment._id);
        invoice.allocations.push({
          invoice_id: payment._id,
          invoice_number: payment.vendor_payment_number,
          allocated_amount: allocation.allocated_amount
        });
        
        await invoice.save();
      }
    }
    
    // Post GL entries
    await postGLJournalEntries(payment);
    
    res.status(200).json({
      success: true,
      message: 'Vendor payment approved and processed',
      data: {
        payment_number: payment.vendor_payment_number,
        amount: payment.amount,
        tds_amount: payment.tds_amount,
        net_paid: payment.net_paid,
        status: payment.status
      }
    });
    
  } catch (error) {
    console.error('Approve payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve payment',
      error: error.message
    });
  }
};

// Helper: Post GL Journal Entries
async function postGLJournalEntries(payment) {
  try {
    // GL Entry: Debit Accounts Payable, Credit Bank, Debit TDS Payable
    const journalEntry = new GLJournalEntry({
      journal_number: `GL-${payment.vendor_payment_number}`,
      journal_date: new Date(),
      entry_type: 'Vendor Payment',
      reference_doc_type: 'VendorPayment',
      reference_doc_id: payment._id,
      reference_doc_number: payment.vendor_payment_number,
      entries: [
        {
          account_code: 'AP-001', // Accounts Payable
          account_name: 'Accounts Payable',
          debit: payment.amount,
          credit: 0
        },
        {
          account_code: 'BANK-001', // Bank Account
          account_name: 'Bank Account',
          debit: 0,
          credit: payment.net_paid
        },
        {
          account_code: 'TDS-001', // TDS Payable
          account_name: 'TDS Payable',
          debit: 0,
          credit: payment.tds_amount
        }
      ],
      created_by: payment.created_by
    });
    
    await journalEntry.save();
    
    payment.gl_posting_done = true;
    payment.gl_posting_date = new Date();
    payment.gl_journal_entry_id = journalEntry.journal_number;
    await payment.save();
    
  } catch (error) {
    console.error('GL posting error:', error);
  }
}

// ======================================================
// GET ALL VENDOR PAYMENTS
// GET /api/vendor-payments
// ======================================================
exports.getAllVendorPayments = async (req, res) => {
  try {
    const {
      status,
      vendor_id,
      payment_mode,
      from_date,
      to_date,
      page = 1,
      limit = 20,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;
    
    let filter = {};
    
    if (status) filter.status = status;
    if (vendor_id) filter.vendor_id = vendor_id;
    if (payment_mode) filter.payment_mode = payment_mode;
    
    if (from_date || to_date) {
      filter.payment_date = {};
      if (from_date) filter.payment_date.$gte = new Date(from_date);
      if (to_date) filter.payment_date.$lte = new Date(to_date);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sort_by] = sort_order === 'asc' ? 1 : -1;
    
    const payments = await VendorPayment.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('vendor_id', 'vendor_name vendor_code')
      .populate('purchase_invoice_ids', 'purchase_invoice_number vendor_invoice_no grand_total')
      .populate('created_by', 'Username Email');
    
    const total = await VendorPayment.countDocuments(filter);
    
    // Summary statistics
    const stats = await VendorPayment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total_payments: { $sum: 1 },
          total_amount: { $sum: '$amount' },
          total_tds: { $sum: '$tds_amount' },
          total_net_paid: { $sum: '$net_paid' },
          pending_count: { $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] } },
          paid_count: { $sum: { $cond: [{ $eq: ['$status', 'Paid'] }, 1, 0] } }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      statistics: stats[0] || {
        total_payments: 0,
        total_amount: 0,
        total_tds: 0,
        total_net_paid: 0,
        pending_count: 0,
        paid_count: 0
      }
    });
    
  } catch (error) {
    console.error('Get all payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: error.message
    });
  }
};

// ======================================================
// GET VENDOR PAYMENT BY ID
// GET /api/vendor-payments/:id
// ======================================================
exports.getVendorPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const payment = await VendorPayment.findById(id)
      .populate('vendor_id', 'vendor_name vendor_code gstin pan bank_details')
      .populate('purchase_invoice_ids', 'purchase_invoice_number vendor_invoice_no invoice_date grand_total paid_amount balance_due')
      .populate('created_by', 'Username Email')
      .populate('approved_by', 'Username Email');
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Vendor payment not found',
        error: 'PAYMENT_NOT_FOUND'
      });
    }
    
    res.status(200).json({
      success: true,
      data: payment
    });
    
  } catch (error) {
    console.error('Get payment by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment',
      error: error.message
    });
  }
};