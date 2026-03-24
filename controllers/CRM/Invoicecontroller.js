'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// invoiceController.js  — BE-012
//
// Covers:
//   POST   /api/invoices                    createInvoice
//   GET    /api/invoices                    getInvoices
//   GET    /api/invoices/:id                getInvoice
//   POST   /api/invoices/:id/submit-irn     submitIrn
//   POST   /api/invoices/:id/send           sendInvoice
//   DELETE /api/invoices/:id/cancel-irn     cancelIrn
// ─────────────────────────────────────────────────────────────────────────────

const mongoose    = require('mongoose');
const axios       = require('axios');
const QRCode      = require('qrcode');
const PDFDoc      = require('pdfkit');
const nodemailer  = require('nodemailer');

const SalesInvoice   = require('../../models/CRM/Salesinvoice');
const { SalesOrder } = require('../../models/CRM/SalesOrder');
const { GLJournalEntry } = require('../../models/CRM/CreditNoteAndGL');
const Customer       = require('../../models/CRM/Customer');
const Company        = require("../../models/user's & setting's/Company");
const TermsCondition = require('../../models/CRM/TermsCondition');

const ok  = (res, data, code = 200) => res.status(code).json({ success: true,  ...data });
const err = (res, msg,  code = 500) => res.status(code).json({ success: false, message: msg });

