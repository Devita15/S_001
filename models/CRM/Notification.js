'use strict';
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION MODEL
// Used by CRON job to store overdue follow-up alerts
// Separate from HR notifications — CRM specific
// ─────────────────────────────────────────────────────────────────────────────

const LeadnotificationSchema = new mongoose.Schema({

  type: {
    type:     String,
    required: true,
    enum:     ['OVERDUE_FOLLOWUP'],   // add more types here in future phases
    index:    true,
  },

  title:   { type: String, default: '' },
  message: { type: String, required: true },

  // Which lead this notification is about
  lead_id: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'Lead',
    default: null,
    index:   true,
  },

  // Which salesperson is assigned to the lead
  assigned_to: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'Employee',
    default: null,
    index:   true,
  },

  // Read status — per notification
  is_read:  { type: Boolean, default: false, index: true },

  // The actual overdue date for sorting
  due_date: { type: Date, default: null },

}, {
  timestamps: true,   // createdAt, updatedAt
});

// ── Indexes ───────────────────────────────────────────────────────────────────
LeadnotificationSchema.index({ type: 1, is_read: 1 });
LeadnotificationSchema.index({ assigned_to: 1, is_read: 1 });
LeadnotificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('LeadNotification', LeadnotificationSchema);