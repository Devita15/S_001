'use strict';
/**
 * LEAD / ENQUIRY MODEL
 *
 * Architecture decisions — what is embedded vs referenced:
 *
 * EMBEDDED (subdoc arrays / flat fields):
 *   enquired_items[]   — always fetched with lead, bounded (~20 items max),
 *                        no independent lifecycle or query need
 *   drawings[]         — metadata only (no binary), always shown with lead,
 *                        bounded, revision tracking done via is_latest flag
 *   follow_ups[]       — append-only activity log, always read with lead,
 *                        never queried independently
 *   feasibility_*      — flat scalar fields (4 fields), single check per lead,
 *                        always read with parent, no independent lifecycle
 *   audit_log[]        — append-only, always tied to parent, never standalone
 *
 * REFERENCED (ObjectId):
 *   assigned_to        — Employee doc, read independently by HR/admin modules
 *   customer_id        — Customer master, lives beyond lead lifecycle
 *   quotation_id       — Quotation master, Phase 02 entity
 */

const mongoose = require('mongoose');
require('../CRM/Leadidcounter');   // must be registered before pre-save hook uses it
require('../CRM/Customeridcounter');
// ─────────────────────────────────────────────────────────────────────────────
// STATE MACHINE  (exact statuses from spec doc table 12)
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_TRANSITIONS = {
  'New':           ['Contacted', 'Junk'],
  'Contacted':     ['Qualified', 'Junk'],
  'Qualified':     ['Proposal Sent'],        // feasibility gate lives here
  'Proposal Sent': ['Negotiation', 'Won', 'Lost'],
  'Negotiation':   ['Won', 'Lost'],
  'Won':           [],     // terminal — convert API takes over
  'Lost':          [],     // terminal
  'Junk':          [],     // terminal
};
const LEAD_STATUSES = Object.keys(STATUS_TRANSITIONS);


// ─────────────────────────────────────────────────────────────────────────────
// SUB-SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EnquiredItem — one part number in the enquiry.
 * Embedded: always fetched with lead, max ~20 per enquiry, no standalone query.
 */
const enquiredItemSchema = new mongoose.Schema({
  part_no:          { type: String, default: '', trim: true, uppercase: true },
  description:      { type: String, required: [true, 'Item description required'], trim: true },
  quantity:         { type: Number, required: [true, 'Quantity required'], min: [1, 'Min 1'] },
  unit:             { type: String, enum: ['Nos', 'Kg', 'Meter', 'Set', 'Piece'], default: 'Nos' },
  target_price:     { type: Number, default: 0, min: 0 },   // customer's stated target Rs/unit
  material_grade:   { type: String, default: '', trim: true },
  drawing_ref_no:   { type: String, default: '' },           // links to drawings[].drawing_no
  remarks:          { type: String, default: '' },
}, { _id: true });

/**
 * Drawing metadata — embedded.
 * Only metadata stored here (file_name, path, revision, is_latest).
 * Binary file is on disk/S3 — path stored as file_path.
 * Bounded: typically 1–5 revisions per drawing, ~3–10 drawings per lead.
 * Never queried independently in Phase 01.
 * Phase 02+ can extend with a separate Drawing master if needed.
 */
const drawingSchema = new mongoose.Schema({
  drawing_no:   { type: String, required: true, trim: true, uppercase: true },
  file_name:    { type: String, required: true },
  file_path:    { type: String, required: true },   // disk path or S3 key
  file_size_kb: { type: Number, default: 0 },
  mime_type:    { type: String, default: 'application/pdf' },
  revision_no:  { type: String, default: 'A', trim: true, uppercase: true },
  is_latest:    { type: Boolean, default: true },
  uploaded_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploaded_at:  { type: Date, default: Date.now },
  remarks:      { type: String, default: '' },
}, { _id: true });

/**
 * FollowUp — append-only activity log. Embedded.
 * Always read with lead. Salesperson needs full history when opening a lead.
 * Never queried across leads (e.g. "all WhatsApp follow-ups globally") in this phase.
 */
const followUpSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'Follow-up date required'],
    default: Date.now,
  },
  channel: {
    type: String,
    required: [true, 'Channel required'],
    enum: ['Call', 'Email', 'Visit', 'WhatsApp', 'Meeting'],
  },
  summary:          { type: String, required: [true, 'Summary required'] },
  next_action:      { type: String, default: '' },
  next_action_date: { type: Date, default: null },    // validated as future in Joi
  outcome: {
    type: String,
    enum: ['Positive', 'Neutral', 'Negative', 'No Response', ''],
    default: '',
  },
  done_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { _id: true });

/**
 * AuditLog — field-level change tracking. Embedded.
 * Append-only. Always read with lead for audit trail display.
 */
const auditLogSchema = new mongoose.Schema({
  changed_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changed_at:    { type: Date, default: Date.now },
  field_changed: { type: String, required: true },
  old_value:     { type: mongoose.Schema.Types.Mixed },
  new_value:     { type: mongoose.Schema.Types.Mixed },
}, { _id: true });


