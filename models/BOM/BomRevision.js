const mongoose = require("mongoose");

const bomRevisionSchema = new mongoose.Schema({
  revision_id: {
    type: String,
    required: [true, 'Revision ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  bom_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Bom",
    required: [true, 'BOM ID is required'],
    index: true
  },
  revision_no: {
    type: Number,
    required: [true, 'Revision number is required'],
    min: 0
  },
  snapshot_data: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Snapshot data is required']
  },
  change_description: {
    type: String,
    required: [true, 'Change description is required'],
    trim: true
  },
  changes_summary: {
    type: String,
    trim: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, 'Created by is required']
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  pdf_path: {
    type: String,
    trim: true
  },
  email_sent_to: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  is_current: {
    type: Boolean,
    default: false
  },
  previous_revision_no: {
    type: Number
  },
  next_revision_no: {
    type: Number
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Compound index for BOM + revision number
bomRevisionSchema.index({ bom_id: 1, revision_no: 1 }, { unique: true });

// Index for current revision lookup
bomRevisionSchema.index({ bom_id: 1, is_current: 1 });

module.exports = mongoose.model("BomRevision", bomRevisionSchema);