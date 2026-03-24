'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// salesOrderController.js  — BE-010 + BE-011
//
// Covers:
//   BE-010: Delivery Tracking & Status Cascade
//   BE-011: Revision, Acknowledgement & Reports
// ─────────────────────────────────────────────────────────────────────────────

const mongoose  = require('mongoose');
const PDFDoc    = require('pdfkit');
const nodemailer= require('nodemailer');
const multer = require('multer');
const path = require('path');
const { SalesOrder, SO_STATUS_TRANSITIONS } = require('../../models/CRM/SalesOrder');
const Customer  = require('../../models/CRM/Customer');
const Company = require('../../models/user\'s & setting\'s/Company');
const ok  = (res, data, code = 200) => res.status(code).json({ success: true,  ...data });
const err = (res, msg,  code = 500) => res.status(code).json({ success: false, message: msg });

// ─── Multer configuration for PO file upload ─────────────────────────────────
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/po_files/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'po-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, JPEG, PNG, and TIFF are allowed.'), false);
  }
};

const uploadPoFile = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: fileFilter
}).single('customer_po_file');

// ─── helpers ─────────────────────────────────────────────────────────────────
function buildDiff(oldItems, newItems) {
  const changes = [];
  const oldMap  = Object.fromEntries(oldItems.map(i => [String(i._id), i]));
  newItems.forEach(ni => {
    const oi = oldMap[String(ni._id)];
    if (!oi) return;
    ['ordered_qty','unit_price','committed_date','required_date','discount_percent'].forEach(f => {
      const ov = oi[f]?.toString?.() ?? oi[f];
      const nv = ni[f]?.toString?.() ?? ni[f];
      if (ov !== nv) changes.push({ field: f, old_value: oi[f], new_value: ni[f] });
    });
  });
  return changes;
}

async function getSmtpTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ██████  BE-010 — DELIVERY TRACKING SERVICE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * updateDeliveryQty — called by Delivery Challan controller on every DC creation.
 * Increments delivered_qty on the SO line, cascades item_status, then cascades SO status.
 *
 * @param {string} soId         — SalesOrder._id
 * @param {string} lineItemId   — SalesOrder.items._id
 * @param {number} dispatchedQty
 * @param {Date}   dispatchDate  — actual dispatch date for OTIF
 */
