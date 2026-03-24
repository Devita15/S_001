'use strict';
const mongoose = require('mongoose');
require('./InvoiceIdCounter');

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE STATUS
// ─────────────────────────────────────────────────────────────────────────────
const INVOICE_STATUSES = ['Draft', 'IRN Pending', 'IRN Generated', 'Sent', 'Partially Paid', 'Fully Paid', 'Cancelled', 'Credit Note Issued'];

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE LINE ITEM  (per-DC-line costed item)
// ─────────────────────────────────────────────────────────────────────────────
const invoiceItemSchema = new mongoose.Schema({
  so_line_item_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  dc_id:           { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryChallan', default: null },
  dc_line_item_id: { type: mongoose.Schema.Types.ObjectId, default: null },

  // Item details (snapshot)
  part_no:      { type: String, required: true, trim: true },
  part_name:    { type: String, required: true },
  hsn_code:     { type: String, required: true },
  unit:         { type: String, enum: ['Nos', 'Kg', 'Meter', 'Set', 'Piece'], default: 'Nos' },
  drawing_no:   { type: String, default: '' },
  revision_no:  { type: String, default: '0' },

  // Quantities
  quantity:     { type: Number, required: true, min: 0.001 },

  // Pricing
  unit_price:       { type: Number, required: true, min: 0 },
  discount_percent: { type: Number, default: 0, min: 0, max: 100 },
  discount_amount:  { type: Number, default: 0 },
  taxable_amount:   { type: Number, default: 0 },

  // GST  (CGST+SGST or IGST depending on invoice gst_type)
  gst_percentage: { type: Number, default: 18 },
  cgst_rate:      { type: Number, default: 0 },
  sgst_rate:      { type: Number, default: 0 },
  igst_rate:      { type: Number, default: 0 },
  cgst_amount:    { type: Number, default: 0 },
  sgst_amount:    { type: Number, default: 0 },
  igst_amount:    { type: Number, default: 0 },
  total_gst:      { type: Number, default: 0 },
  total_amount:   { type: Number, default: 0 },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// HSN-WISE GST BREAKUP  (for GSTR-1 and e-Invoice)
// ─────────────────────────────────────────────────────────────────────────────
const hsnBreakupSchema = new mongoose.Schema({
  hsn_code:       { type: String, required: true },
  description:    { type: String, default: '' },
  uqc:            { type: String, default: 'NOS' },      // Unit Quantity Code per GST portal
  quantity:       { type: Number, default: 0 },
  taxable_value:  { type: Number, default: 0 },
  gst_rate:       { type: Number, default: 18 },
  cgst_amount:    { type: Number, default: 0 },
  sgst_amount:    { type: Number, default: 0 },
  igst_amount:    { type: Number, default: 0 },
  total_tax:      { type: Number, default: 0 },
}, { _id: false });

// ─────────────────────────────────────────────────────────────────────────────
// E-INVOICE FIELDS
// ─────────────────────────────────────────────────────────────────────────────
const eInvoiceSchema = new mongoose.Schema({
  irn:              { type: String, default: '' },          // Invoice Reference Number from IRP
  ack_no:           { type: String, default: '' },          // Acknowledgement number
  ack_date:         { type: Date,   default: null },
  signed_invoice:   { type: String, default: '' },          // Signed JSON from IRP
  signed_qr_code:   { type: String, default: '' },          // QR code string
  qr_image_base64:  { type: String, default: '' },          // Rendered QR image
  irn_generated_at: { type: Date,   default: null },
  irn_cancelled_at: { type: Date,   default: null },
  cancel_reason:    { type: String, default: '' },
  cancel_remarks:   { type: String, default: '' },
  irp_response_raw: { type: mongoose.Schema.Types.Mixed },  // full IRP response stored
}, { _id: false });

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT ALLOCATION
// ─────────────────────────────────────────────────────────────────────────────
const paymentAllocationSchema = new mongoose.Schema({
  payment_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentReceipt', required: true },
  amount_allocated:{ type: Number, required: true, min: 0.01 },
  allocated_at:    { type: Date, default: Date.now },
  allocated_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// SALES INVOICE SCHEMA  (BE-012)
// ─────────────────────────────────────────────────────────────────────────────
const salesInvoiceSchema = new mongoose.Schema({

  // ── Identity ──────────────────────────────────────────────────────────────
  invoice_no:        { type: String, unique: true, sparse: true, index: true }, // auto-generated
  invoice_date:      { type: Date, default: Date.now, required: true },
  invoice_type:      { type: String, enum: ['Tax Invoice', 'Bill of Supply', 'Export Invoice'], default: 'Tax Invoice' },
  financial_year:    { type: String, default: '' },   // e.g. "2025-26" — for sequential numbering

  // ── Source Documents ──────────────────────────────────────────────────────
  so_id:             { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder', required: [true,'so_id required'] },
  so_number:         { type: String, default: '' },
  dc_ids:            [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryChallan' }],
  dc_numbers:        [{ type: String }],
  customer_po_number:{ type: String, default: '' },
  quotation_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', default: null },

  // ── Seller Snapshot ───────────────────────────────────────────────────────
  company_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  company_name:       { type: String, required: true },
  company_gstin:      { type: String, required: true },
  company_state:      { type: String, required: true },
  company_state_code: { type: Number, required: true },
  company_address:    { type: String, default: '' },
  company_pan:        { type: String, default: '' },

  // ── Buyer Snapshot ────────────────────────────────────────────────────────
  customer_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_name:       { type: String, required: true },
  customer_gstin:      { type: String, default: '' },
  customer_state:      { type: String, required: true },
  customer_state_code: { type: Number, required: true },
  customer_address:    { type: String, default: '' },
  customer_pan:        { type: String, default: '' },
  billing_address:     { type: mongoose.Schema.Types.Mixed, default: {} },
  shipping_address:    { type: mongoose.Schema.Types.Mixed, default: {} },
  customer_contact:    { type: String, default: '' },
  customer_email:      { type: String, default: '' },
  customer_phone:      { type: String, default: '' },

  // ── GST ───────────────────────────────────────────────────────────────────
  gst_type:        { type: String, enum: ['CGST/SGST', 'IGST'], required: true }, // inherited from SO, immutable

  // ── Line Items ────────────────────────────────────────────────────────────
  items: [invoiceItemSchema],

  // ── Totals ────────────────────────────────────────────────────────────────
  sub_total:      { type: Number, default: 0 },
  discount_total: { type: Number, default: 0 },
  taxable_total:  { type: Number, default: 0 },
  cgst_total:     { type: Number, default: 0 },
  sgst_total:     { type: Number, default: 0 },
  igst_total:     { type: Number, default: 0 },
  gst_total:      { type: Number, default: 0 },
  round_off:      { type: Number, default: 0 },
  grand_total:    { type: Number, required: true, default: 0 },
  amount_in_words:{ type: String, default: '' },

  // ── HSN-wise Breakup ─────────────────────────────────────────────────────
  hsn_breakup: [hsnBreakupSchema],

  // ── Payment Terms ─────────────────────────────────────────────────────────
  payment_terms:  { type: String, default: 'Net 30' },
  due_date:       { type: Date, default: null },   // invoice_date + credit_days
  paid_amount:    { type: Number, default: 0 },
  outstanding_amount: { type: Number, default: 0 },
  payment_allocations: [paymentAllocationSchema],

  // ── e-Invoice ─────────────────────────────────────────────────────────────
  e_invoice: { type: eInvoiceSchema, default: () => ({}) },
  irn_submission_attempts: { type: Number, default: 0 },

  // ── PDF ───────────────────────────────────────────────────────────────────
  pdf_path:   { type: String, default: '' },
  sent_at:    { type: Date, default: null },
  email_log:  [{ sent_at: Date, sent_to: String, status: String, error: String }],

  // ── GL Posting ────────────────────────────────────────────────────────────
  gl_posted:    { type: Boolean, default: false },
  gl_posted_at: { type: Date, default: null },
  gl_journal_id:{ type: mongoose.Schema.Types.ObjectId, ref: 'GLJournalEntry', default: null },

  // ── Status ────────────────────────────────────────────────────────────────
  status:      { type: String, enum: INVOICE_STATUSES, default: 'Draft', index: true },
  is_active:   { type: Boolean, default: true, index: true },
  cancelled_at:{ type: Date, default: null },
  cancel_reason:{ type: String, default: '' },

  // ── Terms & Conditions ────────────────────────────────────────────────────
  terms_conditions: [{ Title: String, Description: String, Sequence: Number }],
  notes:            { type: String, default: '' },

  // ── Audit ─────────────────────────────────────────────────────────────────
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});

// ─────────────────────────────────────────────────────────────────────────────
// INDEXES
// ─────────────────────────────────────────────────────────────────────────────
salesInvoiceSchema.index({ customer_id: 1, invoice_date: -1 });
salesInvoiceSchema.index({ so_id: 1 });
salesInvoiceSchema.index({ status: 1, is_active: 1 });
salesInvoiceSchema.index({ due_date: 1, status: 1 });
salesInvoiceSchema.index({ 'e_invoice.irn': 1 }, { sparse: true });
salesInvoiceSchema.index({ financial_year: 1, invoice_no: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// PRE-SAVE: auto-generate invoice_no (sequential, gapless per FY)
// ─────────────────────────────────────────────────────────────────────────────
salesInvoiceSchema.pre('save', async function (next) {
  if (this.invoice_no) return next();

  // Financial year: April–March
  const now = new Date();
  const fy  = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyKey = `${fy}-${String(fy + 1).slice(2)}`;
  this.financial_year = fyKey;

  const counter = await mongoose.model('InvoiceIdCounter').findOneAndUpdate(
    { _id: `inv-${fyKey}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  this.invoice_no = `INV-${fyKey}-${counter.seq.toString().padStart(5, '0')}`;
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// PRE-SAVE: compute totals + HSN breakup + due_date + outstanding
// ─────────────────────────────────────────────────────────────────────────────
salesInvoiceSchema.pre('save', function (next) {
  // Item-level calculations
  let sub = 0, disc = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0;
  const hsnMap = {};

  this.items.forEach(item => {
    const baseAmt    = item.unit_price * item.quantity;
    const discAmt    = baseAmt * (item.discount_percent / 100);
    const taxableAmt = baseAmt - discAmt;
    const gstPct     = item.gst_percentage || 18;

    item.discount_amount = +discAmt.toFixed(2);
    item.taxable_amount  = +taxableAmt.toFixed(2);

    if (this.gst_type === 'IGST') {
      item.igst_rate   = gstPct;
      item.cgst_rate   = 0; item.sgst_rate = 0;
      item.igst_amount = +(taxableAmt * gstPct / 100).toFixed(2);
      item.cgst_amount = 0; item.sgst_amount = 0;
      item.total_gst   = item.igst_amount;
      igst += item.igst_amount;
    } else {
      item.cgst_rate   = gstPct / 2;
      item.sgst_rate   = gstPct / 2;
      item.igst_rate   = 0;
      item.cgst_amount = +(taxableAmt * (gstPct / 2) / 100).toFixed(2);
      item.sgst_amount = +(taxableAmt * (gstPct / 2) / 100).toFixed(2);
      item.igst_amount = 0;
      item.total_gst   = item.cgst_amount + item.sgst_amount;
      cgst += item.cgst_amount;
      sgst += item.sgst_amount;
    }
    item.total_amount = +(taxableAmt + item.total_gst).toFixed(2);

    sub     += baseAmt;
    disc    += discAmt;
    taxable += taxableAmt;

    // HSN aggregation
    const hsn = item.hsn_code;
    if (!hsnMap[hsn]) {
      hsnMap[hsn] = { hsn_code: hsn, quantity: 0, taxable_value: 0, gst_rate: gstPct, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, total_tax: 0 };
    }
    hsnMap[hsn].quantity       += item.quantity;
    hsnMap[hsn].taxable_value  += taxableAmt;
    hsnMap[hsn].cgst_amount    += item.cgst_amount;
    hsnMap[hsn].sgst_amount    += item.sgst_amount;
    hsnMap[hsn].igst_amount    += item.igst_amount;
    hsnMap[hsn].total_tax      += item.total_gst;
  });

  this.sub_total      = +sub.toFixed(2);
  this.discount_total = +disc.toFixed(2);
  this.taxable_total  = +taxable.toFixed(2);
  this.cgst_total     = +cgst.toFixed(2);
  this.sgst_total     = +sgst.toFixed(2);
  this.igst_total     = +igst.toFixed(2);
  this.gst_total      = +(cgst + sgst + igst).toFixed(2);

  const raw = taxable + cgst + sgst + igst;
  this.round_off  = +(Math.round(raw) - raw).toFixed(2);
  this.grand_total= +Math.round(raw).toFixed(2);

  // HSN breakup
  this.hsn_breakup = Object.values(hsnMap).map(h => ({
    ...h,
    taxable_value: +h.taxable_value.toFixed(2),
    cgst_amount:   +h.cgst_amount.toFixed(2),
    sgst_amount:   +h.sgst_amount.toFixed(2),
    igst_amount:   +h.igst_amount.toFixed(2),
    total_tax:     +h.total_tax.toFixed(2),
  }));

  // Outstanding
  this.outstanding_amount = +(this.grand_total - (this.paid_amount || 0)).toFixed(2);

  next();
});

module.exports = mongoose.model('SalesInvoice', salesInvoiceSchema);