// ─────────────────────────────────────────────────────────────────────────────
// INDIAN AMOUNT IN WORDS
// ─────────────────────────────────────────────────────────────────────────────
function amountInWords(amount) {
  const ones  = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens  = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const scale = ['','Thousand','Lakh','Crore'];

  const cvt = n => {
    if (n === 0) return '';
    let r = '';
    if (n >= 100) { r += ones[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
    if (n >= 20)  { r += tens[Math.floor(n / 10)] + ' '; n %= 10; }
    if (n > 0)    { r += ones[n] + ' '; }
    return r.trim();
  };

  const toWords = n => {
    if (n === 0) return 'Zero';
    let res = '', gi = 0;
    while (n > 0) {
      const g = gi === 0 ? n % 1000 : n % 100;
      n = gi === 0 ? Math.floor(n / 1000) : Math.floor(n / 100);
      if (g > 0) { const w = cvt(g); res = (w + (scale[gi] ? ' ' + scale[gi] : '') + ' ' + res).trim(); }
      gi++;
    }
    return res.trim();
  };

  const rupees = Math.floor(amount);
  const paise  = Math.round((amount - rupees) * 100);
  let result   = (toWords(rupees) || 'Zero') + ' Rupees';
  if (paise > 0) result += ' and ' + toWords(paise) + ' Paise';
  return result.replace(/\s+/g, ' ').trim() + ' Only';
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-GL POSTING  (BE-012 §8)
// DR: Trade Receivables (customer)
// CR: Sales Revenue (per item)
// CR: GST Output (CGST/SGST or IGST)
// ─────────────────────────────────────────────────────────────────────────────
async function postGLEntries(invoice, userId) {
  const lines = [];

  // DR: Trade Receivables
  lines.push({
    account_code: `AR-${String(invoice.customer_id).slice(-6).toUpperCase()}`,
    account_name: `Trade Receivable — ${invoice.customer_name}`,
    debit:  invoice.grand_total,
    credit: 0,
    narration: `Invoice ${invoice.invoice_no}`,
  });

  // CR: Sales Revenue (group by part or single CR for simplicity per item)
  invoice.items.forEach(item => {
    lines.push({
      account_code: `SALES-${item.hsn_code}`,
      account_name: `Sales Revenue — ${item.part_name}`,
      debit:  0,
      credit: +item.taxable_amount.toFixed(2),
      narration: `${item.part_no} × ${item.quantity}`,
    });
  });

  // CR: GST Output
  if (invoice.gst_type === 'IGST') {
    if (invoice.igst_total > 0) {
      lines.push({ account_code: 'GST-IGST-OUTPUT', account_name: 'GST Output — IGST', debit: 0, credit: invoice.igst_total, narration: `Invoice ${invoice.invoice_no}` });
    }
  } else {
    if (invoice.cgst_total > 0) {
      lines.push({ account_code: 'GST-CGST-OUTPUT', account_name: 'GST Output — CGST', debit: 0, credit: invoice.cgst_total, narration: `Invoice ${invoice.invoice_no}` });
    }
    if (invoice.sgst_total > 0) {
      lines.push({ account_code: 'GST-SGST-OUTPUT', account_name: 'GST Output — SGST', debit: 0, credit: invoice.sgst_total, narration: `Invoice ${invoice.invoice_no}` });
    }
  }

  const journal = await GLJournalEntry.create({
    journal_type:   'Sales Invoice',
    reference_type: 'SalesInvoice',
    reference_id:   invoice._id,
    reference_no:   invoice.invoice_no,
    narration:      `Sales Invoice ${invoice.invoice_no} — ${invoice.customer_name}`,
    lines,
    posted_by: userId,
  });

  return journal;
}

// ─────────────────────────────────────────────────────────────────────────────
// IRP e-Invoice API client  (BE-012 §5)
// ─────────────────────────────────────────────────────────────────────────────
async function buildIrpPayload(invoice, company) {
  // Per IRP specification (simplified — production must use full NIC schema)
  const docType = invoice.gst_type === 'IGST' ? 'I' : 'B2B';

  return {
    Version: '1.1',
    TranDtls: {
      TaxSch:   'GST',
      SupTyp:   'B2B',
      RegRev:   'N',
      EcmGstin: null,
      IgstOnIntra: 'N',
    },
    DocDtls: {
      Typ:  'INV',
      No:   invoice.invoice_no,
      Dt:   new Date(invoice.invoice_date).toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g, '/'),
    },
    SellerDtls: {
      Gstin:   company.gstin,
      LglNm:   company.company_name,
      Addr1:   company.address || '',
      Loc:     company.city    || '',
      Pin:     parseInt(company.pincode) || 0,
      Stcd:    String(company.state_code || 0).padStart(2, '0'),
    },
    BuyerDtls: {
      Gstin: invoice.customer_gstin || 'URP',
      LglNm: invoice.customer_name,
      Addr1: invoice.customer_address || '',
      Loc:   invoice.billing_address?.city || '',
      Pin:   parseInt(invoice.billing_address?.pincode) || 0,
      Stcd:  String(invoice.customer_state_code || 0).padStart(2, '0'),
      Pos:   String(invoice.customer_state_code || 0).padStart(2, '0'),
    },
    ItemList: invoice.items.map((item, i) => ({
      SlNo:      String(i + 1),
      PrdDesc:   item.part_name,
      IsServc:   'N',
      HsnCd:     item.hsn_code,
      Qty:       item.quantity,
      Unit:      item.unit === 'Nos' ? 'NOS' : item.unit.toUpperCase(),
      UnitPrice: item.unit_price,
      TotAmt:    item.taxable_amount,
      Discount:  item.discount_amount || 0,
      AssAmt:    item.taxable_amount,
      GstRt:     item.gst_percentage,
      IgstAmt:   item.igst_amount,
      CgstAmt:   item.cgst_amount,
      SgstAmt:   item.sgst_amount,
      TotItemVal:item.total_amount,
    })),
    ValDtls: {
      AssVal:  invoice.taxable_total,
      CgstVal: invoice.cgst_total,
      SgstVal: invoice.sgst_total,
      IgstVal: invoice.igst_total,
      TotInvVal: invoice.grand_total,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE PDF GENERATOR  (BE-012 §7)
// ─────────────────────────────────────────────────────────────────────────────
async function generateInvoicePDF(invoice, company) {
  // Generate QR code image if IRN available
  let qrDataUrl = null;
  if (invoice.e_invoice?.signed_qr_code) {
    try {
      qrDataUrl = await QRCode.toDataURL(invoice.e_invoice.signed_qr_code, { width: 80 });
    } catch (_) {}
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc    = new PDFDoc({ margin: 40, size: 'A4' });
    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = 515;

    // ── Company Header ────────────────────────────────────────────────────────
    doc.fillColor('#1F3864').rect(40, 40, W, 38).fill();
    doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold')
       .text(company?.company_name || 'COMPANY', 50, 48, { align: 'center', width: W - 20 });
    doc.fontSize(8).font('Helvetica')
       .text(`GSTIN: ${company?.gstin || ''}  |  ${company?.state || ''}  |  PAN: ${company?.pan || ''}`, 50, 68, { align: 'center', width: W - 20 });

    doc.fillColor('#2E75B6').rect(40, 78, W, 18).fill();
    doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold')
       .text('TAX INVOICE', 50, 82, { align: 'center', width: W - 20 });

    // ── Invoice meta ──────────────────────────────────────────────────────────
    let y = 104;
    const metaFill = '#F0F0F0';

    // Left column (invoice details)
    const leftMeta = [
      ['Invoice No.:', invoice.invoice_no],
      ['Invoice Date:', new Date(invoice.invoice_date).toLocaleDateString('en-IN')],
      ['Due Date:', invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-IN') : '—'],
      ['SO No.:', invoice.so_number || '—'],
      ['Customer PO:', invoice.customer_po_number || '—'],
    ];
    leftMeta.forEach(([lbl, val], i) => {
      doc.fillColor(metaFill).rect(40, y + i * 18, 130, 16).fill();
      doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(8).text(lbl, 44, y + i * 18 + 4, { width: 122 });
      doc.fillColor('#000000').font('Helvetica').text(val, 175, y + i * 18 + 4);
    });

    // Right column (DC/IRN)
    const rightMeta = [
      ['DC Nos.:', (invoice.dc_numbers || []).join(', ') || '—'],
      ['Payment Terms:', invoice.payment_terms || '—'],
      ['GST Type:', invoice.gst_type],
    ];
    rightMeta.forEach(([lbl, val], i) => {
      doc.fillColor(metaFill).rect(310, y + i * 18, 100, 16).fill();
      doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(8).text(lbl, 314, y + i * 18 + 4, { width: 92 });
      doc.fillColor('#000000').font('Helvetica').text(val, 415, y + i * 18 + 4, { width: 140 });
    });

    // IRN
    if (invoice.e_invoice?.irn) {
      y += leftMeta.length * 18 + 4;
      doc.fillColor(metaFill).rect(40, y, W, 16).fill();
      doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(7.5).text('IRN:', 44, y + 4, { width: 30 });
      doc.fillColor('#000000').font('Helvetica').fontSize(7).text(invoice.e_invoice.irn, 80, y + 4, { width: W - 44 });
      y += 20;
    } else {
      y += leftMeta.length * 18 + 8;
    }

    // ── Seller / Buyer ─────────────────────────────────────────────────────────
    y += 4;
    doc.fillColor('#1F3864').rect(40, y, W / 2 - 2, 16).fill()
       .rect(40 + W / 2 + 2, y, W / 2 - 2, 16).fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9)
       .text('SELLER', 44, y + 3).text('BUYER', 44 + W / 2 + 6, y + 3);
    y += 18;

    const sellerLines = [
      company?.company_name || '',
      company?.address || '',
      `GSTIN: ${company?.gstin || ''}  PAN: ${company?.pan || ''}`,
      `State: ${company?.state || ''}  Code: ${company?.state_code || ''}`,
    ];
    const buyerLines = [
      invoice.customer_name,
      invoice.customer_address || (invoice.billing_address ? `${invoice.billing_address.line1 || ''}, ${invoice.billing_address.city || ''}` : ''),
      `GSTIN: ${invoice.customer_gstin || 'Unregistered'}`,
      `State: ${invoice.customer_state || ''}  Code: ${invoice.customer_state_code || ''}`,
    ];

    const partyH = Math.max(sellerLines.length, buyerLines.length) * 14 + 8;
    doc.rect(40, y, W / 2 - 2, partyH).stroke('#8EA9C1');
    doc.rect(40 + W / 2 + 2, y, W / 2 - 2, partyH).stroke('#8EA9C1');
    sellerLines.forEach((l, i) => {
      if (!l) return;
      doc.fillColor('#000000').font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).text(l, 44, y + 4 + i * 14, { width: W / 2 - 14 });
    });
    buyerLines.forEach((l, i) => {
      if (!l) return;
      doc.fillColor('#000000').font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).text(l, 44 + W / 2 + 6, y + 4 + i * 14, { width: W / 2 - 14 });
    });
    y += partyH + 8;

    // ── Items table ────────────────────────────────────────────────────────────
    const iCols = [
      { x: 40,  w: 20,  label: 'SR' },
      { x: 60,  w: 60,  label: 'Part No.' },
      { x: 120, w: 110, label: 'Description' },
      { x: 230, w: 35,  label: 'HSN' },
      { x: 265, w: 30,  label: 'Qty' },
      { x: 295, w: 30,  label: 'Unit' },
      { x: 325, w: 55,  label: 'Rate (Rs)' },
      { x: 380, w: 45,  label: 'Taxable' },
      { x: 425, w: 30,  label: 'GST%' },
      { x: 455, w: 100, label: 'Amount (Rs)' },
    ];

    doc.fillColor('#1F3864').rect(40, y, W, 18).fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
    iCols.forEach(c => doc.text(c.label, c.x + 2, y + 5, { width: c.w - 2 }));
    y += 20;

    invoice.items.forEach((item, idx) => {
      const rowH = 16;
      doc.fillColor(idx % 2 ? '#DCE6F1' : '#FFFFFF').rect(40, y, W, rowH).fill();
      doc.fillColor('#000000').font('Helvetica').fontSize(7.5);
      doc.text(String(idx + 1),              iCols[0].x + 2, y + 4, { width: iCols[0].w });
      doc.text(item.part_no,                 iCols[1].x + 2, y + 4, { width: iCols[1].w });
      doc.text(item.part_name,               iCols[2].x + 2, y + 4, { width: iCols[2].w });
      doc.text(item.hsn_code,                iCols[3].x + 2, y + 4, { width: iCols[3].w });
      doc.text(String(item.quantity),        iCols[4].x + 2, y + 4, { width: iCols[4].w });
      doc.text(item.unit,                    iCols[5].x + 2, y + 4, { width: iCols[5].w });
      doc.text(item.unit_price?.toFixed(2),  iCols[6].x + 2, y + 4, { width: iCols[6].w, align: 'right' });
      doc.text(item.taxable_amount?.toFixed(2), iCols[7].x + 2, y + 4, { width: iCols[7].w, align: 'right' });
      doc.text(`${item.gst_percentage}%`,    iCols[8].x + 2, y + 4, { width: iCols[8].w });
      doc.text(item.total_amount?.toFixed(2),iCols[9].x + 2, y + 4, { width: iCols[9].w, align: 'right' });
      y += rowH;
    });

    // ── HSN Summary ────────────────────────────────────────────────────────────
    y += 8;
    doc.fillColor('#1F4E79').rect(40, y, W, 16).fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8).text('HSN-WISE GST SUMMARY', 44, y + 4);
    y += 18;
    doc.fillColor('#D9E1F2').rect(40, y, W, 14).fill();
    doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(7.5)
       .text('HSN Code', 44, y + 3).text('Taxable Value', 140, y + 3)
       .text('CGST', 230, y + 3).text('SGST', 290, y + 3)
       .text('IGST', 350, y + 3).text('Total Tax', 420, y + 3);
    y += 16;
    invoice.hsn_breakup.forEach(h => {
      doc.fillColor('#000000').font('Helvetica').fontSize(7.5)
         .text(h.hsn_code,                 44,  y)
         .text(h.taxable_value?.toFixed(2),140,  y)
         .text(h.cgst_amount?.toFixed(2),  230,  y)
         .text(h.sgst_amount?.toFixed(2),  290,  y)
         .text(h.igst_amount?.toFixed(2),  350,  y)
         .text(h.total_tax?.toFixed(2),    420,  y);
      y += 14;
    });

    // ── Totals ─────────────────────────────────────────────────────────────────
    y += 6;
    const totRows = [
      ['Sub Total:', invoice.sub_total?.toFixed(2)],
      [invoice.gst_type === 'IGST' ? `IGST (${invoice.items[0]?.gst_percentage || 18}%):` : `CGST + SGST:`, invoice.gst_total?.toFixed(2)],
      ['Round Off:', invoice.round_off?.toFixed(2)],
    ];
    totRows.forEach(([l, v]) => {
      doc.fillColor('#F0F0F0').rect(360, y, W - 320, 14).fill();
      doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(8).text(l, 364, y + 3);
      doc.fillColor('#000000').font('Helvetica').text(`₹${v}`, 490, y + 3, { align: 'right', width: 60 });
      y += 16;
    });
    doc.fillColor('#ED7D31').rect(360, y, W - 320, 20).fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
       .text('GRAND TOTAL:', 364, y + 4)
       .text(`₹${invoice.grand_total?.toFixed(2)}`, 490, y + 4, { align: 'right', width: 60 });
    y += 24;

    // Amount in words
    doc.fillColor('#D9E1F2').rect(40, y, W, 16).fill();
    doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(8)
       .text(`Amount in Words: ${invoice.amount_in_words || amountInWords(invoice.grand_total || 0)}`, 44, y + 4, { width: W - 8 });
    y += 22;

    // Bank details
    if (company?.bank_details?.bank_name) {
      doc.fillColor('#E2EFDA').rect(40, y, W, 38).fill();
      doc.fillColor('#375623').font('Helvetica-Bold').fontSize(8).text('BANK DETAILS', 44, y + 3);
      const bd = company.bank_details;
      doc.fillColor('#000000').font('Helvetica').fontSize(8)
         .text(`Bank: ${bd.bank_name}  |  A/c: ${bd.account_no}  |  IFSC: ${bd.ifsc}  |  Branch: ${bd.branch}`, 44, y + 16, { width: W - 8 });
      y += 42;
    }

    // QR Code (if e-Invoice)
    if (qrDataUrl) {
      try {
        const qrBuf = Buffer.from(qrDataUrl.split(',')[1], 'base64');
        doc.image(qrBuf, W - 60, y - 80, { width: 80, height: 80 });
        doc.fillColor('#000000').font('Helvetica').fontSize(7).text('Scan for e-Invoice', W - 60, y + 4, { width: 80, align: 'center' });
      } catch (_) {}
    }

    // T&C
    if (invoice.terms_conditions?.length) {
      y += 8;
      doc.fillColor('#1F3864').font('Helvetica-Bold').fontSize(8).text('TERMS & CONDITIONS', 40, y);
      y += 12;
      invoice.terms_conditions.slice(0, 5).forEach((tc, i) => {
        doc.fillColor('#000000').font('Helvetica').fontSize(7.5)
           .text(`${i + 1}. ${tc.Description || tc.Title || ''}`, 44, y, { width: W });
        y += 12;
      });
    }

    // Signature
    y += 20;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000')
       .text('Receiver\'s Signature', 40, y)
       .text(`For ${company?.company_name || ''}`, 380, y);
    doc.font('Helvetica').fontSize(7.5)
       .text('Authorised Signatory', 380, y + 14);

    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/invoices  (BE-012 §10)
// ─────────────────────────────────────────────────────────────────────────────
const createInvoice = async (req, res) => {
  try {
    const { so_id, dc_ids, items, notes } = req.body;
    if (!so_id)             return err(res, 'so_id is required', 400);
    if (!dc_ids?.length)    return err(res, 'At least one dc_id is required', 400);
    if (!items?.length)     return err(res, 'items[] is required', 400);

    // Hard validation: at least one DC in Dispatched status (BE-012 §2)
    let dcNumbers = [];
    try {
      const DeliveryChallan = mongoose.model('DeliveryChallan');
      const dcs = await DeliveryChallan.find({ _id: { $in: dc_ids }, status: 'Dispatched' });
      if (!dcs.length) return err(res, 'Invoice cannot be created: no Delivery Challans in Dispatched status for this SO', 400);
      dcNumbers = dcs.map(d => d.dc_number || d._id.toString());
    } catch (_) {
      // DC model may not exist in this phase — skip for now but note the rule
    }

    // Load SO
    const so = await SalesOrder.findOne({ _id: so_id, is_active: true });
    if (!so) return err(res, 'Sales Order not found', 404);
    if (['Cancelled', 'Draft'].includes(so.status)) {
      return err(res, `Cannot invoice SO in status: ${so.status}`, 400);
    }

    const company  = await Company.findOne({ is_active: true });
    if (!company) return err(res, 'No active company found', 404);

    const customer = await Customer.findById(so.customer_id);
    const terms    = await TermsCondition.find({ IsActive: true }).sort({ Sequence: 1 }).limit(10);
    const contact  = customer?.contacts?.find(c => c.is_primary) || customer?.contacts?.[0] || {};

    // Due date
    const creditDays = customer?.credit_days || 30;
    const dueDate    = new Date(); dueDate.setDate(dueDate.getDate() + creditDays);

    // Build invoice items with GST from SO lines
    const resolvedItems = items.map(i => {
      const soLine = so.items.find(l => l.part_no === i.part_no || String(l._id) === String(i.so_line_item_id));
      return {
        ...i,
        part_no:        i.part_no     || soLine?.part_no || '',
        part_name:      i.part_name   || soLine?.part_name || '',
        hsn_code:       i.hsn_code    || soLine?.hsn_code || '',
        unit:           i.unit        || soLine?.unit || 'Nos',
        unit_price:     i.unit_price  ?? soLine?.unit_price ?? 0,
        gst_percentage: i.gst_percentage ?? soLine?.gst_percentage ?? 18,
        so_line_item_id:soLine?._id || null,
      };
    });

    const invoice = await SalesInvoice.create({
      so_id:         so._id,
      so_number:     so.so_number,
      dc_ids:        dc_ids,
      dc_numbers:    dcNumbers,
      customer_po_number: so.customer_po_number,
      quotation_id:  so.quotation_id,

      company_id:         company._id,
      company_name:       company.company_name,
      company_gstin:      company.gstin || '',
      company_state:      company.state || '',
      company_state_code: company.state_code || 0,
      company_address:    company.address || '',
      company_pan:        company.pan     || '',

      customer_id:         so.customer_id,
      customer_name:       so.customer_name,
      customer_gstin:      so.customer_gstin || '',
      customer_state:      so.billing_address?.state || '',
      customer_state_code: so.billing_address?.state_code || 0,
      customer_address:    so.billing_address?.line1 || '',
      billing_address:     so.billing_address,
      shipping_address:    so.shipping_address,
      customer_contact:    contact.name  || '',
      customer_email:      contact.email || '',
      customer_phone:      contact.mobile || contact.phone || '',

      gst_type:      so.gst_type,  // inherited from SO — immutable
      items:         resolvedItems,
      payment_terms: so.payment_terms || customer?.payment_terms || 'Net 30',
      due_date:      dueDate,
      notes:         notes || '',
      terms_conditions: terms.map(t => ({ Title: t.Title, Description: t.Description, Sequence: t.Sequence })),
      created_by:    req.user._id,
    });

    // Set amount in words after totals computed
    invoice.amount_in_words = amountInWords(invoice.grand_total);

    // Auto-GL posting (BE-012 §8)
    const journal = await postGLEntries(invoice, req.user._id);
    invoice.gl_posted    = true;
    invoice.gl_posted_at = new Date();
    invoice.gl_journal_id= journal._id;

    await invoice.save();
    ok(res, { data: invoice }, 201);
  } catch (e) {
    if (e.name === 'ValidationError') return err(res, Object.values(e.errors).map(v => v.message).join(', '), 400);
    err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/invoices/:id/submit-irn  (BE-012 §9)
// ─────────────────────────────────────────────────────────────────────────────
const submitIrn = async (req, res) => {
  try {
    const invoice = await SalesInvoice.findOne({ _id: req.params.id, is_active: true });
    if (!invoice) return err(res, 'Invoice not found', 404);
    if (invoice.e_invoice?.irn) return err(res, 'IRN already generated. IRN is immutable.', 400);
    if (!['Draft', 'IRN Pending'].includes(invoice.status)) {
      return err(res, `Cannot submit IRN from status: ${invoice.status}`, 400);
    }

    const company = await Company.findOne({ is_active: true });
    invoice.irn_submission_attempts += 1;
    invoice.status = 'IRN Pending';

    // Build IRP payload
    const payload = await buildIrpPayload(invoice, company);

    // Call IRP API
    const irpBaseUrl = process.env.IRP_BASE_URL || 'https://einvoice1.gst.gov.in/EInvAPI/2/api';
    const irpToken   = process.env.IRP_AUTH_TOKEN || '';

    let irpResponse;
    try {
      const response = await axios.post(`${irpBaseUrl}/Invoice/Generate`, payload, {
        headers: {
          'Content-Type':  'application/json',
          'user_name':     process.env.IRP_USERNAME    || '',
          'password':      process.env.IRP_PASSWORD    || '',
          'gstin':         company?.gstin || '',
          'AuthToken':     irpToken,
          'client-id':     process.env.IRP_CLIENT_ID  || '',
          'client-secret': process.env.IRP_CLIENT_SECRET || '',
        },
        timeout: 30000,
      });
      irpResponse = response.data;
    } catch (axiosErr) {
      // In development/test, mock the response
      if (process.env.NODE_ENV !== 'production') {
        irpResponse = {
          Status: 1,
          Data: {
            Irn:          `MOCK-IRN-${Date.now()}`,
            AckNo:        `ACK-${Date.now()}`,
            AckDt:        new Date().toISOString(),
            SignedInvoice:`MOCK-SIGNED-${Date.now()}`,
            SignedQRCode: invoice.invoice_no + '|' + company?.gstin + '|' + new Date().toISOString(),
          },
        };
      } else {
        invoice.e_invoice = { ...invoice.e_invoice, irp_response_raw: { error: axiosErr.message } };
        await invoice.save();
        return err(res, `IRP API error: ${axiosErr.message}`, 502);
      }
    }

    if (irpResponse?.Status !== 1) {
      await invoice.save();
      return err(res, `IRP rejected: ${JSON.stringify(irpResponse?.ErrorDetails || irpResponse)}`, 422);
    }

    const data = irpResponse.Data;

    // Generate QR image
    let qrBase64 = '';
    try {
      qrBase64 = await QRCode.toDataURL(data.SignedQRCode || '', { width: 150 });
    } catch (_) {}

    invoice.e_invoice = {
      irn:              data.Irn || data.irn || '',
      ack_no:           data.AckNo || '',
      ack_date:         data.AckDt ? new Date(data.AckDt) : new Date(),
      signed_invoice:   data.SignedInvoice || '',
      signed_qr_code:   data.SignedQRCode  || '',
      qr_image_base64:  qrBase64,
      irn_generated_at: new Date(),
      irp_response_raw: data,
    };
    invoice.status = 'IRN Generated';
    await invoice.save();

    ok(res, { message: 'IRN generated successfully', data: { irn: invoice.e_invoice.irn, ack_no: invoice.e_invoice.ack_no, ack_date: invoice.e_invoice.ack_date } });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/invoices/:id/send  (BE-012 §11)
// ─────────────────────────────────────────────────────────────────────────────
const sendInvoice = async (req, res) => {
  try {
    const invoice = await SalesInvoice.findOne({ _id: req.params.id, is_active: true });
    if (!invoice) return err(res, 'Invoice not found', 404);
    if (invoice.status === 'Cancelled') return err(res, 'Cannot send a cancelled invoice', 400);

    const company = await Company.findOne({ is_active: true });
    const pdfBuffer = await generateInvoicePDF(invoice, company);

    const toEmail = req.body.email || invoice.customer_email;
    if (toEmail && process.env.SMTP_HOST) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT || '587'),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from:    `${company?.company_name || 'Accounts'} <${process.env.SMTP_USER}>`,
        to:      toEmail,
        subject: `Invoice ${invoice.invoice_no} — ${company?.company_name || ''}`,
        html:    `<p>Dear ${invoice.customer_name},</p>
                  <p>Please find attached Invoice <strong>${invoice.invoice_no}</strong> dated ${new Date(invoice.invoice_date).toLocaleDateString('en-IN')}.</p>
                  <p>Amount Due: <strong>₹${invoice.grand_total?.toLocaleString('en-IN')}</strong> by ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-IN') : '—'}</p>
                  <p>Regards,<br/>${company?.company_name || ''}</p>`,
        attachments: [{ filename: `${invoice.invoice_no}.pdf`, content: pdfBuffer }],
      });
      invoice.email_log.push({ sent_at: new Date(), sent_to: toEmail, status: 'sent' });
    }

    invoice.sent_at = new Date();
    if (['Draft', 'IRN Generated', 'IRN Pending'].includes(invoice.status)) invoice.status = 'Sent';
    invoice.updated_by = req.user._id;
    await invoice.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_no}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/invoices/:id/cancel-irn  (BE-012 §6)
// 24-hour window check
// ─────────────────────────────────────────────────────────────────────────────
const cancelIrn = async (req, res) => {
  try {
    const invoice = await SalesInvoice.findOne({ _id: req.params.id, is_active: true });
    if (!invoice) return err(res, 'Invoice not found', 404);
    if (!invoice.e_invoice?.irn) return err(res, 'No IRN exists on this invoice', 400);
    if (invoice.e_invoice?.irn_cancelled_at) return err(res, 'IRN already cancelled', 400);

    // 24-hour window check (BE-012 §6)
    const generatedAt = invoice.e_invoice.irn_generated_at || invoice.createdAt;
    const hoursSince  = (Date.now() - new Date(generatedAt).getTime()) / 3600000;
    if (hoursSince > 24) {
      return err(res,
        'IRN cancellation window (24 hours) has expired. ' +
        'Please issue a Credit Note to reverse this invoice.',
        400
      );
    }

    const { cancel_reason = '1', cancel_remarks = '' } = req.body;
    const company = await Company.findOne({ is_active: true });

    // Call IRP cancel API
    try {
      await axios.post(`${process.env.IRP_BASE_URL || 'https://einvoice1.gst.gov.in/EInvAPI/2/api'}/Invoice/Cancel`, {
        Gstin:         company?.gstin || '',
        IrnNo:         invoice.e_invoice.irn,
        CancelRsnCode: cancel_reason,
        CancelRmrk:    cancel_remarks,
      }, {
        headers: {
          'Content-Type':'application/json',
          'AuthToken': process.env.IRP_AUTH_TOKEN || '',
          'gstin': company?.gstin || '',
        },
        timeout: 30000,
      });
    } catch (axiosErr) {
      if (process.env.NODE_ENV === 'production') {
        return err(res, `IRP cancel API error: ${axiosErr.message}`, 502);
      }
      // In dev: proceed anyway (mock)
    }

    invoice.e_invoice.irn_cancelled_at = new Date();
    invoice.e_invoice.cancel_reason    = cancel_reason;
    invoice.e_invoice.cancel_remarks   = cancel_remarks;
    invoice.status                     = 'Cancelled';
    invoice.cancelled_at               = new Date();
    invoice.cancel_reason              = cancel_remarks || 'IRN cancelled';
    invoice.updated_by                 = req.user._id;
    await invoice.save();

    // Reverse GL entry
    if (invoice.gl_journal_id) {
      const origJournal = await GLJournalEntry.findById(invoice.gl_journal_id);
      if (origJournal) {
        const reversalLines = origJournal.lines.map(l => ({
          account_code: l.account_code,
          account_name: l.account_name,
          debit:  l.credit,   // swap DR/CR
          credit: l.debit,
          narration: `Reversal: ${l.narration}`,
        }));
        await GLJournalEntry.create({
          journal_type:   'Sales Invoice',
          reference_type: 'SalesInvoice',
          reference_id:   invoice._id,
          reference_no:   `${invoice.invoice_no}-REVERSAL`,
          narration:      `IRN Cancellation Reversal — ${invoice.invoice_no}`,
          lines:          reversalLines,
          posted_by:      req.user._id,
        });
      }
    }

    ok(res, { message: 'IRN cancelled successfully', data: { irn: invoice.e_invoice.irn, cancelled_at: invoice.e_invoice.irn_cancelled_at } });
  } catch (e) { err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/invoices
// ─────────────────────────────────────────────────────────────────────────────
const getInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, customer_id, so_id, from, to, sort = '-invoice_date' } = req.query;
    const q = { is_active: true };
    if (status)     q.status      = { $in: status.split(',') };
    if (customer_id)q.customer_id = customer_id;
    if (so_id)      q.so_id       = so_id;
    if (from || to) { q.invoice_date = {}; if (from) q.invoice_date.$gte = new Date(from); if (to) q.invoice_date.$lte = new Date(to); }

    const [data, total] = await Promise.all([
      SalesInvoice.find(q).select('-items -hsn_breakup -e_invoice.signed_invoice -e_invoice.irp_response_raw')
        .sort(sort).skip((parseInt(page) - 1) * parseInt(limit)).limit(parseInt(limit)).lean(),
      SalesInvoice.countDocuments(q),
    ]);
    ok(res, { data, pagination: { page: parseInt(page), total, pages: Math.ceil(total / parseInt(limit)) } });
  } catch (e) { err(res, e.message); }
};

const getInvoice = async (req, res) => {
  try {
    const inv = await SalesInvoice.findOne({ _id: req.params.id, is_active: true })
      .populate('so_id', 'so_number customer_po_number')
      .populate('created_by', 'Username email');
    if (!inv) return err(res, 'Invoice not found', 404);
    ok(res, { data: inv });
  } catch (e) { err(res, e.message); }
};

module.exports = {
  createInvoice, getInvoices, getInvoice,
  submitIrn, sendInvoice, cancelIrn,
  // exported for use by other modules
  amountInWords, postGLEntries,
};