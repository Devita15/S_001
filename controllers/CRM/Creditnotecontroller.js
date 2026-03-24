'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// creditNoteController.js  — BE-014
//
// Covers:
//   POST /api/credit-notes                  createCreditNote
//   GET  /api/gstr1-data?month=&year=       getGstr1Data
//   GET  /api/gstr3b-data?month=&year=      getGstr3bData
//   GET  /api/ar-aging                      getArAging
//   GET  /api/reports/monthly-revenue       getMonthlyRevenue
//   (SO auto-closure — triggered from payment allocation)
// ─────────────────────────────────────────────────────────────────────────────

const mongoose       = require('mongoose');
const { CreditNote, GLJournalEntry } = require('../../models/CRM/Creditnoteandgl');
const SalesInvoice   = require('../../models/CRM/SalesInvoice');
const { SalesOrder } = require('../../models/CRM/SalesOrder');
const Company        = require("../../models/user's & setting's/Company");
const { amountInWords } = require('../CRM/Invoicecontroller');

const ok  = (res, data, code = 200) => res.status(code).json({ success: true,  ...data });
const err = (res, msg,  code = 500) => res.status(code).json({ success: false, message: msg });

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/credit-notes  (BE-014 §1)
// ─────────────────────────────────────────────────────────────────────────────
const createCreditNote = async (req, res) => {
  try {
    const { invoice_id, items, reason, notes } = req.body;
    if (!invoice_id) return err(res, 'invoice_id is required', 400);
    if (!items?.length) return err(res, 'items[] is required', 400);
    if (!reason?.trim()) return err(res, 'reason is required', 400);

    const invoice = await SalesInvoice.findOne({ _id: invoice_id, is_active: true });
    if (!invoice) return err(res, 'Invoice not found', 404);
    if (invoice.status === 'Cancelled') return err(res, 'Cannot create CN for a cancelled invoice', 400);

    const company = await Company.findOne({ is_active: true });

    // Items must match original invoice (validate part_no and quantity)
    for (const cnItem of items) {
      const invItem = invoice.items.find(i => i.part_no === cnItem.part_no);
      if (!invItem) return err(res, `Part ${cnItem.part_no} not found on original invoice`, 400);
      if (cnItem.quantity > invItem.quantity) {
        return err(res, `CN quantity (${cnItem.quantity}) cannot exceed invoiced quantity (${invItem.quantity}) for ${cnItem.part_no}`, 400);
      }
    }

    // Build CN items from invoice items (GST type must match)
    const cnItems = items.map(ci => {
      const invItem = invoice.items.find(i => i.part_no === ci.part_no);
      return {
        part_no:        invItem.part_no,
        part_name:      invItem.part_name,
        hsn_code:       invItem.hsn_code,
        unit:           invItem.unit,
        quantity:       ci.quantity || invItem.quantity,
        unit_price:     ci.unit_price ?? invItem.unit_price,
        gst_percentage: invItem.gst_percentage,
      };
    });

    const cn = await CreditNote.create({
      invoice_id:     invoice._id,
      invoice_no:     invoice.invoice_no,
      invoice_date:   invoice.invoice_date,
      so_id:          invoice.so_id,

      company_id:     company._id,
      company_name:   company.company_name,
      company_gstin:  company.gstin || '',

      customer_id:    invoice.customer_id,
      customer_name:  invoice.customer_name,
      customer_gstin: invoice.customer_gstin || '',

      gst_type: invoice.gst_type,  // must match original invoice
      items:    cnItems,
      reason:   reason.trim(),
      notes:    notes || '',
      created_by: req.user._id,
    });

    // Post GL reversal entries (BE-014 §2)
    // DR: Trade Receivables (reduce outstanding)
    // CR: Sales Revenue (reduce)
    // CR: GST Output (reduce)
    const glLines = [];
    glLines.push({
      account_code: `AR-${String(invoice.customer_id).slice(-6).toUpperCase()}`,
      account_name: `Trade Receivable — ${invoice.customer_name}`,
      debit:  0,
      credit: cn.grand_total,  // Reduces receivable
      narration: `CN ${cn.cn_number} against ${invoice.invoice_no}`,
    });
    cn.items.forEach(item => {
      glLines.push({
        account_code: `SALES-${item.hsn_code}`,
        account_name: `Sales Revenue — ${item.part_name}`,
        debit:  +item.taxable_amount.toFixed(2),  // Reduces revenue
        credit: 0,
        narration: item.part_no,
      });
    });
    if (cn.gst_type === 'IGST') {
      glLines.push({ account_code: 'GST-IGST-OUTPUT', account_name: 'GST Output — IGST', debit: cn.igst_total, credit: 0, narration: `CN ${cn.cn_number}` });
    } else {
      if (cn.cgst_total > 0) glLines.push({ account_code: 'GST-CGST-OUTPUT', account_name: 'GST Output — CGST', debit: cn.cgst_total, credit: 0, narration: `CN ${cn.cn_number}` });
      if (cn.sgst_total > 0) glLines.push({ account_code: 'GST-SGST-OUTPUT', account_name: 'GST Output — SGST', debit: cn.sgst_total, credit: 0, narration: `CN ${cn.cn_number}` });
    }

    const journal = await GLJournalEntry.create({
      journal_type:   'Credit Note',
      reference_type: 'CreditNote',
      reference_id:   cn._id,
      reference_no:   cn.cn_number,
      narration:      `Credit Note ${cn.cn_number} against Invoice ${invoice.invoice_no}`,
      lines:          glLines,
      posted_by:      req.user._id,
    });
    cn.gl_posted    = true;
    cn.gl_journal_id= journal._id;

    // Update invoice outstanding
    invoice.outstanding_amount = Math.max(0, +(invoice.outstanding_amount - cn.grand_total).toFixed(2));
    invoice.status = 'Credit Note Issued';
    await invoice.save();

    cn.amount_in_words = amountInWords(cn.grand_total);
    await cn.save();

    ok(res, {
      message: `Credit Note ${cn.cn_number} created. GSTR-1 period: ${cn.gstr1_period}. Same period as invoice: ${cn.same_period_as_invoice}`,
      data: cn,
    }, 201);
  } catch (e) {
    if (e.name === 'ValidationError') return err(res, Object.values(e.errors).map(v => v.message).join(', '), 400);
    err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/gstr1-data?month=MM&year=YYYY  (BE-014 §3-4)
// Full GSTR-1 JSON: B2B invoices + credit notes grouped by customer GSTIN
// ─────────────────────────────────────────────────────────────────────────────
const getGstr1Data = async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return err(res, 'month and year are required', 400);
    const mm   = parseInt(month);
    const yyyy = parseInt(year);
    const from = new Date(yyyy, mm - 1, 1);
    const to   = new Date(yyyy, mm, 0, 23, 59, 59);  // last day of month

    // B2B invoices for the period
    const invoices = await SalesInvoice.find({
      is_active: true,
      invoice_date: { $gte: from, $lte: to },
      status: { $nin: ['Draft', 'Cancelled'] },
      customer_gstin: { $exists: true, $ne: '' },
    }).select('invoice_no invoice_date customer_name customer_gstin billing_address gst_type items taxable_total cgst_total sgst_total igst_total grand_total hsn_breakup');

    // Credit notes whose GSTR-1 period falls in this month
    const period = `${String(mm).padStart(2, '0')}-${yyyy}`;
    const cns = await CreditNote.find({
      is_active: true,
      gstr1_period: period,
      status: { $ne: 'Cancelled' },
      customer_gstin: { $exists: true, $ne: '' },
    }).select('cn_number cn_date customer_name customer_gstin gst_type taxable_total cgst_total sgst_total igst_total grand_total hsn_breakup');

    // Group B2B invoices by GSTIN
    const b2bMap = {};
    invoices.forEach(inv => {
      const gstin = inv.customer_gstin;
      if (!b2bMap[gstin]) b2bMap[gstin] = { gstin, customer_name: inv.customer_name, invoices: [], total_taxable: 0, total_tax: 0 };
      b2bMap[gstin].invoices.push({
        invoice_no:    inv.invoice_no,
        invoice_date:  inv.invoice_date,
        invoice_type:  'Regular',
        supply_type:   inv.gst_type === 'IGST' ? 'INTER' : 'INTRA',
        billing_state_code: inv.billing_address?.state_code || 0,
        taxable_value: inv.taxable_total,
        cgst:          inv.cgst_total,
        sgst:          inv.sgst_total,
        igst:          inv.igst_total,
        total:         inv.grand_total,
        hsn_breakup:   inv.hsn_breakup,
      });
      b2bMap[gstin].total_taxable += inv.taxable_total;
      b2bMap[gstin].total_tax     += (inv.cgst_total + inv.sgst_total + inv.igst_total);
    });

    // Group credit notes by GSTIN
    const cdnrMap = {};
    cns.forEach(cn => {
      const gstin = cn.customer_gstin;
      if (!cdnrMap[gstin]) cdnrMap[gstin] = { gstin, customer_name: cn.customer_name, credit_notes: [] };
      cdnrMap[gstin].credit_notes.push({
        cn_number:     cn.cn_number,
        cn_date:       cn.cn_date,
        document_type: 'C',  // Credit note
        supply_type:   cn.gst_type === 'IGST' ? 'INTER' : 'INTRA',
        taxable_value: cn.taxable_total,
        cgst:          cn.cgst_total,
        sgst:          cn.sgst_total,
        igst:          cn.igst_total,
        total:         cn.grand_total,
      });
    });

    // HSN summary (aggregate all invoices)
    const hsnSummary = {};
    invoices.forEach(inv => {
      (inv.hsn_breakup || []).forEach(h => {
        if (!hsnSummary[h.hsn_code]) hsnSummary[h.hsn_code] = { hsn_code: h.hsn_code, taxable_value: 0, cgst: 0, sgst: 0, igst: 0, total_tax: 0 };
        hsnSummary[h.hsn_code].taxable_value += h.taxable_value;
        hsnSummary[h.hsn_code].cgst          += h.cgst_amount;
        hsnSummary[h.hsn_code].sgst          += h.sgst_amount;
        hsnSummary[h.hsn_code].igst          += h.igst_amount;
        hsnSummary[h.hsn_code].total_tax     += h.total_tax;
      });
    });

    const gstr1 = {
      period: `${String(mm).padStart(2,'0')}/${yyyy}`,
      gstin:  (await Company.findOne({ is_active: true }))?.gstin || '',
      b2b:    Object.values(b2bMap),
      cdnr:   Object.values(cdnrMap),
      hsn_summary: Object.values(hsnSummary).map(h => ({
        ...h,
        taxable_value: +h.taxable_value.toFixed(2),
        cgst: +h.cgst.toFixed(2), sgst: +h.sgst.toFixed(2),
        igst: +h.igst.toFixed(2), total_tax: +h.total_tax.toFixed(2),
      })),
      totals: {
        invoice_count: invoices.length,
        cn_count:      cns.length,
        total_taxable: invoices.reduce((s, i) => s + i.taxable_total, 0),
        total_cgst:    invoices.reduce((s, i) => s + i.cgst_total, 0),
        total_sgst:    invoices.reduce((s, i) => s + i.sgst_total, 0),
        total_igst:    invoices.reduce((s, i) => s + i.igst_total, 0),
        total_tax:     invoices.reduce((s, i) => s + i.cgst_total + i.sgst_total + i.igst_total, 0),
        cn_total:      cns.reduce((s, c) => s + c.grand_total, 0),
      },
    };

    ok(res, { data: gstr1 });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/gstr3b-data?month=MM&year=YYYY  (BE-014 §5-6)
// GSTR-3B: output tax summary + ITC summary
// ─────────────────────────────────────────────────────────────────────────────
const getGstr3bData = async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return err(res, 'month and year are required', 400);
    const mm   = parseInt(month);
    const yyyy = parseInt(year);
    const from = new Date(yyyy, mm - 1, 1);
    const to   = new Date(yyyy, mm, 0, 23, 59, 59);

    // Output tax (from sales invoices)
    const invoiceTotals = await SalesInvoice.aggregate([
      { $match: { is_active: true, status: { $nin: ['Draft','Cancelled'] }, invoice_date: { $gte: from, $lte: to } } },
      { $group: {
        _id:          null,
        taxable_total: { $sum: '$taxable_total' },
        cgst_total:    { $sum: '$cgst_total' },
        sgst_total:    { $sum: '$sgst_total' },
        igst_total:    { $sum: '$igst_total' },
        invoice_count: { $sum: 1 },
      }},
    ]);

    // CN reductions for the period
    const period = `${String(mm).padStart(2, '0')}-${yyyy}`;
    const cnTotals = await CreditNote.aggregate([
      { $match: { is_active: true, status: { $ne: 'Cancelled' }, gstr1_period: period } },
      { $group: {
        _id:          null,
        taxable_total: { $sum: '$taxable_total' },
        cgst_total:    { $sum: '$cgst_total' },
        sgst_total:    { $sum: '$sgst_total' },
        igst_total:    { $sum: '$igst_total' },
        cn_count:      { $sum: 1 },
      }},
    ]);

    const output    = invoiceTotals[0] || { taxable_total: 0, cgst_total: 0, sgst_total: 0, igst_total: 0, invoice_count: 0 };
    const cnReduct  = cnTotals[0]      || { taxable_total: 0, cgst_total: 0, sgst_total: 0, igst_total: 0, cn_count: 0 };

    // ITC (from purchase invoices — Akanksha's module; placeholder aggregation)
    let itcCgst = 0, itcSgst = 0, itcIgst = 0;
    try {
      const PurchaseInvoice = mongoose.model('PurchaseInvoice');
      const itcTotals = await PurchaseInvoice.aggregate([
        { $match: { is_active: true, status: { $nin: ['Draft','Cancelled'] }, invoice_date: { $gte: from, $lte: to } } },
        { $group: { _id: null, cgst: { $sum: '$cgst_total' }, sgst: { $sum: '$sgst_total' }, igst: { $sum: '$igst_total' } } },
      ]);
      itcCgst = itcTotals[0]?.cgst || 0;
      itcSgst = itcTotals[0]?.sgst || 0;
      itcIgst = itcTotals[0]?.igst || 0;
    } catch (_) {} // Module not yet available

    const netCgst = +(output.cgst_total - cnReduct.cgst_total - itcCgst).toFixed(2);
    const netSgst = +(output.sgst_total - cnReduct.sgst_total - itcSgst).toFixed(2);
    const netIgst = +(output.igst_total - cnReduct.igst_total - itcIgst).toFixed(2);

    ok(res, {
      data: {
        period: `${String(mm).padStart(2,'0')}/${yyyy}`,
        outward_supplies: {
          taxable_value:  +(output.taxable_total - cnReduct.taxable_total).toFixed(2),
          cgst:           +(output.cgst_total - cnReduct.cgst_total).toFixed(2),
          sgst:           +(output.sgst_total - cnReduct.sgst_total).toFixed(2),
          igst:           +(output.igst_total - cnReduct.igst_total).toFixed(2),
          invoice_count:  output.invoice_count,
          cn_count:       cnReduct.cn_count,
        },
        itc_claimed: { cgst: +itcCgst.toFixed(2), sgst: +itcSgst.toFixed(2), igst: +itcIgst.toFixed(2) },
        net_tax_payable: {
          cgst: Math.max(0, netCgst),
          sgst: Math.max(0, netSgst),
          igst: Math.max(0, netIgst),
          total: +Math.max(0, netCgst + netSgst + netIgst).toFixed(2),
        },
        note: 'ITC data populated from PurchaseInvoice module (Akanksha Phase 06). Verify before filing.',
      },
    });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ar-aging  (BE-014 §7-8)
// AR Aging: bucket invoices by days overdue
// ─────────────────────────────────────────────────────────────────────────────
const getArAging = async (req, res) => {
  try {
    const { customer_id } = req.query;
    const today = new Date();

    const match = {
      is_active: true,
      status: { $in: ['IRN Generated', 'Sent', 'Partially Paid'] },
      outstanding_amount: { $gt: 0 },
    };
    if (customer_id) match.customer_id = new mongoose.Types.ObjectId(customer_id);

    const invoices = await SalesInvoice.find(match)
      .select('invoice_no invoice_date due_date customer_id customer_name outstanding_amount grand_total so_number')
      .lean();

    // Bucket each invoice
    const customerBuckets = {};
    invoices.forEach(inv => {
      const custKey = String(inv.customer_id);
      if (!customerBuckets[custKey]) {
        customerBuckets[custKey] = {
          customer_name:  inv.customer_name,
          customer_id:    inv.customer_id,
          current:        0,   // 0–30 days
          bucket_31_60:   0,   // 31–60
          bucket_61_90:   0,   // 61–90
          bucket_91_180:  0,   // 91–180
          bucket_180_plus:0,   // >180
          total_outstanding: 0,
          invoices:       [],
        };
      }

      const dueDate  = inv.due_date ? new Date(inv.due_date) : new Date(inv.invoice_date);
      const daysPast = Math.max(0, Math.floor((today - dueDate) / 86400000));
      const amt      = inv.outstanding_amount;

      if      (daysPast <= 30)  customerBuckets[custKey].current        += amt;
      else if (daysPast <= 60)  customerBuckets[custKey].bucket_31_60   += amt;
      else if (daysPast <= 90)  customerBuckets[custKey].bucket_61_90   += amt;
      else if (daysPast <= 180) customerBuckets[custKey].bucket_91_180  += amt;
      else                       customerBuckets[custKey].bucket_180_plus+= amt;

      customerBuckets[custKey].total_outstanding += amt;
      customerBuckets[custKey].invoices.push({
        invoice_no:          inv.invoice_no,
        invoice_date:        inv.invoice_date,
        due_date:            inv.due_date,
        days_overdue:        Math.max(0, daysPast),
        outstanding_amount:  amt,
        so_number:           inv.so_number,
      });
    });

    // Grand totals
    const rows    = Object.values(customerBuckets);
    const totals  = rows.reduce((acc, r) => {
      acc.current         += r.current;
      acc.bucket_31_60    += r.bucket_31_60;
      acc.bucket_61_90    += r.bucket_61_90;
      acc.bucket_91_180   += r.bucket_91_180;
      acc.bucket_180_plus += r.bucket_180_plus;
      acc.total           += r.total_outstanding;
      return acc;
    }, { current: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_91_180: 0, bucket_180_plus: 0, total: 0 });

    // Round all totals
    rows.forEach(r => {
      r.current         = +r.current.toFixed(2);
      r.bucket_31_60    = +r.bucket_31_60.toFixed(2);
      r.bucket_61_90    = +r.bucket_61_90.toFixed(2);
      r.bucket_91_180   = +r.bucket_91_180.toFixed(2);
      r.bucket_180_plus = +r.bucket_180_plus.toFixed(2);
      r.total_outstanding = +r.total_outstanding.toFixed(2);
    });

    ok(res, {
      as_of_date: today,
      data: rows.sort((a, b) => b.total_outstanding - a.total_outstanding),
      grand_totals: {
        current:         +totals.current.toFixed(2),
        '31_to_60_days': +totals.bucket_31_60.toFixed(2),
        '61_to_90_days': +totals.bucket_61_90.toFixed(2),
        '91_to_180_days':+totals.bucket_91_180.toFixed(2),
        'above_180_days':+totals.bucket_180_plus.toFixed(2),
        total_outstanding: +totals.total.toFixed(2),
      },
    });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// SO AUTO-CLOSURE  (BE-014 §9)
// Called after every payment allocation.
// Checks: all DCs dispatched AND all invoices fully paid → SO.status = Closed
// ─────────────────────────────────────────────────────────────────────────────
async function checkAndCloseSalesOrder(soId) {
  const so = await SalesOrder.findById(soId);
  if (!so || so.status === 'Closed' || so.status === 'Cancelled') return;

  // All active lines must be Delivered
  const activeLines = so.items.filter(i => !i.is_cancelled);
  const allDelivered = activeLines.every(i => i.item_status === 'Delivered');
  if (!allDelivered) return;

  // All invoices must be fully paid
  const invoices = await SalesInvoice.find({ so_id: soId, is_active: true, status: { $ne: 'Cancelled' } });
  if (!invoices.length) return;
  const allPaid = invoices.every(i => i.outstanding_amount <= 0.01);
  if (!allPaid) return;

  so.status    = 'Closed';
  so.closed_at = new Date();
  so.audit_log.push({
    changed_by: new mongoose.Types.ObjectId(),  // system
    action:     'status_change',
    old_value:  'Fully Delivered',
    new_value:  'Closed',
    notes:      'Auto-closed: all delivered, all invoiced, all paid',
  });
  await so.save();
  return so;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADVANCE GST ALERT  (BE-014 §10)
// ─────────────────────────────────────────────────────────────────────────────
const getAdvanceGstAlerts = async (req, res) => {
  try {
    // Find customers with advance payments not yet invoiced (needs PaymentReceipt model)
    // Placeholder — returns empty until PaymentReceipt module (Akanksha) is complete
    let alerts = [];
    try {
      const PaymentReceipt = mongoose.model('PaymentReceipt');
      const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
      const advances = await PaymentReceipt.find({
        payment_type: 'Advance',
        is_allocated: false,
        createdAt: { $lte: lastMonth },
      }).populate('customer_id', 'customer_name gstin');
      alerts = advances.map(a => ({
        customer:       a.customer_id?.customer_name || '',
        gstin:          a.customer_id?.gstin || '',
        advance_amount: a.amount,
        received_on:    a.payment_date,
        months_old:     Math.floor((Date.now() - new Date(a.payment_date).getTime()) / 2592000000),
      }));
    } catch (_) {}

    ok(res, { count: alerts.length, data: alerts, note: 'Advance GST alerts require PaymentReceipt module from Phase 12 (Akanksha).' });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reports/monthly-revenue  (BE-014 §11)
// ─────────────────────────────────────────────────────────────────────────────
const getMonthlyRevenue = async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return err(res, 'month and year are required', 400);
    const mm   = parseInt(month);
    const yyyy = parseInt(year);
    const from = new Date(yyyy, mm - 1, 1);
    const to   = new Date(yyyy, mm, 0, 23, 59, 59);

    const match = { is_active: true, status: { $nin: ['Draft','Cancelled'] }, invoice_date: { $gte: from, $lte: to } };

    // By customer
    const byCustomer = await SalesInvoice.aggregate([
      { $match: match },
      { $group: {
        _id:           '$customer_id',
        customer_name: { $first: '$customer_name' },
        invoice_count: { $sum: 1 },
        taxable_total: { $sum: '$taxable_total' },
        gst_total:     { $sum: '$gst_total' },
        grand_total:   { $sum: '$grand_total' },
      }},
      { $sort: { grand_total: -1 } },
      { $limit: 20 },
    ]);

    // By product (HSN)
    const byProduct = await SalesInvoice.aggregate([
      { $match: match },
      { $unwind: '$hsn_breakup' },
      { $group: {
        _id:           '$hsn_breakup.hsn_code',
        taxable_value: { $sum: '$hsn_breakup.taxable_value' },
        total_tax:     { $sum: '$hsn_breakup.total_tax' },
      }},
      { $sort: { taxable_value: -1 } },
    ]);

    // Total
    const totals = await SalesInvoice.aggregate([
      { $match: match },
      { $group: {
        _id:           null,
        invoice_count: { $sum: 1 },
        taxable_total: { $sum: '$taxable_total' },
        gst_total:     { $sum: '$gst_total' },
        grand_total:   { $sum: '$grand_total' },
      }},
    ]);

    // CN reductions
    const period = `${String(mm).padStart(2, '0')}-${yyyy}`;
    const cnTots = await CreditNote.aggregate([
      { $match: { is_active: true, status: { $ne: 'Cancelled' }, gstr1_period: period } },
      { $group: { _id: null, total: { $sum: '$grand_total' } } },
    ]);

    ok(res, {
      data: {
        period: `${String(mm).padStart(2, '0')}/${yyyy}`,
        by_customer: byCustomer,
        by_product:  byProduct,
        totals:      totals[0] || { invoice_count: 0, taxable_total: 0, gst_total: 0, grand_total: 0 },
        cn_deductions: cnTots[0]?.total || 0,
        net_revenue: +((totals[0]?.grand_total || 0) - (cnTots[0]?.total || 0)).toFixed(2),
      },
    });
  } catch (e) { err(res, e.message); }
};

module.exports = {
  createCreditNote,
  getGstr1Data,
  getGstr3bData,
  getArAging,
  getMonthlyRevenue,
  getAdvanceGstAlerts,
  checkAndCloseSalesOrder,  // exported — called from payment allocation
};