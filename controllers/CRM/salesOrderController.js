'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// controllers/CRM/salesOrderController.js
// UPDATED: Now uses item_id from Item Master instead of part_no
// ─────────────────────────────────────────────────────────────────────────────

const mongoose   = require('mongoose');
const PDFDoc     = require('pdfkit');
const nodemailer = require('nodemailer');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');

const { SalesOrder, SO_STATUS_TRANSITIONS } = require('../../models/CRM/SalesOrder');
const Customer  = require('../../models/CRM/Customer');
const Company   = require('../../models/user\'s & setting\'s/Company');
const Item      = require('../../models/CRM/Item');

// ─── Response helpers ────────────────────────────────────────────────────────
const ok  = (res, data, code = 200) => res.status(code).json({ success: true,  ...data });
const err = (res, msg,  code = 500) => res.status(code).json({ success: false, message: msg });

// ─────────────────────────────────────────────────────────────────────────────
// Multer — PO file upload
// ─────────────────────────────────────────────────────────────────────────────
const uploadDir = 'uploads/po_files/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file,  cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `po-${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Invalid file type. Only PDF, JPEG, PNG, and TIFF are allowed.'), false);
};

const uploadPoFile = multer({
  storage,
  limits:     { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter,
}).single('customer_po_file');

// ─────────────────────────────────────────────────────────────────────────────
// Parse request body correctly for both JSON and multipart/form-data.
// ─────────────────────────────────────────────────────────────────────────────
function parseBodyField(value) {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

function normaliseBody(body) {
  const out = { ...body };
  const arrayFields  = ['items', 'terms_conditions', 'shipping_addresses'];
  const objectFields = ['billing_address', 'shipping_address'];

  arrayFields.forEach(f => {
    if (out[f] !== undefined) out[f] = parseBodyField(out[f]);
  });
  objectFields.forEach(f => {
    if (out[f] !== undefined) out[f] = parseBodyField(out[f]);
  });

  const numericFields = ['grand_total'];
  numericFields.forEach(f => {
    if (out[f] !== undefined && typeof out[f] === 'string') {
      out[f] = parseFloat(out[f]);
    }
  });

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper — credit limit check
// ─────────────────────────────────────────────────────────────────────────────
async function checkCreditLimit(customer, newSoTotal, excludeSoId = null) {
  if (!customer.credit_limit || customer.credit_limit === 0) return null;

  const matchStage = {
    customer_id: customer._id,
    is_active:   true,
    status:      { $nin: ['Cancelled', 'Closed'] },
  };
  if (excludeSoId) matchStage._id = { $ne: new mongoose.Types.ObjectId(excludeSoId) };

  const agg = await SalesOrder.aggregate([
    { $match: matchStage },
    { $group: { _id: null, total: { $sum: '$grand_total' } } },
  ]);

  const openValue = agg[0]?.total || 0;
  if (openValue + newSoTotal > customer.credit_limit) {
    return (
      `Credit limit exceeded. ` +
      `Open SO value: ₹${openValue.toLocaleString('en-IN')}, ` +
      `New SO value: ₹${newSoTotal.toLocaleString('en-IN')}, ` +
      `Limit: ₹${customer.credit_limit.toLocaleString('en-IN')}`
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper — fetch item details from master using item_id
// ─────────────────────────────────────────────────────────────────────────────
async function fetchItemDetails(itemId) {
  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new Error(`Invalid item_id format: ${itemId}`);
  }
  
  const item = await Item.findById(itemId);
  if (!item) {
    throw new Error(`Item with ID ${itemId} not found in Item Master`);
  }
  if (!item.is_active) {
    throw new Error(`Item with ID ${itemId} is inactive`);
  }
  
  console.log(`[fetchItemDetails] Found item:`, {
    _id: item._id,
    part_no: item.part_no,
    part_name: item.part_name,
    unit: item.unit,
    hsn_code: item.hsn_code,
    gst_percentage: item.gst_percentage
  });
  
  return {
    part_no: item.part_no,
    part_name: item.part_name,
    unit: item.unit,
    hsn_code: item.hsn_code,
    gst_percentage: item.gst_percentage || 18,
    drawing_no: item.drawing_no || '',
    revision_no: item.revision_no || '0',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper — validate and enrich items from master using item_id
// ─────────────────────────────────────────────────────────────────────────────
async function validateAndEnrichItems(items) {
  const enrichedItems = [];
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      // Validate required fields
      if (!item.item_id) {
        throw new Error(`items[${i}].item_id is required (Item Master ObjectId)`);
      }
      if (!item.ordered_qty || Number(item.ordered_qty) <= 0) {
        throw new Error(`items[${i}].ordered_qty must be > 0`);
      }
      if (item.unit_price === undefined || item.unit_price === null || Number(item.unit_price) < 0) {
        throw new Error(`items[${i}].unit_price is required and must be >= 0`);
      }

      // Fetch details from Item Master using item_id
      const masterDetails = await fetchItemDetails(item.item_id);

      // Enrich with master data
      enrichedItems.push({
        item_id: masterDetails._id,  // Store the reference
        part_no: masterDetails.part_no,
        part_name: masterDetails.part_name,
        hsn_code: masterDetails.hsn_code,
        unit: masterDetails.unit,
        gst_percentage: masterDetails.gst_percentage,
        drawing_no: masterDetails.drawing_no,
        revision_no: masterDetails.revision_no,
        ordered_qty: Number(item.ordered_qty),
        delivered_qty: 0,
        unit_price: Number(item.unit_price),
        discount_percent: Number(item.discount_percent || 0),
        discount_amount: 0,
        taxable_amount: 0,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 0,
        total_amount: 0,
        required_date: item.required_date || null,
        committed_date: item.committed_date || null,
        remarks: item.remarks || '',
        item_status: 'Pending',
        is_cancelled: false,
      });
    } catch (err) {
      errors.push({ index: i, item_id: item.item_id, error: err.message });
    }
  }

  if (errors.length > 0) {
    throw new Error(`Item validation failed: ${JSON.stringify(errors)}`);
  }

  return enrichedItems;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper — build revision diff
// ─────────────────────────────────────────────────────────────────────────────
function buildDiff(oldItems, newItems) {
  const changes = [];
  const oldMap  = Object.fromEntries(
    (oldItems || []).map(i => [String(i._id), i])
  );
  (newItems || []).forEach(ni => {
    const oi = oldMap[String(ni._id)];
    if (!oi) return;
    ['ordered_qty', 'unit_price', 'committed_date', 'required_date', 'discount_percent'].forEach(f => {
      const ov = oi[f]?.toString?.() ?? String(oi[f] ?? '');
      const nv = ni[f]?.toString?.() ?? String(ni[f] ?? '');
      if (ov !== nv) {
        changes.push({ field: f, old_value: oi[f], new_value: ni[f] });
      }
    });
  });
  return changes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper — SMTP transporter
// ─────────────────────────────────────────────────────────────────────────────
async function getSmtpTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ██  BE-009 — CRUD
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-orders
// UPDATED: Uses item_id (MongoDB ObjectId) to fetch part details from Item Master
// ─────────────────────────────────────────────────────────────────────────────
const createSalesOrder = async (req, res) => {
  try {
    // ── Normalise body ──────────────────────────────────────────────────────
    const body = normaliseBody(req.body);

    // ── Validate items exist and are an array ─────────────────────────────────
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return err(res, 'items must be a non-empty array of line items', 400);
    }

    // ── Validate and enrich items from Item Master using item_id ──────────────
    let enrichedItems;
    try {
      enrichedItems = await validateAndEnrichItems(body.items);
    } catch (validationError) {
      console.error('[createSalesOrder] Validation Error:', validationError.message);
      return err(res, validationError.message, 400);
    }

    // ── Fetch company and customer ────────────────────────────────────────────
    const company  = await Company.findOne({ is_active: true });
    const customer = await Customer.findById(body.customer_id);

    if (!company)  return err(res, 'No active company found. Please configure Company master.', 404);
    if (!customer) return err(res, 'Customer not found', 404);

    // ── Save uploaded PO file path ────────────────────────────────────────────
    if (req.file?.path) {
      body.customer_po_file = req.file.path;
    }

    // ── GST type — immutable after creation ───────────────────────────────────
    const companyStateCode  = company.state_code || 0;
    const customerStateCode = customer.billing_address?.state_code || 0;
    const gst_type = companyStateCode === customerStateCode ? 'CGST/SGST' : 'IGST';

    // ── Compute estimated total from enriched items ───────────────────────────
    const estimatedTotal = enrichedItems.reduce(
      (sum, item) => {
        const base     = item.unit_price * item.ordered_qty;
        const discAmt  = base * ((item.discount_percent || 0) / 100);
        const taxable  = base - discAmt;
        const gstAmt   = taxable * (item.gst_percentage / 100);
        return sum + taxable + gstAmt;
      },
      0
    );

    // ── Credit limit check at creation ────────────────────────────────────────
    const creditError = await checkCreditLimit(customer, estimatedTotal);
    if (creditError) return err(res, creditError, 400);

    // ── Address snapshots — copied at creation time, never live-referenced ────
    const billingAddr  = customer.billing_address  || {};
    const shippingAddr = customer.shipping_addresses?.find(a => a.is_default)
                      || customer.shipping_addresses?.[0]
                      || {};

    // ── Build SO document ─────────────────────────────────────────────────────
    const soData = {
      // Identity
      so_date:       body.so_date || new Date(),
      quotation_id:  body.quotation_id  || null,
      quotation_no:  body.quotation_no  || '',
      lead_id:       body.lead_id       || null,

      // Customer
      customer_id:        body.customer_id,
      customer_name:      customer.customer_name,
      customer_gstin:     customer.gstin || '',

      // PO details
      customer_po_number: body.customer_po_number || '',
      customer_po_date:   body.customer_po_date   || null,
      customer_po_file:   body.customer_po_file   || '',

      // Company
      company_id: company._id,
      gst_type,

      // Address snapshots
      billing_address: {
        line1:      billingAddr.line1      || '',
        line2:      billingAddr.line2      || '',
        city:       billingAddr.city       || '',
        district:   billingAddr.district   || '',
        state:      billingAddr.state      || '',
        state_code: billingAddr.state_code || 0,
        pincode:    billingAddr.pincode    || '',
        country:    billingAddr.country    || 'India',
      },
      shipping_address: {
        line1:      shippingAddr.line1      || '',
        line2:      shippingAddr.line2      || '',
        city:       shippingAddr.city       || '',
        district:   shippingAddr.district   || '',
        state:      shippingAddr.state      || '',
        state_code: shippingAddr.state_code || 0,
        pincode:    shippingAddr.pincode    || '',
        country:    shippingAddr.country    || 'India',
      },

      // Commercial
      payment_terms:          body.payment_terms  || customer.payment_terms || 'Net 30',
      delivery_terms:         body.delivery_terms || '',
      delivery_mode:          body.delivery_mode  || '',
      expected_delivery_date: body.expected_delivery_date || null,
      transporter:            body.transporter    || '',
      currency:               body.currency       || 'INR',
      internal_remarks:       body.internal_remarks || '',
      terms_conditions:       Array.isArray(body.terms_conditions) ? body.terms_conditions : [],

      // Line items — enriched from Item Master using item_id
      items: enrichedItems,

      // Status
      status:     'Draft',
      is_active:  true,

      // Audit
      created_by: req.user._id,
      audit_log: [{
        changed_by: req.user._id,
        action:     'created',
        new_value:  'Draft',
        notes:      `SO created${body.quotation_no ? ` from quotation ${body.quotation_no}` : ' manually'}`,
      }],
    };

    // Log the enriched items to verify
    console.log('[createSalesOrder] Enriched items:', JSON.stringify(enrichedItems, null, 2));

    const so = await SalesOrder.create(soData);

    return ok(res, { data: so }, 201);

  } catch (e) {
    console.error('[createSalesOrder] Error:', e);
    if (e.name === 'ValidationError') {
      return err(
        res,
        Object.values(e.errors).map(v => v.message).join(', '),
        400
      );
    }
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders
// ─────────────────────────────────────────────────────────────────────────────
const getSalesOrders = async (req, res) => {
  try {
    const {
      page = 1, limit = 20,
      status, customer_id, customer_po_number,
      from, to,
      sort = '-so_date',
    } = req.query;

    const q = { is_active: true };

    if (status) {
      q.status = { $in: status.split(',').map(s => s.trim()) };
    }
    if (customer_id)        q.customer_id          = customer_id;
    if (customer_po_number) q.customer_po_number   = { $regex: customer_po_number, $options: 'i' };
    if (from || to) {
      q.so_date = {};
      if (from) q.so_date.$gte = new Date(from);
      if (to)   q.so_date.$lte = new Date(to);
    }

    const pageNum  = Math.max(parseInt(page)  || 1, 1);
    const limitNum = Math.min(parseInt(limit) || 20, 100);

    const [data, total] = await Promise.all([
      SalesOrder.find(q)
        .select('-items.audit_log -revisions')
        .sort(sort)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean({ virtuals: true }),
      SalesOrder.countDocuments(q),
    ]);

    return ok(res, {
      data,
      pagination: {
        page:  pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (e) {
    console.error('[getSalesOrders] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/:id
// ─────────────────────────────────────────────────────────────────────────────
const getSalesOrderById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return err(res, 'Invalid Sales Order ID', 400);
    }

    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true })
      .populate('customer_id', 'customer_name gstin billing_address contacts credit_limit credit_outstanding payment_terms')
      .populate('quotation_id', 'QuotationNo Status GrandTotal')
      .populate('created_by',   'Username email')
      .populate('updated_by',   'Username email')
      .lean({ virtuals: true });

    if (!so) return err(res, 'Sales Order not found', 404);

    return ok(res, { data: so });
  } catch (e) {
    console.error('[getSalesOrderById] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/sales-orders/:id
// ─────────────────────────────────────────────────────────────────────────────
const updateSalesOrder = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return err(res, 'Invalid Sales Order ID', 400);
    }

    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true });
    if (!so) return err(res, 'Sales Order not found', 404);

    if (['Cancelled', 'Closed'].includes(so.status)) {
      return err(res, `Cannot update a Sales Order in status: ${so.status}`, 400);
    }

    const body = normaliseBody(req.body);

    const allowedUpdates = [
      'expected_delivery_date',
      'payment_terms',
      'delivery_terms',
      'delivery_mode',
      'transporter',
      'internal_remarks',
      'shipping_address',
      'billing_address',
      'customer_po_number',
      'customer_po_date',
      'terms_conditions',
    ];

    const updated = [];
    allowedUpdates.forEach(key => {
      if (body[key] !== undefined) {
        so[key] = body[key];
        updated.push(key);
      }
    });

    if (updated.length === 0) {
      return err(res, `No updatable fields provided. Allowed: ${allowedUpdates.join(', ')}`, 400);
    }

    so.updated_by = req.user._id;
    so.audit_log.push({
      changed_by: req.user._id,
      action:     'updated',
      notes:      `Fields updated: ${updated.join(', ')}`,
    });

    await so.save();
    return ok(res, { data: so });
  } catch (e) {
    console.error('[updateSalesOrder] Error:', e);
    if (e.name === 'ValidationError') {
      return err(res, Object.values(e.errors).map(v => v.message).join(', '), 400);
    }
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-orders/:id/confirm
// ─────────────────────────────────────────────────────────────────────────────
const confirmSalesOrder = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return err(res, 'Invalid Sales Order ID', 400);
    }

    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true });
    if (!so) return err(res, 'Sales Order not found', 404);

    if (so.status !== 'Draft') {
      return err(res, `Only Draft SOs can be confirmed. Current status: ${so.status}`, 400);
    }

    const customer = await Customer.findById(so.customer_id);
    if (customer) {
      const creditError = await checkCreditLimit(customer, so.grand_total, so._id);
      if (creditError) return err(res, creditError, 400);
    }

    const missingDates = so.items
      .filter(i => !i.is_cancelled)
      .filter(i => !i.committed_date && !so.expected_delivery_date);

    if (missingDates.length > 0) {
      console.warn(`[confirmSalesOrder] SO ${so.so_number}: ${missingDates.length} lines have no committed_date`);
    }

    so.status           = 'Confirmed';
    so.confirmed_at     = new Date();
    so.updated_by       = req.user._id;
    so.mrp_triggered    = false;
    so.mrp_triggered_at = null;

    so.audit_log.push({
      changed_by: req.user._id,
      action:     'status_change',
      old_value:  'Draft',
      new_value:  'Confirmed',
      notes:      'SO confirmed by sales team. MRP and WO creation ready.',
    });

    await so.save();

    return ok(res, {
      message: 'SO confirmed successfully. MRP and Work Order creation can now proceed.',
      data: so,
    });
  } catch (e) {
    console.error('[confirmSalesOrder] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ██  BE-010 — DELIVERY TRACKING SERVICE
// ─────────────────────────────────────────────────────────────────────────────

async function updateDeliveryQty(soId, lineItemId, dispatchedQty, dispatchDate) {
  const so = await SalesOrder.findById(soId);
  if (!so) throw new Error(`Sales Order ${soId} not found`);

  const line = so.items.id(lineItemId);
  if (!line) throw new Error(`Line item ${lineItemId} not found in SO ${so.so_number}`);
  if (line.is_cancelled) throw new Error(`Line item ${lineItemId} is cancelled — cannot dispatch`);

  const newDelivered = line.delivered_qty + Number(dispatchedQty);
  if (newDelivered > line.ordered_qty) {
    throw new Error(
      `Cannot dispatch ${dispatchedQty} units. ` +
      `Already delivered: ${line.delivered_qty}, ` +
      `Ordered: ${line.ordered_qty}, ` +
      `Pending: ${line.ordered_qty - line.delivered_qty}`
    );
  }

  line.delivered_qty = +newDelivered.toFixed(4);

  const pending = line.ordered_qty - line.delivered_qty;
  if (pending <= 0.0001) {
    line.item_status          = 'Delivered';
    line.actual_delivery_date = dispatchDate || new Date();
  } else {
    line.item_status = 'Partially Delivered';
  }

  const activeLines  = so.items.filter(i => !i.is_cancelled);
  const allDelivered = activeLines.every(i => i.item_status === 'Delivered');
  const anyDelivered = activeLines.some(i => i.delivered_qty > 0);

  const prevStatus = so.status;

  if (allDelivered) {
    so.status = 'Fully Delivered';
  } else if (anyDelivered) {
    so.status = 'Partially Delivered';
  }

  if (so.status !== prevStatus) {
    so.audit_log.push({
      changed_by: new mongoose.Types.ObjectId(),
      action:     'status_change',
      old_value:  prevStatus,
      new_value:  so.status,
      notes:      `Auto-cascade from DC dispatch of ${dispatchedQty} units on line ${lineItemId}`,
    });
  }

  await so.save();
  return so;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/:id/delivery-status
// ─────────────────────────────────────────────────────────────────────────────
const getDeliveryStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return err(res, 'Invalid Sales Order ID', 400);
    }

    const so = await SalesOrder.findById(req.params.id).lean({ virtuals: true });
    if (!so || !so.is_active) return err(res, 'Sales Order not found', 404);

    const today = new Date();
    const lines = so.items.map(item => {
      const pending   = Math.max(0, item.ordered_qty - item.delivered_qty);
      const isOverdue = item.committed_date
        && !['Delivered', 'Cancelled'].includes(item.item_status)
        && today > new Date(item.committed_date);

      let otif_flag;
      if (item.is_cancelled) {
        otif_flag = 'N/A';
      } else if (item.actual_delivery_date && item.committed_date) {
        otif_flag = new Date(item.actual_delivery_date) <= new Date(item.committed_date)
          ? 'On-Time' : 'Late';
      } else if (pending > 0) {
        otif_flag = isOverdue ? 'Late' : 'Pending';
      } else {
        otif_flag = 'N/A';
      }

      return {
        _id:                  item._id,
        part_no:              item.part_no,
        part_name:            item.part_name,
        ordered_qty:          item.ordered_qty,
        delivered_qty:        item.delivered_qty,
        pending_qty:          +pending.toFixed(4),
        item_status:          item.item_status,
        committed_date:       item.committed_date,
        required_date:        item.required_date,
        actual_delivery_date: item.actual_delivery_date,
        is_overdue:           isOverdue,
        otif_flag,
        is_cancelled:         item.is_cancelled,
      };
    });

    return ok(res, {
      data: {
        so_number: so.so_number,
        so_status: so.status,
        customer:  so.customer_name,
        lines,
        summary: {
          total_lines:   lines.length,
          delivered:     lines.filter(l => l.item_status === 'Delivered').length,
          partial:       lines.filter(l => l.item_status === 'Partially Delivered').length,
          pending:       lines.filter(l => l.item_status === 'Pending').length,
          cancelled:     lines.filter(l => l.is_cancelled).length,
          overdue:       lines.filter(l => l.is_overdue).length,
          on_time_lines: lines.filter(l => l.otif_flag === 'On-Time').length,
          late_lines:    lines.filter(l => l.otif_flag === 'Late').length,
        },
      },
    });
  } catch (e) {
    console.error('[getDeliveryStatus] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/order-book
// ─────────────────────────────────────────────────────────────────────────────
const getOrderBook = async (req, res) => {
  try {
    const today = new Date();
    const sos = await SalesOrder.find({
      is_active: true,
      status: { $in: ['Confirmed', 'In Production', 'Ready for Dispatch', 'Partially Delivered'] },
    })
      .populate('customer_id', 'customer_name customer_code')
      .select('so_number so_date customer_name customer_po_number status grand_total items confirmed_at')
      .lean({ virtuals: true });

    const orderBook = sos
      .map(so => {
        const pending_lines = so.items
          .filter(i => !i.is_cancelled && i.item_status !== 'Delivered')
          .map(i => {
            const pending    = Math.max(0, i.ordered_qty - i.delivered_qty);
            const isDelayed  = i.committed_date
              && new Date(i.committed_date) < today
              && pending > 0;
            const daysDelayed = isDelayed
              ? Math.floor((today - new Date(i.committed_date)) / 86400000)
              : 0;
            return {
              _id:            i._id,
              part_no:        i.part_no,
              part_name:      i.part_name,
              ordered_qty:    i.ordered_qty,
              delivered_qty:  i.delivered_qty,
              pending_qty:    +pending.toFixed(4),
              committed_date: i.committed_date,
              required_date:  i.required_date,
              item_status:    i.item_status,
              delay_flag:     isDelayed,
              days_delayed:   daysDelayed,
            };
          });

        return {
          so_number:          so.so_number,
          so_date:            so.so_date,
          customer:           so.customer_name,
          customer_po_number: so.customer_po_number,
          status:             so.status,
          grand_total:        so.grand_total,
          confirmed_at:       so.confirmed_at,
          pending_lines,
        };
      })
      .filter(so => so.pending_lines.length > 0);

    return ok(res, {
      count:    orderBook.length,
      as_of:    today,
      data:     orderBook,
    });
  } catch (e) {
    console.error('[getOrderBook] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/delivery-due
// ─────────────────────────────────────────────────────────────────────────────
const getDeliveryDue = async (req, res) => {
  try {
    const days  = Math.max(parseInt(req.query.days || '7'), 1);
    const today = new Date();
    const upto  = new Date(today.getTime() + days * 86400000);

    const sos = await SalesOrder.find({
      is_active: true,
      status:    { $in: ['Confirmed', 'In Production', 'Ready for Dispatch', 'Partially Delivered'] },
      'items.committed_date': { $gte: today, $lte: upto },
      'items.item_status':    { $nin: ['Delivered', 'Cancelled'] },
    })
      .select('so_number customer_name status items')
      .lean();

    const result = sos
      .map(so => ({
        so_number: so.so_number,
        customer:  so.customer_name,
        status:    so.status,
        due_lines: so.items.filter(i =>
          !i.is_cancelled &&
          i.item_status !== 'Delivered' &&
          i.committed_date &&
          new Date(i.committed_date) >= today &&
          new Date(i.committed_date) <= upto
        ).map(i => ({
          _id:            i._id,
          part_no:        i.part_no,
          part_name:      i.part_name,
          pending_qty:    Math.max(0, i.ordered_qty - i.delivered_qty),
          committed_date: i.committed_date,
          days_remaining: Math.floor((new Date(i.committed_date) - today) / 86400000),
          item_status:    i.item_status,
        })),
      }))
      .filter(so => so.due_lines.length > 0);

    return ok(res, {
      window_days: days,
      from:        today,
      to:          upto,
      count:       result.length,
      data:        result,
    });
  } catch (e) {
    console.error('[getDeliveryDue] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-orders/:id/cancel
// ─────────────────────────────────────────────────────────────────────────────
const cancelSalesOrder = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return err(res, 'Invalid Sales Order ID', 400);
    }

    const { cancellation_reason } = req.body;
    if (!cancellation_reason?.trim()) {
      return err(res, 'cancellation_reason is required', 400);
    }
    if (cancellation_reason.trim().length < 5) {
      return err(res, 'cancellation_reason must be at least 5 characters', 400);
    }

    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true });
    if (!so) return err(res, 'Sales Order not found', 404);

    if (['Cancelled', 'Closed'].includes(so.status)) {
      return err(res, `Cannot cancel SO in status: ${so.status}`, 400);
    }

    const prevStatus = so.status;

    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        so.status              = 'Cancelled';
        so.cancellation_reason = cancellation_reason.trim();
        so.updated_by          = req.user._id;

        so.audit_log.push({
          changed_by: req.user._id,
          action:     'status_change',
          old_value:  prevStatus,
          new_value:  'Cancelled',
          notes:      cancellation_reason.trim(),
        });

        await so.save({ session });

        let woCancelled = 0;
        let prCancelled = 0;
        let stockReleased = 0;

        try {
          const WorkOrder = mongoose.model('WorkOrder');
          const wores = await WorkOrder.updateMany(
            { so_id: so._id, status: { $in: ['Planned', 'Released', 'On Hold'] } },
            {
              $set: {
                status:       'Cancelled',
                cancelled_at: new Date(),
                cancel_reason: `SO ${so.so_number} cancelled: ${cancellation_reason.trim()}`,
              },
            },
            { session }
          );
          woCancelled = wores.modifiedCount;
        } catch (_) {}

        try {
          const PurchaseRequisition = mongoose.model('PurchaseRequisition');
          const prres = await PurchaseRequisition.updateMany(
            { so_id: so._id, status: { $in: ['Draft', 'Pending Approval'] } },
            { $set: { status: 'Cancelled', notes: `SO ${so.so_number} cancelled` } },
            { session }
          );
          prCancelled = prres.modifiedCount;
        } catch (_) {}

        try {
          const StockReservation = mongoose.model('StockReservation');
          const srres = await StockReservation.updateMany(
            { so_id: so._id, status: 'Reserved' },
            { $set: { status: 'Released', released_at: new Date() } },
            { session }
          );
          stockReleased = srres.modifiedCount;
        } catch (_) {}

        result = {
          so_number:    so.so_number,
          prev_status:  prevStatus,
          woCancelled,
          prCancelled,
          stockReleased,
        };
      });
    } finally {
      await session.endSession();
    }

    return ok(res, {
      message: `Sales Order ${result.so_number} cancelled successfully`,
      data:    result,
    });
  } catch (e) {
    console.error('[cancelSalesOrder] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/otif
// ─────────────────────────────────────────────────────────────────────────────
const getOtifKpi = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return err(res, 'Both from and to date parameters are required', 400);

    const fromDate = new Date(from);
    const toDate   = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return err(res, 'Invalid date format. Use YYYY-MM-DD', 400);
    }
    if (fromDate > toDate) {
      return err(res, 'from date must be before to date', 400);
    }

    const sos = await SalesOrder.find({
      is_active: true,
      'items.actual_delivery_date': { $gte: fromDate, $lte: toDate },
    }).lean();

    let totalLines = 0, onTimeLines = 0, inFullLines = 0, otifLines = 0;

    sos.forEach(so => {
      so.items.forEach(item => {
        if (!item.actual_delivery_date || item.is_cancelled) return;
        const delivered = new Date(item.actual_delivery_date);
        if (delivered < fromDate || delivered > toDate) return;

        totalLines++;
        const onTime = item.committed_date
          ? delivered <= new Date(item.committed_date)
          : false;
        const inFull = item.delivered_qty >= item.ordered_qty;

        if (onTime)           onTimeLines++;
        if (inFull)           inFullLines++;
        if (onTime && inFull) otifLines++;
      });
    });

    const pct = (n) => totalLines ? +((n / totalLines) * 100).toFixed(1) : 0;

    return ok(res, {
      data: {
        period: { from, to },
        total_lines:          totalLines,
        otif_lines:           otifLines,
        on_time_lines:        onTimeLines,
        in_full_lines:        inFullLines,
        otif_pct:             pct(otifLines),
        on_time_pct:          pct(onTimeLines),
        in_full_pct:          pct(inFullLines),
        benchmark_otif_pct:   95,
        is_meeting_benchmark: pct(otifLines) >= 95,
      },
    });
  } catch (e) {
    console.error('[getOtifKpi] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/:id/history
// ─────────────────────────────────────────────────────────────────────────────
const getSoHistory = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return err(res, 'Invalid Sales Order ID', 400);
    }

    const so = await SalesOrder.findById(req.params.id)
      .select('so_number status audit_log revisions current_revision')
      .populate('audit_log.changed_by', 'Username email')
      .lean();

    if (!so) return err(res, 'Sales Order not found', 404);

    return ok(res, {
      data: {
        so_number:      so.so_number,
        status:         so.status,
        current_revision: so.current_revision,
        revision_count: so.revisions?.length || 0,
        audit_log:      so.audit_log || [],
      },
    });
  } catch (e) {
    console.error('[getSoHistory] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ██  BE-011 — REVISION, ACKNOWLEDGEMENT & REPORTS
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-orders/:id/revise
// ─────────────────────────────────────────────────────────────────────────────
const reviseSalesOrder = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return err(res, 'Invalid Sales Order ID', 400);
    }

    const body = normaliseBody(req.body);
    const {
      reason,
      items: newItems,
      expected_delivery_date,
      payment_terms,
      delivery_terms,
      internal_remarks,
    } = body;

    if (!reason?.trim()) {
      return err(res, 'reason is required for revision', 400);
    }
    if (reason.trim().length < 5) {
      return err(res, 'reason must be at least 5 characters', 400);
    }

    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true });
    if (!so) return err(res, 'Sales Order not found', 404);

    if (['Cancelled', 'Closed'].includes(so.status)) {
      return err(res, `Cannot revise SO in status: ${so.status}`, 400);
    }

    const itemsSnapshot  = JSON.parse(JSON.stringify(so.items));
    const changesSummary = newItems ? buildDiff(so.items, newItems) : [];

    so.revisions.push({
      revision_no:     so.current_revision,
      revised_at:      new Date(),
      revised_by:      req.user._id,
      reason:          reason.trim(),
      changes_summary: changesSummary,
      items_snapshot:  itemsSnapshot,
    });
    so.current_revision += 1;

    if (Array.isArray(newItems) && newItems.length) {
      for (const ni of newItems) {
        const line = so.items.id(ni._id);
        if (!line) continue;

        if (ni.ordered_qty !== undefined) {
          const newQty = Number(ni.ordered_qty);
          if (newQty < line.delivered_qty) {
            return err(
              res,
              `Cannot reduce ordered_qty below delivered_qty (${line.delivered_qty}) for ${line.part_no}`,
              400
            );
          }
          if (newQty <= 0) {
            return err(res, `ordered_qty must be > 0 for ${line.part_no}`, 400);
          }
          line.ordered_qty = newQty;
        }
        if (ni.unit_price !== undefined) {
          const newPrice = Number(ni.unit_price);
          if (newPrice < 0) {
            return err(res, `unit_price cannot be negative for ${line.part_no}`, 400);
          }
          line.unit_price = newPrice;
        }
        if (ni.committed_date   !== undefined) line.committed_date   = ni.committed_date;
        if (ni.required_date    !== undefined) line.required_date    = ni.required_date;
        if (ni.discount_percent !== undefined) line.discount_percent = Number(ni.discount_percent);
        if (ni.remarks          !== undefined) line.remarks          = ni.remarks;
      }
    }

    if (expected_delivery_date) so.expected_delivery_date = new Date(expected_delivery_date);
    if (payment_terms)          so.payment_terms          = payment_terms;
    if (delivery_terms)         so.delivery_terms         = delivery_terms;
    if (internal_remarks)       so.internal_remarks       = internal_remarks;

    const qtyReduced = changesSummary.some(
      c => c.field === 'ordered_qty' && Number(c.new_value) < Number(c.old_value)
    );
    if (qtyReduced) so.mrp_rerun_required = true;

    so.audit_log.push({
      changed_by: req.user._id,
      action:     'revision',
      old_value:  `Rev ${so.current_revision - 1}`,
      new_value:  `Rev ${so.current_revision}`,
      notes:      reason.trim(),
    });
    so.updated_by = req.user._id;

    await so.save();

    return ok(res, {
      message: `SO revised to Revision ${so.current_revision}. ${qtyReduced ? 'MRP re-run flagged.' : ''}`,
      data: so,
    });
  } catch (e) {
    console.error('[reviseSalesOrder] Error:', e);
    if (e.name === 'ValidationError') {
      return err(res, Object.values(e.errors).map(v => v.message).join(', '), 400);
    }
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/:id/revisions
// ─────────────────────────────────────────────────────────────────────────────
const getSoRevisions = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return err(res, 'Invalid Sales Order ID', 400);
    }

    const so = await SalesOrder.findById(req.params.id)
      .select('so_number current_revision revisions status')
      .populate('revisions.revised_by', 'Username email')
      .lean();

    if (!so) return err(res, 'Sales Order not found', 404);

    return ok(res, {
      data: {
        so_number:        so.so_number,
        status:           so.status,
        current_revision: so.current_revision,
        total_revisions:  so.revisions?.length || 0,
        revisions:        so.revisions || [],
      },
    });
  } catch (e) {
    console.error('[getSoRevisions] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-orders/:id/acknowledge
// ─────────────────────────────────────────────────────────────────────────────
const acknowledgeSalesOrder = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return err(res, 'Invalid Sales Order ID', 400);
    }

    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true })
      .populate('customer_id', 'customer_name billing_address contacts customer_email gstin');

    if (!so) return err(res, 'Sales Order not found', 404);

    const allowedStatuses = [
      'Confirmed', 'In Production', 'Ready for Dispatch',
      'Partially Delivered', 'Fully Delivered',
    ];
    if (!allowedStatuses.includes(so.status)) {
      return err(
        res,
        `Acknowledgement can only be sent for Confirmed or later status. Current: ${so.status}`,
        400
      );
    }

    const company = await Company.findOne({ is_active: true });
    if (!company) return err(res, 'No active company found', 404);

    const custEmail = so.customer_id?.contacts?.find(c => c.is_primary)?.email
                   || req.body?.email
                   || '';

    const pdfBuffer = await generateAcknowledgementPDF(so, company);

    if (custEmail && process.env.SMTP_HOST && process.env.SMTP_USER) {
      try {
        const transporter = await getSmtpTransporter();
        await transporter.sendMail({
          from:    `"${company.company_name || 'Sales'}" <${process.env.SMTP_USER}>`,
          to:      custEmail,
          subject: `Order Acknowledgement — ${so.so_number}`,
          html: `
            <p>Dear ${so.customer_name},</p>
            <p>Thank you for your order. Please find our <strong>Order Acknowledgement</strong>
               for <strong>${so.so_number}</strong> attached.</p>
            <ul>
              <li>Your PO Number: ${so.customer_po_number || '—'}</li>
              <li>Order Date: ${new Date(so.so_date).toLocaleDateString('en-IN')}</li>
              <li>Order Value: ₹${so.grand_total?.toLocaleString('en-IN')}</li>
            </ul>
            <p>Regards,<br/>${company.company_name || ''}</p>
          `,
          attachments: [{
            filename: `${so.so_number}_Acknowledgement.pdf`,
            content:  pdfBuffer,
          }],
        });
      } catch (mailErr) {
        console.error('[acknowledgeSalesOrder] Email send failed:', mailErr.message);
      }
    }

    so.acknowledgement_sent_at = new Date();
    so.acknowledgement_email   = custEmail;
    so.audit_log.push({
      changed_by: req.user._id,
      action:     'acknowledgement_sent',
      new_value:  custEmail || '(no email configured)',
      notes:      custEmail ? `PDF sent to ${custEmail}` : 'PDF generated, no email sent (no recipient)',
    });
    so.updated_by = req.user._id;
    await so.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${so.so_number}_Acknowledgement.pdf"`);
    return res.send(pdfBuffer);

  } catch (e) {
    console.error('[acknowledgeSalesOrder] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PDF generator — Order Acknowledgement
// ─────────────────────────────────────────────────────────────────────────────
async function generateAcknowledgementPDF(so, company) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc    = new PDFDoc({ margin: 40, size: 'A4' });

    doc.on('data',  c  => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = 515;

    doc.fillColor('#1F3864').rect(40, 40, W, 36).fill();
    doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold')
       .text(company?.company_name || 'COMPANY', 50, 50, { align: 'center', width: W - 20 });

    doc.fillColor('#2E75B6').rect(40, 76, W, 20).fill();
    doc.fillColor('#FFFFFF').fontSize(9)
       .text(`GSTIN: ${company?.gstin || '—'}  |  ${company?.state || ''}`, 50, 81)
       .text('ORDER ACKNOWLEDGEMENT', 50, 81, { align: 'right', width: W - 20 });

    doc.moveDown(2);
    doc.fillColor('#000000');

    const metaY = 110;
    const leftCol = [
      ['SO Number:',      so.so_number],
      ['SO Date:',        new Date(so.so_date).toLocaleDateString('en-IN')],
      ['Customer PO No:', so.customer_po_number || '—'],
      ['PO Date:',        so.customer_po_date
        ? new Date(so.customer_po_date).toLocaleDateString('en-IN') : '—'],
    ];
    leftCol.forEach(([lbl, val], i) => {
      doc.fillColor('#F0F0F0').rect(40, metaY + i * 20, 140, 18).fill();
      doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(9)
         .text(lbl, 44, metaY + i * 20 + 4, { width: 132 });
      doc.fillColor('#000000').font('Helvetica')
         .text(String(val), 185, metaY + i * 20 + 4);
    });

    const rightCol = [
      ['Customer:',       so.customer_name],
      ['GSTIN:',          so.customer_gstin || '—'],
      ['Payment Terms:',  so.payment_terms  || '—'],
      ['Delivery Terms:', so.delivery_terms || '—'],
    ];
    rightCol.forEach(([lbl, val], i) => {
      doc.fillColor('#F0F0F0').rect(310, metaY + i * 20, 120, 18).fill();
      doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(9)
         .text(lbl, 314, metaY + i * 20 + 4, { width: 112 });
      doc.fillColor('#000000').font('Helvetica')
         .text(String(val), 435, metaY + i * 20 + 4, { width: 120 });
    });

    const tableY = metaY + 100;
    const cols = [
      { x: 40,  w: 25,  label: 'SR'           },
      { x: 65,  w: 75,  label: 'Part No.'      },
      { x: 140, w: 130, label: 'Description'   },
      { x: 270, w: 50,  label: 'Qty'           },
      { x: 320, w: 40,  label: 'Unit'          },
      { x: 360, w: 70,  label: 'Unit Price'    },
      { x: 430, w: 60,  label: 'Amount'        },
      { x: 490, w: 65,  label: 'Delivery Date' },
    ];

    doc.fillColor('#1F3864').rect(40, tableY, W, 20).fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    cols.forEach(c => doc.text(c.label, c.x + 3, tableY + 6, { width: c.w - 3 }));

    let y = tableY + 22;
    so.items.filter(i => !i.is_cancelled).forEach((item, idx) => {
      const bg = idx % 2 ? '#DCE6F1' : '#FFFFFF';
      doc.fillColor(bg).rect(40, y, W, 18).fill();
      doc.fillColor('#000000').font('Helvetica').fontSize(8);
      const dateStr = item.committed_date
        ? new Date(item.committed_date).toLocaleDateString('en-IN')
        : '—';
      doc.text(String(idx + 1),                               cols[0].x + 3, y + 4, { width: cols[0].w });
      doc.text(item.part_no,                                  cols[1].x + 3, y + 4, { width: cols[1].w });
      doc.text(item.part_name,                                cols[2].x + 3, y + 4, { width: cols[2].w });
      doc.text(String(item.ordered_qty),                      cols[3].x + 3, y + 4, { width: cols[3].w });
      doc.text(item.unit || 'Nos',                            cols[4].x + 3, y + 4, { width: cols[4].w });
      doc.text(`₹${Number(item.unit_price).toFixed(2)}`,     cols[5].x + 3, y + 4, { width: cols[5].w });
      doc.text(`₹${Number(item.total_amount).toFixed(2)}`,   cols[6].x + 3, y + 4, { width: cols[6].w });
      doc.text(dateStr,                                       cols[7].x + 3, y + 4, { width: cols[7].w });
      y += 18;
    });

    y += 10;
    [
      ['Sub Total:',    `₹${Number(so.sub_total).toFixed(2)}`],
      ['Discount:',     `₹${Number(so.discount_total).toFixed(2)}`],
      ['Taxable Total:',`₹${Number(so.taxable_total).toFixed(2)}`],
      ['GST Total:',    `₹${Number(so.gst_total).toFixed(2)}`],
    ].forEach(([lbl, val]) => {
      doc.fillColor('#F0F0F0').rect(350, y, W - 310, 18).fill();
      doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(9)
         .text(lbl, 355, y + 4)
         .text(val,  470, y + 4, { align: 'right', width: 75 });
      y += 20;
    });

    doc.fillColor('#ED7D31').rect(350, y, W - 310, 22).fill();
    doc.fillColor('#FFFFFF').fontSize(10)
       .text('GRAND TOTAL:', 355, y + 5)
       .text(`₹${Number(so.grand_total).toFixed(2)}`, 470, y + 5, { align: 'right', width: 75 });
    y += 36;

    if (so.terms_conditions?.length) {
      doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(9).text('TERMS & CONDITIONS', 40, y);
      y += 14;
      so.terms_conditions.slice(0, 5).forEach((tc, i) => {
        doc.fillColor('#000000').font('Helvetica').fontSize(8)
           .text(`${i + 1}. ${tc.Description || tc.Title || ''}`, 44, y, { width: W });
        y += 14;
      });
    }

    y += 30;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000')
       .text('Authorised Signature (Customer)', 40,  y)
       .text(`For ${company?.company_name || ''}`,   380, y);

    y += 40;
    doc.font('Helvetica').fontSize(8).fillColor('#888888')
       .text('This is a computer-generated acknowledgement.', 40, y, { align: 'center', width: W });

    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/reports/summary
// ─────────────────────────────────────────────────────────────────────────────
const getReportSummary = async (req, res) => {
  try {
    const { from, to } = req.query;
    const match = { is_active: true, status: { $nin: ['Cancelled'] } };

    if (from || to) {
      match.so_date = {};
      if (from) match.so_date.$gte = new Date(from);
      if (to)   match.so_date.$lte = new Date(to);
    }

    const [byCustomer, byMonth, byStatus, total] = await Promise.all([
      SalesOrder.aggregate([
        { $match: match },
        { $group: {
          _id:           '$customer_id',
          customer_name: { $first: '$customer_name' },
          so_count:      { $sum: 1 },
          total_value:   { $sum: '$grand_total' },
        }},
        { $sort: { total_value: -1 } },
        { $limit: 20 },
      ]),

      SalesOrder.aggregate([
        { $match: match },
        { $group: {
          _id:         { y: { $year: '$so_date' }, m: { $month: '$so_date' } },
          so_count:    { $sum: 1 },
          total_value: { $sum: '$grand_total' },
        }},
        { $sort: { '_id.y': -1, '_id.m': -1 } },
        { $limit: 12 },
      ]),

      SalesOrder.aggregate([
        { $match: { is_active: true } },
        { $group: {
          _id:   '$status',
          count: { $sum: 1 },
          value: { $sum: '$grand_total' },
        }},
        { $sort: { count: -1 } },
      ]),

      SalesOrder.aggregate([
        { $match: match },
        { $group: {
          _id:   null,
          count: { $sum: 1 },
          value: { $sum: '$grand_total' },
        }},
      ]),
    ]);

    return ok(res, {
      data: {
        period:      { from: from || null, to: to || null },
        by_customer: byCustomer,
        by_month:    byMonth,
        by_status:   byStatus,
        total:       total[0] || { count: 0, value: 0 },
      },
    });
  } catch (e) {
    console.error('[getReportSummary] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/reports/pending-delivery
// ─────────────────────────────────────────────────────────────────────────────
const getReportPendingDelivery = async (req, res) => {
  try {
    const sos = await SalesOrder.find({
      is_active: true,
      status: { $in: ['Confirmed', 'In Production', 'Ready for Dispatch', 'Partially Delivered'] },
    })
      .select('so_number customer_id customer_name status grand_total items')
      .lean();

    const byCustomer = {};

    sos.forEach(so => {
      const pendingLines = so.items.filter(
        i => !i.is_cancelled && i.item_status !== 'Delivered'
      );
      if (!pendingLines.length) return;

      const key = String(so.customer_id);
      if (!byCustomer[key]) {
        byCustomer[key] = {
          customer_name:       so.customer_name,
          orders:              [],
          total_pending_value: 0,
        };
      }

      const pendingValue = pendingLines.reduce(
        (s, i) => s + (Math.max(0, i.ordered_qty - i.delivered_qty) * i.unit_price),
        0
      );

      byCustomer[key].orders.push({
        so_number:    so.so_number,
        status:       so.status,
        so_value:     so.grand_total,
        pending_lines: pendingLines.map(i => ({
          _id:            i._id,
          part_no:        i.part_no,
          part_name:      i.part_name,
          ordered_qty:    i.ordered_qty,
          delivered_qty:  i.delivered_qty,
          pending_qty:    Math.max(0, i.ordered_qty - i.delivered_qty),
          unit_price:     i.unit_price,
          committed_date: i.committed_date,
          item_status:    i.item_status,
        })),
        pending_value: +pendingValue.toFixed(2),
      });

      byCustomer[key].total_pending_value += pendingValue;
    });

    Object.values(byCustomer).forEach(c => {
      c.total_pending_value = +c.total_pending_value.toFixed(2);
    });

    return ok(res, {
      count: Object.keys(byCustomer).length,
      data:  Object.values(byCustomer),
    });
  } catch (e) {
    console.error('[getReportPendingDelivery] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-orders/:id/cancel-line/:lineItemId
// ─────────────────────────────────────────────────────────────────────────────
const cancelSoLineItem = async (req, res) => {
  try {
    const { lineItemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return err(res, 'Invalid Sales Order ID', 400);
    }
    if (!mongoose.Types.ObjectId.isValid(lineItemId)) {
      return err(res, 'Invalid Line Item ID', 400);
    }

    const { cancel_reason } = req.body;
    if (!cancel_reason?.trim()) {
      return err(res, 'cancel_reason is required', 400);
    }

    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true });
    if (!so) return err(res, 'Sales Order not found', 404);

    if (['Cancelled', 'Closed'].includes(so.status)) {
      return err(res, `Cannot cancel a line item on SO in status: ${so.status}`, 400);
    }

    const line = so.items.id(lineItemId);
    if (!line) {
      return err(res, 'Line item not found on this Sales Order', 404);
    }
    if (line.is_cancelled) {
      return err(res, 'Line item is already cancelled', 400);
    }
    if (line.delivered_qty > 0) {
      return err(
        res,
        `Cannot cancel line item — it already has ${line.delivered_qty} units delivered`,
        400
      );
    }

    line.is_cancelled  = true;
    line.item_status   = 'Cancelled';
    line.cancelled_at  = new Date();
    line.cancel_reason = cancel_reason.trim();

    so.audit_log.push({
      changed_by: req.user._id,
      action:     'line_item_cancelled',
      new_value:  `${line.part_no} (${lineItemId})`,
      notes:      cancel_reason.trim(),
    });
    so.updated_by = req.user._id;

    await so.save();

    return ok(res, {
      message: `Line item ${line.part_no} cancelled successfully`,
      data:    so,
    });
  } catch (e) {
    console.error('[cancelSoLineItem] Error:', e);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  uploadPoFile,
  updateDeliveryQty,
  createSalesOrder,
  getSalesOrders,
  getSalesOrderById,
  updateSalesOrder,
  confirmSalesOrder,
  getDeliveryStatus,
  getOrderBook,
  getDeliveryDue,
  cancelSalesOrder,
  getOtifKpi,
  getSoHistory,
  reviseSalesOrder,
  getSoRevisions,
  acknowledgeSalesOrder,
  cancelSoLineItem,
  getReportSummary,
  getReportPendingDelivery,
};