async function updateDeliveryQty(soId, lineItemId, dispatchedQty, dispatchDate) {
  const so = await SalesOrder.findById(soId);
  if (!so) throw new Error(`Sales Order ${soId} not found`);

  const line = so.items.id(lineItemId);
  if (!line) throw new Error(`Line item ${lineItemId} not found in SO ${so.so_number}`);
  if (line.is_cancelled) throw new Error(`Line item ${lineItemId} is cancelled`);

  // Guard: delivered_qty must never exceed ordered_qty
  const newDelivered = line.delivered_qty + dispatchedQty;
  if (newDelivered > line.ordered_qty) {
    throw new Error(
      `Cannot dispatch ${dispatchedQty}. ` +
      `Pending: ${line.ordered_qty - line.delivered_qty}, Ordered: ${line.ordered_qty}`
    );
  }

  // Update delivered
  line.delivered_qty = +newDelivered.toFixed(4);

  // Line item status cascade
  const pending = line.ordered_qty - line.delivered_qty;
  if (pending <= 0.0001) {
    line.item_status         = 'Delivered';
    line.actual_delivery_date= dispatchDate || new Date();
  } else {
    line.item_status = 'Partially Delivered';
  }

  // SO-level status cascade
  const activeLines = so.items.filter(i => !i.is_cancelled);
  const allDelivered= activeLines.every(i => i.item_status === 'Delivered');
  const anyDelivered= activeLines.some(i => i.delivered_qty > 0);

  const prevStatus = so.status;
  if (allDelivered) {
    so.status = 'Fully Delivered';
  } else if (anyDelivered) {
    so.status = 'Partially Delivered';
  }

  if (so.status !== prevStatus) {
    so.audit_log.push({
      changed_by: new mongoose.Types.ObjectId(),  // system
      action:     'status_change',
      old_value:  prevStatus,
      new_value:  so.status,
      notes:      `Auto-cascaded from DC dispatch of ${dispatchedQty} units`,
    });
  }

  await so.save();
  return so;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/:id/delivery-status  (BE-010 §4)
// ─────────────────────────────────────────────────────────────────────────────
const getDeliveryStatus = async (req, res) => {
  try {
    const so = await SalesOrder.findById(req.params.id).lean({ virtuals: true });
    if (!so || !so.is_active) return err(res, 'Sales Order not found', 404);

    const lines = so.items.map(item => {
      const pending   = Math.max(0, item.ordered_qty - item.delivered_qty);
      const isOverdue = item.committed_date && !['Delivered','Cancelled'].includes(item.item_status)
        && new Date() > new Date(item.committed_date);
      const otif = item.actual_delivery_date && item.committed_date
        ? new Date(item.actual_delivery_date) <= new Date(item.committed_date)
          ? 'On-Time' : 'Late'
        : pending > 0 ? (isOverdue ? 'Late' : 'Pending') : 'N/A';

      return {
        _id:           item._id,
        part_no:       item.part_no,
        part_name:     item.part_name,
        ordered_qty:   item.ordered_qty,
        delivered_qty: item.delivered_qty,
        pending_qty:   pending,
        item_status:   item.item_status,
        committed_date:item.committed_date,
        required_date: item.required_date,
        actual_delivery_date: item.actual_delivery_date,
        is_overdue:    isOverdue,
        otif_flag:     otif,
        is_cancelled:  item.is_cancelled,
      };
    });

    ok(res, {
      data: {
        so_number:  so.so_number,
        so_status:  so.status,
        customer:   so.customer_name,
        lines,
        summary: {
          total_lines:    lines.length,
          delivered:      lines.filter(l => l.item_status === 'Delivered').length,
          partial:        lines.filter(l => l.item_status === 'Partially Delivered').length,
          pending:        lines.filter(l => l.item_status === 'Pending').length,
          overdue:        lines.filter(l => l.is_overdue).length,
          on_time_lines:  lines.filter(l => l.otif_flag === 'On-Time').length,
        },
      },
    });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/order-book  (BE-010 §6)
// All confirmed SOs with pending lines + delay flag
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

    const orderBook = sos.map(so => ({
      so_number:          so.so_number,
      so_date:            so.so_date,
      customer:           so.customer_name,
      customer_po_number: so.customer_po_number,
      status:             so.status,
      grand_total:        so.grand_total,
      pending_lines: so.items
        .filter(i => !i.is_cancelled && i.item_status !== 'Delivered')
        .map(i => {
          const pending   = Math.max(0, i.ordered_qty - i.delivered_qty);
          const isDelayed = i.committed_date && new Date(i.committed_date) < today && pending > 0;
          return {
            _id:           i._id,
            part_no:       i.part_no,
            part_name:     i.part_name,
            ordered_qty:   i.ordered_qty,
            delivered_qty: i.delivered_qty,
            pending_qty:   pending,
            committed_date:i.committed_date,
            required_date: i.required_date,
            item_status:   i.item_status,
            delay_flag:    isDelayed,
            days_delayed:  isDelayed
              ? Math.floor((today - new Date(i.committed_date)) / 86400000)
              : 0,
          };
        }),
    })).filter(so => so.pending_lines.length > 0);

    ok(res, { count: orderBook.length, data: orderBook });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/delivery-due?days=7  (BE-010 §7)
// ─────────────────────────────────────────────────────────────────────────────
const getDeliveryDue = async (req, res) => {
  try {
    const days  = parseInt(req.query.days || '7');
    const today = new Date();
    const upto  = new Date(today.getTime() + days * 86400000);

    const sos = await SalesOrder.find({
      is_active: true,
      status: { $in: ['Confirmed', 'In Production', 'Ready for Dispatch', 'Partially Delivered'] },
      'items.committed_date': { $gte: today, $lte: upto },
      'items.item_status':    { $nin: ['Delivered', 'Cancelled'] },
    })
    .select('so_number customer_name status items')
    .lean();

    const result = sos.map(so => ({
      so_number:    so.so_number,
      customer:     so.customer_name,
      status:       so.status,
      due_lines: so.items.filter(i =>
        !i.is_cancelled &&
        i.item_status !== 'Delivered' &&
        i.committed_date &&
        new Date(i.committed_date) >= today &&
        new Date(i.committed_date) <= upto
      ).map(i => ({
        part_no:        i.part_no,
        part_name:      i.part_name,
        pending_qty:    Math.max(0, i.ordered_qty - i.delivered_qty),
        committed_date: i.committed_date,
        days_remaining: Math.floor((new Date(i.committed_date) - today) / 86400000),
        item_status:    i.item_status,
      })),
    })).filter(so => so.due_lines.length > 0);

    ok(res, { window_days: days, count: result.length, data: result });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-orders/:id/cancel  (BE-010 §8)
// Cancels SO, cascades to WOs + PRs + stock reservations
// ─────────────────────────────────────────────────────────────────────────────
const cancelSalesOrder = async (req, res) => {
  try {
    const { cancellation_reason } = req.body;
    if (!cancellation_reason?.trim()) return err(res, 'cancellation_reason is required', 400);

    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true });
    if (!so) return err(res, 'Sales Order not found', 404);
    if (['Cancelled', 'Closed'].includes(so.status)) {
      return err(res, `Cannot cancel SO in status: ${so.status}`, 400);
    }

    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        // Cancel SO
        so.status              = 'Cancelled';
        so.cancellation_reason = cancellation_reason.trim();
        so.updated_by          = req.user._id;
        so.audit_log.push({
          changed_by: req.user._id,
          action:     'status_change',
          old_value:  so.status,
          new_value:  'Cancelled',
          notes:      cancellation_reason.trim(),
        });
        await so.save({ session });

        // Cascade: cancel open Work Orders
        let woCancelled = 0;
        try {
          const WorkOrder = mongoose.model('WorkOrder');
          const wores = await WorkOrder.updateMany(
            { so_id: so._id, status: { $in: ['Planned', 'Released', 'On Hold'] } },
            { $set: { status: 'Cancelled', cancelled_at: new Date(), cancel_reason: `SO ${so.so_number} cancelled` } },
            { session }
          );
          woCancelled = wores.modifiedCount;
        } catch (_) {} // WO model may not exist yet in this phase

        // Cascade: cancel unapproved PRs
        let prCancelled = 0;
        try {
          const PurchaseRequisition = mongoose.model('PurchaseRequisition');
          const prres = await PurchaseRequisition.updateMany(
            { so_id: so._id, status: { $in: ['Draft', 'Pending Approval'] } },
            { $set: { status: 'Cancelled', notes: `SO ${so.so_number} cancelled` } },
            { session }
          );
          prCancelled = prres.modifiedCount;
        } catch (_) {}

        // Cascade: release stock reservations
        let stockReleased = 0;
        try {
          const StockReservation = mongoose.model('StockReservation');
          const srres = await StockReservation.updateMany(
            { so_id: so._id, status: 'Reserved' },
            { $set: { status: 'Released', released_at: new Date() } },
            { session }
          );
          stockReleased = srres.modifiedCount;
        } catch (_) {}

        result = { so_number: so.so_number, woCancelled, prCancelled, stockReleased };
      });
    } finally {
      session.endSession();
    }

    ok(res, { message: 'Sales Order cancelled', data: result });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/otif?from=&to=  (BE-010 §9)
// ─────────────────────────────────────────────────────────────────────────────
const getOtifKpi = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return err(res, 'from and to dates are required', 400);
    const fromDate = new Date(from);
    const toDate   = new Date(to);

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

        if (onTime)          onTimeLines++;
        if (inFull)          inFullLines++;
        if (onTime && inFull) otifLines++;
      });
    });

    const otif_pct    = totalLines ? +((otifLines / totalLines) * 100).toFixed(1) : 0;
    const on_time_pct = totalLines ? +((onTimeLines / totalLines) * 100).toFixed(1) : 0;
    const in_full_pct = totalLines ? +((inFullLines / totalLines) * 100).toFixed(1) : 0;

    ok(res, {
      data: {
        period: { from, to },
        total_lines:  totalLines,
        otif_lines:   otifLines,
        on_time_lines:onTimeLines,
        in_full_lines:inFullLines,
        otif_pct,
        on_time_pct,
        in_full_pct,
        benchmark_otif_pct: 95,
        is_meeting_benchmark: otif_pct >= 95,
      },
    });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/:id/history  (BE-010 §10)
