'use strict';
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// CREDIT NOTE  (BE-014)
// ─────────────────────────────────────────────────────────────────────────────
const cnItemSchema = new mongoose.Schema({
  part_no:        { type: String, required: true },
  part_name:      { type: String, required: true },
  hsn_code:       { type: String, required: true },
  unit:           { type: String, default: 'Nos' },
  quantity:       { type: Number, required: true, min: 0.001 },
  unit_price:     { type: Number, required: true, min: 0 },
  taxable_amount: { type: Number, default: 0 },
  gst_percentage: { type: Number, default: 18 },
  cgst_amount:    { type: Number, default: 0 },
  sgst_amount:    { type: Number, default: 0 },
  igst_amount:    { type: Number, default: 0 },
  total_amount:   { type: Number, default: 0 },
}, { _id: true });

const creditNoteSchema = new mongoose.Schema({

  cn_number:    { type: String, unique: true, sparse: true, index: true },
  cn_date:      { type: Date, default: Date.now, required: true },
  financial_year: { type: String, default: '' },

  // Source invoice reference (mandatory)
  invoice_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'SalesInvoice', required: [true, 'invoice_id required'] },
  invoice_no:    { type: String, required: true },
  invoice_date:  { type: Date, required: true },
  so_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'SalesOrder', default: null },

  // GSTR-1 period determination
  gstr1_period:      { type: String, default: '' },  // "MM-YYYY" e.g. "03-2026"
  same_period_as_invoice: { type: Boolean, default: true },

  // Seller
  company_id:         { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  company_name:       { type: String, required: true },
  company_gstin:      { type: String, required: true },

  // Buyer
  customer_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customer_name:      { type: String, required: true },
  customer_gstin:     { type: String, default: '' },

  // GST type (must match original invoice)
  gst_type:    { type: String, enum: ['CGST/SGST', 'IGST'], required: true },

  items: [cnItemSchema],

  // Totals
  taxable_total: { type: Number, default: 0 },
  cgst_total:    { type: Number, default: 0 },
  sgst_total:    { type: Number, default: 0 },
  igst_total:    { type: Number, default: 0 },
  gst_total:     { type: Number, default: 0 },
  grand_total:   { type: Number, default: 0 },
  amount_in_words: { type: String, default: '' },

  hsn_breakup: [{
    hsn_code: String, taxable_value: Number, gst_rate: Number,
    cgst_amount: Number, sgst_amount: Number, igst_amount: Number, total_tax: Number,
  }],

  reason:     { type: String, required: [true, 'Reason for credit note is required'] },
  notes:      { type: String, default: '' },

  // GL
  gl_posted:    { type: Boolean, default: false },
  gl_journal_id:{ type: mongoose.Schema.Types.ObjectId, ref: 'GLJournalEntry', default: null },

  status:    { type: String, enum: ['Draft', 'Approved', 'Cancelled'], default: 'Approved' },
  is_active: { type: Boolean, default: true },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

}, { timestamps: true });

