'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// models/CRM/SalesOrder.js
// Phase 03 — complete Sales Order schema
//
// KEY DESIGN DECISIONS:
//   1. unit_price on each line item is the FINAL price agreed by the sales team.
//      It is never auto-populated from any quotation. The controller sets it
//      from whatever the request body contains.
//   2. All financial totals (sub_total, gst_total, grand_total etc.) are
//      auto-computed in the pre-save hook from the current line items.
//      Never store computed values manually.
//   3. pending_qty is a virtual field — never stored, always computed.
//   4. gst_type is immutable after creation (set in controller, never overridden).
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
require('./SalesOrderIdCounter');


// ─────────────────────────────────────────────────────────────────────────────
// STATUS MACHINE
// ─────────────────────────────────────────────────────────────────────────────
const SO_STATUS_TRANSITIONS = {
  'Draft':               ['Confirmed', 'Cancelled'],
  'Confirmed':           ['In Production', 'Cancelled'],
  'In Production':       ['Ready for Dispatch', 'Cancelled'],
  'Ready for Dispatch':  ['Partially Delivered', 'Fully Delivered'],
  'Partially Delivered': ['Fully Delivered', 'Cancelled'],
  'Fully Delivered':     ['Closed'],
  'Closed':              [],
  'Cancelled':           [],
};

const SO_STATUSES = Object.keys(SO_STATUS_TRANSITIONS);

const ITEM_STATUSES = [
  'Pending',
  'In Production',
  'Ready',
  'Partially Delivered',
  'Delivered',
  'Cancelled',
];

// ─────────────────────────────────────────────────────────────────────────────
// Address snapshot sub-schema
// Copied from Customer at SO creation. Never live-referenced after that.
// ─────────────────────────────────────────────────────────────────────────────
const addressSnapshotSchema = new mongoose.Schema({
  line1:      { type: String, default: '' },
  line2:      { type: String, default: '' },
  city:       { type: String, default: '' },
  district:   { type: String, default: '' },
  state:      { type: String, default: '' },
  state_code: { type: Number, default: 0 },
  pincode:    { type: String, default: '' },
  country:    { type: String, default: 'India' },
}, { _id: false });

// ─────────────────────────────────────────────────────────────────────────────
// SO Line Item sub-schema
// ─────────────────────────────────────────────────────────────────────────────
const soLineItemSchema = new mongoose.Schema({

  // Identity
  part_no:     { type: String, required: [true, 'part_no required'], trim: true, uppercase: true },
  part_name:   { type: String, required: [true, 'part_name required'], trim: true },
  hsn_code:    { type: String, required: [true, 'hsn_code required'], trim: true },
  drawing_no:  { type: String, default: '' },
  revision_no: { type: String, default: '0' },
  unit: {
    type:    String,
    enum:    ['Nos', 'Kg', 'Meter', 'Set', 'Piece'],
    default: 'Nos',
  },

  // Quantities
  ordered_qty:   { type: Number, required: [true, 'ordered_qty required'], min: [0.001, 'Min qty is 0.001'] },
  delivered_qty: { type: Number, default: 0, min: 0 },
  // pending_qty is a virtual — see below

  // Commercial (unit_price = sales-team-agreed final price, NOT from quotation)
  unit_price:       { type: Number, required: [true, 'unit_price required'], min: 0 },
  discount_percent: { type: Number, default: 0, min: 0, max: 100 },
  discount_amount:  { type: Number, default: 0 },
  taxable_amount:   { type: Number, default: 0 },
  gst_percentage:   { type: Number, default: 18 },
  cgst_amount:      { type: Number, default: 0 },
  sgst_amount:      { type: Number, default: 0 },
  igst_amount:      { type: Number, default: 0 },
  total_amount:     { type: Number, default: 0 },

  // Delivery dates
  required_date:        { type: Date, default: null },   // customer's requested date
  committed_date:       { type: Date, default: null },   // our committed date
  actual_delivery_date: { type: Date, default: null },   // set when fully delivered

  // Status
  item_status: {
    type:    String,
    enum:    ITEM_STATUSES,
    default: 'Pending',
  },
  remarks: { type: String, default: '' },

  // Soft cancel at line level
  is_cancelled:  { type: Boolean, default: false },
  cancelled_at:  { type: Date,    default: null  },
  cancel_reason: { type: String,  default: ''    },

  // Linked Work Order (set when Phase 05 WO is created)
  work_order_id: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'WorkOrder',
    default: null,
  },

}, { _id: true });

// Virtuals on line item
soLineItemSchema.virtual('pending_qty').get(function () {
  return +(Math.max(0, this.ordered_qty - this.delivered_qty)).toFixed(4);
});

soLineItemSchema.virtual('is_overdue').get(function () {
  if (!this.committed_date) return false;
  if (['Delivered', 'Cancelled'].includes(this.item_status)) return false;
  return new Date() > new Date(this.committed_date);
});