// ─────────────────────────────────────────────────────────────────────────────
const getSoHistory = async (req, res) => {
  try {
    const so = await SalesOrder.findById(req.params.id)
      .select('so_number status audit_log revisions')
      .populate('audit_log.changed_by', 'Username email')
      .lean();
    if (!so) return err(res, 'Sales Order not found', 404);
    ok(res, { data: { so_number: so.so_number, status: so.status, audit_log: so.audit_log, revision_count: so.revisions?.length || 0 } });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// ██████  BE-011 — REVISION, ACKNOWLEDGEMENT & REPORTS
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-orders/:id/revise  (BE-011 §1)
// ─────────────────────────────────────────────────────────────────────────────
const reviseSalesOrder = async (req, res) => {
  try {
    const { reason, items: newItems, expected_delivery_date, payment_terms, delivery_terms, internal_remarks } = req.body;
    if (!reason?.trim()) return err(res, 'reason is required for revision', 400);

    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true });
    if (!so) return err(res, 'Sales Order not found', 404);
    if (['Cancelled', 'Closed'].includes(so.status)) {
      return err(res, `Cannot revise SO in status: ${so.status}`, 400);
    }

    // Snapshot current items before change
    const itemsSnapshot = JSON.parse(JSON.stringify(so.items));
    const changesSummary = newItems ? buildDiff(so.items, newItems) : [];

    // Push revision history
    so.revisions.push({
      revision_no:     so.current_revision,
      revised_at:      new Date(),
      revised_by:      req.user._id,
      reason:          reason.trim(),
      changes_summary: changesSummary,
      items_snapshot:  itemsSnapshot,
    });
    so.current_revision += 1;

    // Apply changes to items
    if (newItems?.length) {
      newItems.forEach(ni => {
        const line = so.items.id(ni._id);
        if (!line) return;
        if (ni.ordered_qty !== undefined) {
          if (ni.ordered_qty < line.delivered_qty) {
            throw new Error(`Cannot reduce ordered_qty below delivered_qty (${line.delivered_qty}) for ${line.part_no}`);
          }
          line.ordered_qty = ni.ordered_qty;
        }
        if (ni.committed_date !== undefined) line.committed_date = ni.committed_date;
        if (ni.required_date  !== undefined) line.required_date  = ni.required_date;
        if (ni.discount_percent !== undefined) line.discount_percent = ni.discount_percent;
      });
    }

    // Apply header changes
    if (expected_delivery_date) so.expected_delivery_date = new Date(expected_delivery_date);
    if (payment_terms)          so.payment_terms          = payment_terms;
    if (delivery_terms)         so.delivery_terms         = delivery_terms;
    if (internal_remarks)       so.internal_remarks       = internal_remarks;

    // Credit limit re-validation
    const customer = await Customer.findById(so.customer_id);
    if (customer?.credit_limit > 0) {
      const openSOs = await SalesOrder.aggregate([
        { $match: { customer_id: so.customer_id, _id: { $ne: so._id }, is_active: true, status: { $nin: ['Cancelled', 'Closed'] } } },
        { $group: { _id: null, total: { $sum: '$grand_total' } } },
      ]);
      const openValue = openSOs[0]?.total || 0;
      if (openValue + so.grand_total > customer.credit_limit) {
        so.mrp_rerun_required = true;
      }
    }

    // Flag MRP rerun if qty changed downward
    if (changesSummary.some(c => c.field === 'ordered_qty' && c.new_value < c.old_value)) {
      so.mrp_rerun_required = true;
    }

    so.audit_log.push({
      changed_by: req.user._id,
      action:     'revision',
      old_value:  `Revision ${so.current_revision - 1}`,
      new_value:  `Revision ${so.current_revision}`,
      notes:      reason.trim(),
    });
    so.updated_by = req.user._id;
    await so.save();

    ok(res, { message: `SO revised to Rev ${so.current_revision}`, data: so });
  } catch (e) {
    if (e.message.includes('Cannot reduce')) return err(res, e.message, 400);
    err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/:id/revisions  (BE-011 §3)
// ─────────────────────────────────────────────────────────────────────────────
const getSoRevisions = async (req, res) => {
  try {
    const so = await SalesOrder.findById(req.params.id)
      .select('so_number current_revision revisions')
      .populate('revisions.revised_by', 'Username email')
      .lean();
    if (!so) return err(res, 'Sales Order not found', 404);
    ok(res, { data: { so_number: so.so_number, current_revision: so.current_revision, revisions: so.revisions } });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-orders/:id/acknowledge  — PDF + email  (BE-011 §4)
// ─────────────────────────────────────────────────────────────────────────────
const acknowledgeSalesOrder = async (req, res) => {
  try {
    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true })
      .populate('customer_id', 'customer_name billing_address contacts customer_email');
    if (!so) return err(res, 'Sales Order not found', 404);
    if (!['Confirmed', 'In Production', 'Ready for Dispatch', 'Partially Delivered', 'Fully Delivered'].includes(so.status)) {
      return err(res, 'Acknowledgement can only be sent for Confirmed or later status', 400);
    }

    const company = await Company.findOne({ is_active: true });
    const custEmail = so.customer_id?.contacts?.find(c => c.is_primary)?.email || req.body.email || '';

    // Generate PDF buffer
    const pdfBuffer = await generateAcknowledgementPDF(so, company);

    // Send email if address available
    if (custEmail && process.env.SMTP_HOST) {
      const transporter = await getSmtpTransporter();
      await transporter.sendMail({
        from:    `${company?.company_name||'Sales'} <${process.env.SMTP_USER}>`,
        to:      custEmail,
        subject: `Order Acknowledgement — ${so.so_number}`,
        html:    `<p>Dear ${so.customer_name},</p>
                  <p>Thank you for your order. Please find our Order Acknowledgement for <strong>${so.so_number}</strong> attached.</p>
                  <p>Your PO Number: ${so.customer_po_number || '—'}</p>
                  <p>Order Value: ₹${so.grand_total?.toLocaleString('en-IN')}</p>
                  <p>Regards,<br/>${company?.company_name||''}</p>`,
        attachments: [{ filename: `${so.so_number}_Acknowledgement.pdf`, content: pdfBuffer }],
      });
    }

    so.acknowledgement_sent_at = new Date();
    so.acknowledgement_email   = custEmail;
    so.audit_log.push({ changed_by: req.user._id, action: 'acknowledgement_sent', new_value: custEmail });
    so.updated_by = req.user._id;
    await so.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${so.so_number}_Acknowledgement.pdf"`);
    res.send(pdfBuffer);
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// PDF generator — Order Acknowledgement
// ─────────────────────────────────────────────────────────────────────────────
async function generateAcknowledgementPDF(so, company) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc    = new PDFDoc({ margin: 40, size: 'A4' });

    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = 515;
    // Header
    doc.fillColor('#1F3864').rect(40, 40, W, 36).fill();
    doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold')
       .text(company?.company_name || 'COMPANY', 50, 50, { align: 'center', width: W - 20 });

    doc.fillColor('#2E75B6').rect(40, 76, W, 20).fill();
    doc.fillColor('#FFFFFF').fontSize(9)
       .text(`GSTIN: ${company?.gstin || ''}  |  ${company?.state || ''}`, 50, 80)
       .text('ORDER ACKNOWLEDGEMENT', 50, 80, { align: 'right', width: W - 20 });

    doc.moveDown(2);
    doc.fillColor('#000000');

    // Meta block
    const metaY = 110;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#1F3864');
    [
      ['SO Number:', so.so_number],
      ['SO Date:', new Date(so.so_date).toLocaleDateString('en-IN')],
      ['Customer PO No.:', so.customer_po_number || '—'],
      ['PO Date:', so.customer_po_date ? new Date(so.customer_po_date).toLocaleDateString('en-IN') : '—'],
    ].forEach(([lbl, val], i) => {
      doc.fillColor('#F0F0F0').rect(40, metaY + i * 20, 140, 18).fill();
      doc.fillColor('#1F3864').font('Helvetica-Bold').text(lbl, 44, metaY + i * 20 + 4, { width: 132 });
      doc.fillColor('#000000').font('Helvetica').text(val, 185, metaY + i * 20 + 4);
    });
    [
      ['Customer:', so.customer_name],
      ['GSTIN:', so.customer_gstin || '—'],
      ['Payment Terms:', so.payment_terms || '—'],
      ['Delivery Terms:', so.delivery_terms || '—'],
    ].forEach(([lbl, val], i) => {
      doc.fillColor('#F0F0F0').rect(310, metaY + i * 20, 120, 18).fill();
      doc.fillColor('#1F3864').font('Helvetica-Bold').text(lbl, 314, metaY + i * 20 + 4, { width: 112 });
      doc.fillColor('#000000').font('Helvetica').text(val, 435, metaY + i * 20 + 4, { width: 120 });
    });

    // Items table
    const tableY = metaY + 100;
    doc.fillColor('#1F3864').rect(40, tableY, W, 20).fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    const cols = [
      { x: 40,  w: 25,  label: 'SR' },
      { x: 65,  w: 75,  label: 'Part No.' },
      { x: 140, w: 130, label: 'Description' },
      { x: 270, w: 50,  label: 'Qty' },
      { x: 320, w: 40,  label: 'Unit' },
      { x: 360, w: 70,  label: 'Unit Price' },
      { x: 430, w: 60,  label: 'Amount' },
      { x: 490, w: 65,  label: 'Delivery Date' },
    ];
    cols.forEach(c => doc.text(c.label, c.x + 3, tableY + 6, { width: c.w - 3 }));

    let y = tableY + 22;
    so.items.filter(i => !i.is_cancelled).forEach((item, idx) => {
      const bg = idx % 2 ? '#DCE6F1' : '#FFFFFF';
      doc.fillColor(bg).rect(40, y, W, 18).fill();
      doc.fillColor('#000000').font('Helvetica').fontSize(8);
      const date = item.committed_date ? new Date(item.committed_date).toLocaleDateString('en-IN') : '—';
      doc.text(String(idx + 1),         cols[0].x + 3, y + 4, { width: cols[0].w });
      doc.text(item.part_no,            cols[1].x + 3, y + 4, { width: cols[1].w });
      doc.text(item.part_name,          cols[2].x + 3, y + 4, { width: cols[2].w });
      doc.text(String(item.ordered_qty),cols[3].x + 3, y + 4, { width: cols[3].w });
      doc.text(item.unit,               cols[4].x + 3, y + 4, { width: cols[4].w });
      doc.text(`₹${item.unit_price?.toFixed(2)}`, cols[5].x + 3, y + 4, { width: cols[5].w });
      doc.text(`₹${item.total_amount?.toFixed(2)}`, cols[6].x + 3, y + 4, { width: cols[6].w });
      doc.text(date,                    cols[7].x + 3, y + 4, { width: cols[7].w });
      y += 18;
    });

    // Totals
    y += 10;
    doc.fillColor('#F0F0F0').rect(350, y, W - 310, 18).fill();
    doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(9)
       .text('Sub Total:', 355, y + 4).text(`₹${so.sub_total?.toFixed(2)}`, 470, y + 4, { align: 'right', width: 75 });
    y += 20;
    doc.fillColor('#F0F0F0').rect(350, y, W - 310, 18).fill();
    doc.text(`GST:`, 355, y + 4).text(`₹${so.gst_total?.toFixed(2)}`, 470, y + 4, { align: 'right', width: 75 });
    y += 20;
    doc.fillColor('#ED7D31').rect(350, y, W - 310, 22).fill();
    doc.fillColor('#FFFFFF').fontSize(10)
       .text('GRAND TOTAL:', 355, y + 5).text(`₹${so.grand_total?.toFixed(2)}`, 470, y + 5, { align: 'right', width: 75 });
    y += 36;

    // T&C
    if (so.terms_conditions?.length) {
      doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(9).text('TERMS & CONDITIONS', 40, y);
      y += 14;
      so.terms_conditions.slice(0, 5).forEach((tc, i) => {
        doc.fillColor('#000000').font('Helvetica').fontSize(8).text(`${i + 1}. ${tc.Description || tc.Title || ''}`, 44, y, { width: W });
        y += 14;
      });
    }

    y += 30;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000')
       .text('Customer Signature', 40, y)
       .text(`For ${company?.company_name || ''}`, 380, y);

    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/reports/summary  (BE-011 §6)
// ─────────────────────────────────────────────────────────────────────────────
const getReportSummary = async (req, res) => {
  try {
    const { from, to, group_by = 'customer' } = req.query;
    const match = { is_active: true, status: { $nin: ['Cancelled'] } };
    if (from || to) {
      match.so_date = {};
      if (from) match.so_date.$gte = new Date(from);
      if (to)   match.so_date.$lte = new Date(to);
    }

    // By customer
    const byCustomer = await SalesOrder.aggregate([
      { $match: match },
      { $group: { _id: '$customer_id', customer_name: { $first: '$customer_name' }, so_count: { $sum: 1 }, total_value: { $sum: '$grand_total' } } },
      { $sort: { total_value: -1 } },
      { $limit: 20 },
    ]);

    // By month
    const byMonth = await SalesOrder.aggregate([
      { $match: match },
      { $group: { _id: { y: { $year: '$so_date' }, m: { $month: '$so_date' } }, so_count: { $sum: 1 }, total_value: { $sum: '$grand_total' } } },
      { $sort: { '_id.y': -1, '_id.m': -1 } },
      { $limit: 12 },
    ]);

    // Total
    const total = await SalesOrder.aggregate([
      { $match: match },
      { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$grand_total' } } },
    ]);

    ok(res, { data: { by_customer: byCustomer, by_month: byMonth, total: total[0] || { count: 0, value: 0 } } });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-orders/reports/pending-delivery  (BE-011 §7)
// ─────────────────────────────────────────────────────────────────────────────
const getReportPendingDelivery = async (req, res) => {
  try {
    const sos = await SalesOrder.find({
      is_active: true,
      status: { $in: ['Confirmed', 'In Production', 'Ready for Dispatch', 'Partially Delivered'] },
    })
    .select('so_number customer_id customer_name status grand_total items')
    .lean();

    // Group by customer
    const byCustomer = {};
    sos.forEach(so => {
      const pendingLines = so.items.filter(i => !i.is_cancelled && i.item_status !== 'Delivered');
      if (!pendingLines.length) return;
      const key = String(so.customer_id);
      if (!byCustomer[key]) byCustomer[key] = { customer_name: so.customer_name, orders: [], total_pending_value: 0 };
      byCustomer[key].orders.push({
        so_number:    so.so_number,
        status:       so.status,
        pending_lines:pendingLines.map(i => ({
          part_no:       i.part_no,
          part_name:     i.part_name,
          pending_qty:   Math.max(0, i.ordered_qty - i.delivered_qty),
          committed_date:i.committed_date,
          item_status:   i.item_status,
        })),
      });
      byCustomer[key].total_pending_value +=
        pendingLines.reduce((s, i) => s + (Math.max(0, i.ordered_qty - i.delivered_qty) * i.unit_price), 0);
    });

    ok(res, { data: Object.values(byCustomer) });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// CRUD — Create, List, Get, Update, Confirm
// ─────────────────────────────────────────────────────────────────────────────
const createSalesOrder = async (req, res) => {
  try {
    const body = req.body;
    const company  = await Company.findOne({ is_active: true });
    const customer = await Customer.findById(body.customer_id);
    if (!company)  return err(res, 'No active company', 404);
    if (!customer) return err(res, 'Customer not found', 404);

    // GST type determination
    const gst_type = company.state_code === customer.billing_address?.state_code ? 'CGST/SGST' : 'IGST';

    // Credit limit check
    if (customer.credit_limit > 0) {
      const openValue = (await SalesOrder.aggregate([
        { $match: { customer_id: customer._id, is_active: true, status: { $nin: ['Cancelled', 'Closed'] } } },
        { $group: { _id: null, total: { $sum: '$grand_total' } } },
      ]))[0]?.total || 0;

      const estimatedTotal = (body.items || []).reduce((s, i) => s + (i.unit_price * i.ordered_qty), 0);
      if (openValue + estimatedTotal > customer.credit_limit) {
        return err(res, `Credit limit exceeded. Open: ₹${openValue}, Limit: ₹${customer.credit_limit}`, 400);
      }
    }

    const addr  = customer.billing_address || {};
    const sAddr = customer.shipping_addresses?.find(a => a.is_default) || customer.shipping_addresses?.[0] || {};

    const so = await SalesOrder.create({
      ...body,
      customer_name:   customer.customer_name,
      customer_gstin:  customer.gstin || '',
      company_id:      company._id,
      gst_type,
      billing_address: { line1: addr.line1, line2: addr.line2, city: addr.city, state: addr.state, state_code: addr.state_code, pincode: addr.pincode },
      shipping_address:{ line1: sAddr.line1, line2: sAddr.line2, city: sAddr.city, state: sAddr.state, state_code: sAddr.state_code, pincode: sAddr.pincode },
      payment_terms:   body.payment_terms || customer.payment_terms || 'Net 30',
      created_by: req.user._id,
      audit_log: [{ changed_by: req.user._id, action: 'created', new_value: 'Draft' }],
    });

    ok(res, { data: so }, 201);
  } catch (e) {
    if (e.name === 'ValidationError') return err(res, Object.values(e.errors).map(v => v.message).join(', '), 400);
    err(res, e.message);
  }
};

const getSalesOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, customer_id, customer_po_number, from, to, sort = '-so_date' } = req.query;
    const q = { is_active: true };
    if (status)             q.status     = { $in: status.split(',') };
    if (customer_id)        q.customer_id= customer_id;
    if (customer_po_number) q.customer_po_number = { $regex: customer_po_number, $options: 'i' };
    if (from || to) { q.so_date = {}; if (from) q.so_date.$gte = new Date(from); if (to) q.so_date.$lte = new Date(to); }

    const [data, total] = await Promise.all([
      SalesOrder.find(q).select('-items.audit_log -revisions').sort(sort)
        .skip((parseInt(page) - 1) * parseInt(limit)).limit(parseInt(limit)).lean({ virtuals: true }),
      SalesOrder.countDocuments(q),
    ]);
    ok(res, { data, pagination: { page: parseInt(page), total, pages: Math.ceil(total / parseInt(limit)) } });
  } catch (e) { err(res, e.message); }
};

const getSalesOrderById = async (req, res) => {
  try {
    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true })
      .populate('customer_id', 'customer_name gstin billing_address contacts credit_limit credit_outstanding')
      .populate('quotation_id', 'QuotationNo')
      .lean({ virtuals: true });
    if (!so) return err(res, 'Sales Order not found', 404);
    ok(res, { data: so });
  } catch (e) { err(res, e.message); }
};

const updateSalesOrder = async (req, res) => {
  try {
    const updates = req.body;
    const allowedUpdates = [
      'expected_delivery_date',
      'payment_terms',
      'delivery_terms',
      'internal_remarks',
      'shipping_address',
      'billing_address',
      'customer_po_number',
      'customer_po_date',
      'remarks'
    ];
    
    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true });
    if (!so) return err(res, 'Sales Order not found', 404);
    
    // Don't allow updating confirmed/cancelled/closed orders
    if (['Confirmed', 'In Production', 'Ready for Dispatch', 'Partially Delivered', 'Fully Delivered', 'Cancelled', 'Closed'].includes(so.status)) {
      return err(res, `Cannot update SO in status: ${so.status}. Only Draft orders can be updated.`, 400);
    }
    
    // Apply updates
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        so[key] = updates[key];
      }
    });
    
    so.updated_by = req.user._id;
    so.audit_log.push({
      changed_by: req.user._id,
      action: 'updated',
      notes: 'SO header fields updated'
    });
    
    await so.save();
    ok(res, { data: so });
  } catch (e) {
    err(res, e.message);
  }
};