// Auto-generate CN number
creditNoteSchema.pre('save', async function (next) {
  if (this.cn_number) return next();
  const now = new Date();
  const fy  = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyKey = `${fy}-${String(fy + 1).slice(2)}`;
  this.financial_year = fyKey;
  const counter = await mongoose.model('InvoiceIdCounter').findOneAndUpdate(
    { _id: `cn-${fyKey}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  this.cn_number = `CN-${fyKey}-${counter.seq.toString().padStart(5, '0')}`;
  next();
});

// Compute totals + HSN breakup + GSTR-1 period
creditNoteSchema.pre('save', function (next) {
  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  const hsnMap = {};

  this.items.forEach(item => {
    const taxableAmt = item.unit_price * item.quantity;
    const gstPct     = item.gst_percentage || 18;
    item.taxable_amount = +taxableAmt.toFixed(2);

    if (this.gst_type === 'IGST') {
      item.igst_amount = +(taxableAmt * gstPct / 100).toFixed(2);
      item.cgst_amount = 0; item.sgst_amount = 0;
      igst += item.igst_amount;
    } else {
      item.cgst_amount = +(taxableAmt * (gstPct / 2) / 100).toFixed(2);
      item.sgst_amount = +(taxableAmt * (gstPct / 2) / 100).toFixed(2);
      item.igst_amount = 0;
      cgst += item.cgst_amount; sgst += item.sgst_amount;
    }
    item.total_amount = +(taxableAmt + item.cgst_amount + item.sgst_amount + item.igst_amount).toFixed(2);
    taxable += taxableAmt;

    const hsn = item.hsn_code;
    if (!hsnMap[hsn]) hsnMap[hsn] = { hsn_code: hsn, taxable_value: 0, gst_rate: gstPct, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, total_tax: 0 };
    hsnMap[hsn].taxable_value += taxableAmt;
    hsnMap[hsn].cgst_amount   += item.cgst_amount;
    hsnMap[hsn].sgst_amount   += item.sgst_amount;
    hsnMap[hsn].igst_amount   += item.igst_amount;
    hsnMap[hsn].total_tax     += (item.cgst_amount + item.sgst_amount + item.igst_amount);
  });

  this.taxable_total = +taxable.toFixed(2);
  this.cgst_total    = +cgst.toFixed(2);
  this.sgst_total    = +sgst.toFixed(2);
  this.igst_total    = +igst.toFixed(2);
  this.gst_total     = +(cgst + sgst + igst).toFixed(2);
  this.grand_total   = +(taxable + cgst + sgst + igst).toFixed(2);
  this.hsn_breakup   = Object.values(hsnMap);

  // GSTR-1 period: same month as invoice → reverse in same period; else use CN month
  const invoiceMM = new Date(this.invoice_date).getMonth();
  const invoiceYY = new Date(this.invoice_date).getFullYear();
  const cnMM      = new Date(this.cn_date).getMonth();
  const cnYY      = new Date(this.cn_date).getFullYear();
  this.same_period_as_invoice = (invoiceMM === cnMM && invoiceYY === cnYY);
  const periodDate = this.same_period_as_invoice ? new Date(this.invoice_date) : new Date(this.cn_date);
  this.gstr1_period = `${String(periodDate.getMonth() + 1).padStart(2,'0')}-${periodDate.getFullYear()}`;

  next();
});

const CreditNote = mongoose.model('CreditNote', creditNoteSchema);

// ─────────────────────────────────────────────────────────────────────────────
// GL JOURNAL ENTRY  (double-entry accounting records)
// ─────────────────────────────────────────────────────────────────────────────
const glLineSchema = new mongoose.Schema({
  account_code:  { type: String, required: true },
  account_name:  { type: String, required: true },
  debit:         { type: Number, default: 0, min: 0 },
  credit:        { type: Number, default: 0, min: 0 },
  narration:     { type: String, default: '' },
}, { _id: true });

const glJournalSchema = new mongoose.Schema({
  journal_no:     { type: String, unique: true, sparse: true },
  journal_date:   { type: Date, default: Date.now },
  journal_type:   { type: String, enum: ['Sales Invoice', 'Credit Note', 'Payment Receipt', 'Advance', 'Other'], required: true },

  reference_type: { type: String, enum: ['SalesInvoice', 'CreditNote', 'PaymentReceipt', 'Advance'], required: true },
  reference_id:   { type: mongoose.Schema.Types.ObjectId, required: true },
  reference_no:   { type: String, required: true },

  narration:      { type: String, default: '' },
  lines:          [glLineSchema],

  total_debit:    { type: Number, default: 0 },
  total_credit:   { type: Number, default: 0 },
  is_balanced:    { type: Boolean, default: false },

  posted_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  is_active:      { type: Boolean, default: true },
}, { timestamps: true });

glJournalSchema.pre('save', function (next) {
  this.total_debit  = +this.lines.reduce((s, l) => s + l.debit,  0).toFixed(2);
  this.total_credit = +this.lines.reduce((s, l) => s + l.credit, 0).toFixed(2);
  this.is_balanced  = Math.abs(this.total_debit - this.total_credit) < 0.01;
  next();
});

const GLJournalEntry = mongoose.model('GLJournalEntry', glJournalSchema);

// ─────────────────────────────────────────────────────────────────────────────
// ID COUNTERS (shared atomic counter)
// ─────────────────────────────────────────────────────────────────────────────
const idCounterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
mongoose.model('SalesOrderIdCounter', idCounterSchema);
mongoose.model('InvoiceIdCounter',    idCounterSchema);

module.exports = { CreditNote, GLJournalEntry };