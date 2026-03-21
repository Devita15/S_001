'use strict';
/**
 * CUSTOMER MASTER
 *
 * Architecture decisions:
 *
 * EMBEDDED:
 *   billing_address     — single object, always read with customer,
 *                         tightly coupled (used on every invoice print)
 *   shipping_addresses[]— bounded array (~1–5 plants), always fetched
 *                         together, no independent lifecycle
 *   contacts[]          — bounded array (~2–5), always shown on customer
 *                         page, never queried independently
 *   bank_details        — single object, always read with customer
 *
 * REFERENCED:
 *   assigned_to         — Employee doc, separate lifecycle
 */

const mongoose = require('mongoose');
require('../CRM/Customeridcounter');

// ── Address sub-schema (used for billing + shipping) ─────────────────────────
const addressSchema = new mongoose.Schema({
  line1:      { type: String, required: true },
  line2:      { type: String, default: '' },
  city:       { type: String, required: true },
  district:   { type: String, default: '' },
  state:      { type: String, required: true },
  state_code: { type: Number, required: true, min: 1, max: 37 },
  pincode:    { type: String, required: true },
  country:    { type: String, default: 'India' },
}, { _id: false });   // no _id — tightly embedded, never referenced alone

// ── Shipping address (extends base address with a label + default flag) ──────
const shippingAddressSchema = new mongoose.Schema({
  label:      { type: String, required: true },   // e.g. 'Pune Plant', 'Aurangabad WH'
  line1:      { type: String, required: true },
  line2:      { type: String, default: '' },
  city:       { type: String, required: true },
  district:   { type: String, default: '' },
  state:      { type: String, required: true },
  state_code: { type: Number, required: true, min: 1, max: 37 },
  pincode:    { type: String, required: true },
  country:    { type: String, default: 'India' },
  is_default: { type: Boolean, default: false },
}, { _id: true });   // _id here — needed for update/remove by id via manageAddresses

// ── Contact person sub-schema ────────────────────────────────────────────────
const contactSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  designation: { type: String, default: '' },
  department:  { type: String, default: '' },
  phone:       { type: String, default: '' },
  mobile:      { type: String, default: '' },
  email: {
    type: String,
    default: '',
    lowercase: true,
    trim: true,
    match: [/^$|^\S+@\S+\.\S+$/, 'Invalid email format'],
  },
  is_primary: { type: Boolean, default: false },
}, { _id: true });


// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER SCHEMA  (fields from spec §1.6)
// ─────────────────────────────────────────────────────────────────────────────
const customerSchema = new mongoose.Schema({

  // ── §1.6.1  Core Identity ──────────────────────────────────────────────────
  customer_id: {
    // auto-generated: CUST-YYYYMM-XXXX
    type: String, unique: true, sparse: true, index: true,
  },
  customer_code: {
    type: String, required: [true, 'Customer code required'],
    unique: true, trim: true, uppercase: true,
  },
  customer_name: {
    type: String, required: [true, 'Customer name required'], trim: true,
  },
  customer_type: {
    type: String,
    required: [true, 'Customer type required'],
    enum: ['OEM', 'Dealer', 'Distributor', 'Direct', 'Government', 'Export', 'Other'],
  },
  industry_segment: {
    type: String,
    enum: ['Automotive', 'Electronics', 'Energy', 'Switchgear', 'EV',
           'Defence', 'General', ''],
    default: '',
  },
  priority: {
    type: String,
    enum: ['Key Account', 'Regular', 'Prospect', 'Dormant', ''],
    default: 'Regular',
  },

  // ── §1.6.2  Tax & Compliance ───────────────────────────────────────────────
  gstin: {
    type: String,
    sparse: true,  // This allows multiple nulls in unique index
    unique: true,
    trim: true,
    uppercase: true,
    validate: {
      validator: function(v) {
        // If value is null, empty, or undefined, skip validation (allow null)
        if (!v || v === '') return true;
        // Validate GSTIN format
        return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
      },
      message: 'Invalid GSTIN format - expected e.g. 27AAECS7112G1Z5'
    }
  },
  pan: {
    type: String,
    default: '',
    validate: {
      validator: v => !v || /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v),
      message:   'PAN format: AAAAA9999A',
    },
  },
  tan:         { type: String, default: '' },
  msme_number: { type: String, default: '' },
  is_sez:      { type: Boolean, default: false },
  is_export:   { type: Boolean, default: false },

  // ── §1.6.3  Financial & Credit ────────────────────────────────────────────
  credit_limit:  { type: Number, default: 0, min: 0 },    // 0 = no limit (advance)
  credit_days:   { type: Number, default: 30, min: 0 },
  payment_terms: {
    type: String,
    enum: ['Advance', 'On Delivery', 'Net 15', 'Net 30', 'Net 45',
           'Net 60', 'Net 90', 'LC', 'Custom'],
    default: 'Net 30',
  },
  currency: {
    type: String,
    enum: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'JPY'],
    default: 'INR',
  },
  // bank_details EMBEDDED — single object, always read with customer,
  // used for advance payment / LC processing
  bank_details: {
    bank_name:    { type: String, default: '' },
    account_no:   { type: String, default: '' },
    ifsc:         { type: String, default: '' },
    branch:       { type: String, default: '' },
    account_name: { type: String, default: '' },
  },
  credit_outstanding: { type: Number, default: 0, min: 0 },  // updated by AR module
  is_credit_hold:     { type: Boolean, default: false },

  // ── §1.6.4  Address & Contact ─────────────────────────────────────────────
  // billing_address EMBEDDED — always printed on invoices, no standalone query
  billing_address: {
    type: addressSchema,
    required: [true, 'Billing address required'],
  },
  // shipping_addresses EMBEDDED — bounded array, always fetched with customer
  shipping_addresses: [shippingAddressSchema],
  // contacts EMBEDDED — bounded array, always shown on customer page
  contacts: [contactSchema],

  // ── Territory & CRM ───────────────────────────────────────────────────────
  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null,
  },
  territory: { type: String, default: '' },

  // ── Lead Conversion Source ────────────────────────────────────────────────
  source_lead_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  source_lead_no:     { type: String, default: '' },

  // ── Internal ──────────────────────────────────────────────────────────────
  internal_remarks: { type: String, default: '' },
  is_active:        { type: Boolean, default: true, index: true },
  is_blacklisted:   { type: Boolean, default: false },
  blacklist_reason: { type: String, default: '' },

  // ── Audit ─────────────────────────────────────────────────────────────────
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});


// ── Indexes ───────────────────────────────────────────────────────────────────
customerSchema.index(
  { gstin: 1 }, 
  { 
    unique: true, 
    sparse: true,
    partialFilterExpression: { gstin: { $exists: true, $ne: null, $ne: "" } }
  }
);
customerSchema.index({ customer_code: 1 }, { unique: true });
customerSchema.index({ customer_name: 'text' });
customerSchema.index({ customer_type: 1, priority: 1 });
customerSchema.index({ assigned_to: 1 });
customerSchema.index({ createdAt: -1 });


// ── Virtuals ──────────────────────────────────────────────────────────────────
customerSchema.virtual('primary_contact').get(function () {
  return this.contacts?.find(c => c.is_primary) ?? this.contacts?.[0] ?? null;
});

customerSchema.virtual('default_shipping').get(function () {
  return this.shipping_addresses?.find(a => a.is_default) ?? this.shipping_addresses?.[0] ?? null;
});

customerSchema.virtual('credit_available').get(function () {
  if (this.credit_limit === 0) return null;   // null = unlimited
  return Math.max(0, this.credit_limit - this.credit_outstanding);
});


// ── Pre-save: enforce max one primary contact ─────────────────────────────────
customerSchema.pre('save', function (next) {
  const primaries = (this.contacts || []).filter(c => c.is_primary);
  if (primaries.length > 1) {
    return next(new Error('Only one contact can be marked is_primary'));
  }
  next();
});

// ── Pre-save: auto-generate customer_id ──────────────────────────────────────
customerSchema.pre('save', async function (next) {
  if (this.customer_id) return next();

  const y = new Date().getFullYear();
  const m = (new Date().getMonth() + 1).toString().padStart(2, '0');

  const counter = await mongoose.model('CustomerIdCounter').findOneAndUpdate(
    { _id: `cust-${y}${m}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );

  this.customer_id = `CUST-${y}${m}-${counter.seq.toString().padStart(4, '0')}`;
  next();
});


module.exports = mongoose.model('Customer', customerSchema);