const confirmSalesOrder = async (req, res) => {
  try {
    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true });
    if (!so) return err(res, 'Sales Order not found', 404);
    if (so.status !== 'Draft') return err(res, 'Only Draft SOs can be confirmed', 400);

    so.status       = 'Confirmed';
    so.confirmed_at = new Date();
    so.updated_by   = req.user._id;
    so.audit_log.push({ changed_by: req.user._id, action: 'status_change', old_value: 'Draft', new_value: 'Confirmed' });
    so.mrp_triggered    = false;   // Ready to trigger
    so.mrp_triggered_at = null;
    await so.save();

    ok(res, { message: 'SO confirmed. MRP and WO creation can now proceed.', data: so });
  } catch (e) { err(res, e.message); }
};

const cancelSoLineItem = async (req, res) => {
  try {
    const { lineItemId } = req.params;
    const { cancel_reason } = req.body;
    if (!cancel_reason?.trim()) return err(res, 'cancel_reason is required', 400);

    const so = await SalesOrder.findOne({ _id: req.params.id, is_active: true });
    if (!so) return err(res, 'Sales Order not found', 404);

    const line = so.items.id(lineItemId);
    if (!line) return err(res, 'Line item not found', 404);
    if (line.delivered_qty > 0) return err(res, 'Cannot cancel line item with existing deliveries', 400);

    line.is_cancelled  = true;
    line.item_status   = 'Cancelled';
    line.cancelled_at  = new Date();
    line.cancel_reason = cancel_reason.trim();

    so.audit_log.push({ changed_by: req.user._id, action: 'line_item_cancelled', new_value: lineItemId, notes: cancel_reason });
    so.updated_by = req.user._id;
    await so.save();

    ok(res, { message: 'Line item cancelled', data: so });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  // Service (called by DC controller)
  updateDeliveryQty,
  // Multer middleware
  uploadPoFile,
  // BE-010
  getDeliveryStatus,
  getOrderBook,
  getDeliveryDue,
  cancelSalesOrder,
  getOtifKpi,
  getSoHistory,
  // BE-011
  reviseSalesOrder,
  getSoRevisions,
  acknowledgeSalesOrder,
  getReportSummary,
  getReportPendingDelivery,
  // CRUD
  createSalesOrder,
  getSalesOrders,
  getSalesOrderById,
  updateSalesOrder,
  confirmSalesOrder,
  cancelSoLineItem,
};