// ─────────────────────────────────────────────────────────────────────────────
// LEAD SCHEMA  (exact fields from spec doc §1.2)
// ─────────────────────────────────────────────────────────────────────────────
const leadSchema = new mongoose.Schema({

  // ── §1.2.1  Lead Identification & Source ───────────────────────────────────
  lead_id: {
    type: String, unique: true, sparse: true, index: true,
    // auto-generated: LEAD-YYYYMM-XXXX via atomic counter pre-save
  },
  lead_source: {
    type: String,
    required: [true, 'Lead source is required'],
    enum: ['Website', 'Email', 'WhatsApp', 'Phone', 'Exhibition',
           'Referral', 'Cold Outreach', 'Walk-In', 'LinkedIn', 'Other'],
  },
  lead_source_detail: { type: String, default: '', trim: true },
  subject: {
    type: String,
    required: [true, 'Enquiry subject is required'],
    trim: true,
  },
  description: { type: String, default: '' },

  // ── §1.2.2  Prospect / Company Information ─────────────────────────────────
  company_name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
  },
  company_website: { type: String, default: '' },
  industry: {
    type: String,
    default: '',
    trim: true,
    // e.g. Automotive | Switchgear | EV | Machine Builder | Defence | Electronics
  },
  company_size: {
    type: String,
    enum: ['Startup', 'SME', 'Mid-Market', 'Enterprise', 'Unknown', ''],
    default: '',
  },
  annual_turnover: { type: Number, default: 0, min: 0 },   // INR

  // ── §1.2.3  Contact Person ─────────────────────────────────────────────────
  contact_name: {
    type: String,
    required: [true, 'Contact name is required'],
    trim: true,
  },
  contact_email:  { type: String, default: '', lowercase: true, trim: true },
  contact_phone:  { type: String, default: '' },
  contact_mobile: { type: String, default: '' },
  designation:    { type: String, default: '', trim: true },

  // ── §1.2.4  Enquired Items & Drawings (EMBEDDED — tightly coupled) ──────────
  enquired_items: [enquiredItemSchema],
  drawings:       [drawingSchema],
  estimated_value: { type: Number, default: 0, min: 0 },   // INR

  // ── §1.2.5  Commercial & Timeline ─────────────────────────────────────────
  expected_close_date: { type: Date, default: null },
  priority: {
    type: String,
    enum: ['High', 'Medium', 'Low', ''],
    default: 'Medium',
  },
  tags: [{ type: String, trim: true }],

  // ── §1.2.6  Feasibility (FLAT FIELDS — single check, always read together) ──
  feasibility_status: {
    type: String,
    enum: ['Pending', 'Feasible', 'Not Feasible', 'Conditionally Feasible', ''],
    default: '',
    index: true,
  },
  feasibility_notes: { type: String, default: '' },
  feasibility_checked_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null,
  },
  feasibility_date: { type: Date, default: null },

  // ── §1.2.7  CRM Pipeline Status & Tracking ─────────────────────────────────
  status: {
    type: String,
    enum: LEAD_STATUSES,
    default: 'New',
    index: true,
  },
  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null,
    index: true,
  },
  next_follow_up_date: { type: Date, default: null, index: true },
  follow_ups: [followUpSchema],
  lost_reason: { type: String, default: '' },
  lost_to:     { type: String, default: '' },   // competitor name
  win_remarks: { type: String, default: '' },

  // ── §1.2.8  Conversion Fields ──────────────────────────────────────────────
  is_converted: { type: Boolean, default: false },
  converted_at: { type: Date, default: null },
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null,
  },
  quotation_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quotation',
    default: null,
  },

  // ── Audit Trail (EMBEDDED — append-only, always read with lead) ────────────
  audit_log: [auditLogSchema],

  // ── Soft-delete & meta ─────────────────────────────────────────────────────
  is_active:  { type: Boolean, default: true, index: true },
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
// Compound index from spec — dashboard queries filter by all three
leadSchema.index({ status: 1, assigned_to: 1, next_follow_up_date: 1 });
// Full-text search on pipeline list
leadSchema.index({ company_name: 'text', contact_name: 'text', subject: 'text' });
// Source + priority for pipeline analytics
leadSchema.index({ lead_source: 1, priority: 1 });
// Latest records first — default sort
leadSchema.index({ createdAt: -1 });
// Overdue follow-ups query
leadSchema.index({ is_active: 1, status: 1, next_follow_up_date: 1 });


// ─────────────────────────────────────────────────────────────────────────────
// VIRTUALS
// ─────────────────────────────────────────────────────────────────────────────
leadSchema.virtual('is_overdue').get(function () {
  return (
    this.next_follow_up_date != null &&
    this.next_follow_up_date < new Date() &&
    !['Won', 'Lost', 'Junk'].includes(this.status)
  );
});

leadSchema.virtual('total_items').get(function () {
  return this.enquired_items?.length ?? 0;
});

leadSchema.virtual('drawing_count').get(function () {
  return this.drawings?.filter(d => d.is_latest)?.length ?? 0;
});


// ─────────────────────────────────────────────────────────────────────────────
// STATICS
// ─────────────────────────────────────────────────────────────────────────────
leadSchema.statics.isValidTransition = function (from, to) {
  return (STATUS_TRANSITIONS[from] || []).includes(to);
};

leadSchema.statics.validNextStatuses = function (currentStatus) {
  return STATUS_TRANSITIONS[currentStatus] || [];
};


// ─────────────────────────────────────────────────────────────────────────────
// PRE-SAVE — auto-generate lead_id
// ─────────────────────────────────────────────────────────────────────────────
leadSchema.pre('save', async function (next) {
  if (this.lead_id) return next();

  const y = new Date().getFullYear();
  const m = (new Date().getMonth() + 1).toString().padStart(2, '0');

  const counter = await mongoose.model('LeadIdCounter').findOneAndUpdate(
    { _id: `lead-${y}${m}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );

  this.lead_id = `LEAD-${y}${m}-${counter.seq.toString().padStart(4, '0')}`;
  next();
});


module.exports = {
  Lead: mongoose.model('Lead', leadSchema),
  STATUS_TRANSITIONS,
  LEAD_STATUSES,
};