// ─────────────────────────────────────────────────────────────────────────────
// Revision History sub-schema
// ─────────────────────────────────────────────────────────────────────────────
const revisionHistorySchema = new mongoose.Schema({
  revision_no:     { type: Number, required: true },
  revised_at:      { type: Date,   default: Date.now },
  revised_by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason:          { type: String, default: '' },
  changes_summary: [{
    field:     { type: String },
    old_value: { type: mongoose.Schema.Types.Mixed },
    new_value: { type: mongoose.Schema.Types.Mixed },
  }],
  // Deep copy of items array at this revision — never overwritten
  items_snapshot: { type: mongoose.Schema.Types.Mixed },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log sub-schema
// ─────────────────────────────────────────────────────────────────────────────
const auditLogSchema = new mongoose.Schema({
  changed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changed_at: { type: Date, default: Date.now },
  action:     { type: String, required: true },
  old_value:  { type: mongoose.Schema.Types.Mixed },
  new_value:  { type: mongoose.Schema.Types.Mixed },
  notes:      { type: String, default: '' },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// SALES ORDER SCHEMA
// ─────────────────────────────────────────────────────────────────────────────
const salesOrderSchema = new mongoose.Schema({

  // ── Identity & Linkage ────────────────────────────────────────────────────
  so_number:    { type: String, unique: true, sparse: true, index: true },
  so_date:      { type: Date, default: Date.now, required: true },
  quotation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation', default: null },
  quotation_no: { type: String, default: '' },
  lead_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Lead',      default: null },

  // ── Customer PO Details ───────────────────────────────────────────────────
  customer_id: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Customer',
    required: [true, 'customer_id required'],
  },
  customer_name:      { type: String, required: [true, 'customer_name required'], trim: true },
  customer_gstin:     { type: String, default: '' },
  customer_po_number: { type: String, default: '', trim: true, index: true },
  customer_po_date:   { type: Date,   default: null },
  customer_po_file:   { type: String, default: '' },   // disk path of uploaded PO scan

  // ── Company & Addresses ───────────────────────────────────────────────────
  company_id: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Company',
    required: [true, 'company_id required'],
  },
  billing_address:  { type: addressSnapshotSchema, default: () => ({}) },
  shipping_address: { type: addressSnapshotSchema, default: () => ({}) },

  // gst_type: auto-determined at creation from state codes, immutable after that
  gst_type: {
    type:    String,
    enum:    ['CGST/SGST', 'IGST'],
    default: 'CGST/SGST',
  },

  // ── Financial Totals (auto-computed in pre-save) ──────────────────────────
  sub_total:      { type: Number, default: 0 },
  discount_total: { type: Number, default: 0 },
  taxable_total:  { type: Number, default: 0 },
  cgst_total:     { type: Number, default: 0 },
  sgst_total:     { type: Number, default: 0 },
  igst_total:     { type: Number, default: 0 },
  gst_total:      { type: Number, default: 0 },
  grand_total: {
    type:     Number,
    default:  0,
    required: [true, 'grand_total required'],
  },
  currency: {
    type:    String,
    enum:    ['INR', 'USD', 'EUR', 'GBP', 'AED'],
    default: 'INR',
  },

  // ── Delivery & Logistics ──────────────────────────────────────────────────
  payment_terms: { type: String, default: 'Net 30' },
  delivery_terms: {
    type:    String,
    enum:    ['Ex-Works', 'FOR Destination', 'CIF', 'FOB', ''],
    default: '',
  },
  delivery_mode: {
    type:    String,
    enum:    ['Road', 'Rail', 'Air', 'Sea', 'Hand Delivery', ''],
    default: '',
  },
  expected_delivery_date: { type: Date,   default: null },
  transporter:            { type: String, default: '' },
  valid_till:             { type: Date,   default: null },

  // ── Revision Control ──────────────────────────────────────────────────────
  current_revision:    { type: Number, default: 0 },
  revisions:           [revisionHistorySchema],
  cancellation_reason: { type: String, default: '' },
  terms_conditions:    [{ Title: String, Description: String, Sequence: Number }],
  internal_remarks:    { type: String, default: '' },   // NOT printed on customer docs

  // ── Status ────────────────────────────────────────────────────────────────
  status: {
    type:    String,
    enum:    SO_STATUSES,
    default: 'Draft',
    index:   true,
  },
  confirmed_at: { type: Date,    default: null },
  closed_at:    { type: Date,    default: null },
  is_active:    { type: Boolean, default: true, index: true },

  // ── Line Items ────────────────────────────────────────────────────────────
  items: {
    type: [soLineItemSchema],
    validate: {
      validator: (v) => v && v.length > 0,
      message:   'SO must have at least one line item',
    },
  },

  // ── Acknowledgement tracking ──────────────────────────────────────────────
  acknowledgement_sent_at: { type: Date,   default: null },
  acknowledgement_email:   { type: String, default: '' },

  // ── MRP / WO flags ────────────────────────────────────────────────────────
  mrp_triggered:      { type: Boolean, default: false },
  mrp_triggered_at:   { type: Date,    default: null  },
  mrp_rerun_required: { type: Boolean, default: false },

  // ── Audit ─────────────────────────────────────────────────────────────────
  audit_log:  [auditLogSchema],
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null  },

}, {
  timestamps: true,
  toJSON:     { virtuals: true },
  toObject:   { virtuals: true },
});

// ─────────────────────────────────────────────────────────────────────────────
// INDEXES
// ─────────────────────────────────────────────────────────────────────────────
salesOrderSchema.index({ customer_id: 1, status: 1 });
salesOrderSchema.index({ status: 1, is_active: 1 });
salesOrderSchema.index({ 'items.committed_date': 1, status: 1 });
salesOrderSchema.index({ customer_po_number: 'text', customer_name: 'text' });
salesOrderSchema.index({ createdAt: -1 });
salesOrderSchema.index({ quotation_id: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// VIRTUALS on SO
// ─────────────────────────────────────────────────────────────────────────────
salesOrderSchema.virtual('total_pending_qty').get(function () {
  return this.items.reduce(
    (s, i) => s + Math.max(0, i.ordered_qty - i.delivered_qty),
    0
  );
});

salesOrderSchema.virtual('is_fully_delivered').get(function () {
  const active = this.items.filter(i => !i.is_cancelled);
  return active.length > 0 && active.every(i => i.item_status === 'Delivered');
});

// ─────────────────────────────────────────────────────────────────────────────
// STATIC: validate status transitions
// ─────────────────────────────────────────────────────────────────────────────
salesOrderSchema.statics.isValidTransition = function (from, to) {
  return (SO_STATUS_TRANSITIONS[from] || []).includes(to);
};

salesOrderSchema.statics.validNextStatuses = function (currentStatus) {
  return SO_STATUS_TRANSITIONS[currentStatus] || [];
};

// ─────────────────────────────────────────────────────────────────────────────
// PRE-SAVE HOOK 1: auto-generate SO number SO-YYYYMM-XXXX
// ─────────────────────────────────────────────────────────────────────────────
salesOrderSchema.pre('save', async function (next) {
  if (this.so_number) return next();
  try {
    const y   = new Date().getFullYear();
    const m   = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const key = `so-${y}${m}`;
    const counter = await mongoose.model('SalesOrderIdCounter').findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    this.so_number = `SO-${y}${m}-${counter.seq.toString().padStart(4, '0')}`;
    return next();
  } catch (e) {
    return next(e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PRE-SAVE HOOK 2: recompute SO financial totals from line items
//
// Prices are locked at line-item level (unit_price on each item).
// This hook recomputes all totals from scratch on every save.
// It never reads from the quotation — the quotation is irrelevant here.
// ─────────────────────────────────────────────────────────────────────────────
salesOrderSchema.pre('save', function (next) {
  let sub = 0, disc = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0;

  this.items.forEach(item => {
    if (item.is_cancelled) return;   // excluded from financial totals

    const baseAmt    = +(item.unit_price * item.ordered_qty).toFixed(4);
    const discAmt    = +(baseAmt * (item.discount_percent / 100)).toFixed(4);
    const taxableAmt = +(baseAmt - discAmt).toFixed(4);
    const gstPct     = item.gst_percentage || 18;

    item.discount_amount = +discAmt.toFixed(2);
    item.taxable_amount  = +taxableAmt.toFixed(2);

    if (this.gst_type === 'IGST') {
      item.igst_amount  = +(taxableAmt * gstPct / 100).toFixed(2);
      item.cgst_amount  = 0;
      item.sgst_amount  = 0;
      item.total_amount = +(taxableAmt + item.igst_amount).toFixed(2);
      igst += item.igst_amount;
    } else {
      item.cgst_amount  = +(taxableAmt * (gstPct / 2) / 100).toFixed(2);
      item.sgst_amount  = +(taxableAmt * (gstPct / 2) / 100).toFixed(2);
      item.igst_amount  = 0;
      item.total_amount = +(taxableAmt + item.cgst_amount + item.sgst_amount).toFixed(2);
      cgst += item.cgst_amount;
      sgst += item.sgst_amount;
    }

    sub     += baseAmt;
    disc    += discAmt;
    taxable += taxableAmt;
  });

  this.sub_total      = +sub.toFixed(2);
  this.discount_total = +disc.toFixed(2);
  this.taxable_total  = +taxable.toFixed(2);
  this.cgst_total     = +cgst.toFixed(2);
  this.sgst_total     = +sgst.toFixed(2);
  this.igst_total     = +igst.toFixed(2);
  this.gst_total      = +(cgst + sgst + igst).toFixed(2);
  this.grand_total    = +(taxable + cgst + sgst + igst).toFixed(2);

  return next();
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);

module.exports = {
  SalesOrder,
  SO_STATUS_TRANSITIONS,
  SO_STATUSES,
  ITEM_STATUSES,
};