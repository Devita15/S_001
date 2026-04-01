'use strict';
const mongoose = require('mongoose');

// ── Drawing Revision Sub-document ─────────────────────────────────────────────
// Append-only. Never delete entries. Production always works to latest revision.
const drawingRevisionSchema = new mongoose.Schema({
  revision_no:        { type: String, required: true, trim: true },
  file_path:          { type: String, required: true, trim: true },
  approved_by:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approved_at:        { type: Date, required: true },
  change_description: { type: String, trim: true, default: '' },
  is_latest:          { type: Boolean, default: false },
}, { _id: true });
const itemSchema = new mongoose.Schema({
  item_id: {
    type: String, required: [true, 'Item ID is required'],
    unique: true, trim: true, uppercase: true,
  },
  part_no: {
    type: String, required: [true, 'Part number is required'],
    unique: true, trim: true, uppercase: true,
  },
  part_name: {
    type: String, required: [true, 'Part name is required'], 
    trim: true,
    index: true,
  },
  part_description: {
    type: String, required: [true, 'Part description is required'], trim: true,
  },
  // ── Drawing & Revision Control ────────────────────────────────────────────
  drawing_no:       { type: String, default: '', trim: true },
  revision_no:      { type: String, default: '0', trim: true },
  drawing_file_path:{ type: String, default: '', trim: true }, // path to current approved drawing PDF
  // Append-only history — never delete entries
  drawing_history: { type: [drawingRevisionSchema], default: [] },

  // ── Classification ────────────────────────────────────────────────────────
  item_category: {
    type: String,
    required: [true, 'Item category is required'],
    enum: ['Raw Material', 'Semi-Finished', 'Finished Good', 'Consumable', 'Tool', 'Bought-Out', 'Subcontract'],
  },
  item_type: {
    type: String,
    enum: ['Busbar', 'Stamping', 'Gasket', 'Tooling', 'Copper Strip', 'Aluminium Profile', 'Rubber Sheet', 'Cork', 'Other'],
    default: 'Other',
  },
  // ── Raw Material Specification ────────────────────────────────────────────
  rm_grade:  { type: String, trim: true, default: '' },
  density:   { type: Number, min: 0 },                    // g/cm³ — no longer required at model level; controller validates per item_category
  rm_source: { type: String, default: '', trim: true },   // e.g. Hindalco, Sterlite
  rm_type: {
    type: String,
    enum: ['Strip', 'Profile', 'Sheet', 'Wire', 'Tube', 'Compound', 'Bar', 'Rod', 'Coil', ''],
    default: '',
  },
  rm_spec:  { type: String, default: '', trim: true },
  material: { type: String, default: '', trim: true },    // human-readable e.g. "Copper"

  // ── Dimensions ───────────────────────────────────────────────────────────
  item_no:      { type: String, default: '', trim: true },
  thickness:    { type: Number, min: 0, default: 0 },     // mm — thin cross-section
  width:        { type: Number, min: 0, default: 0 },     // mm — wide cross-section
  strip_size:   { type: Number, min: 0, default: 0 },     // mm strip fed into die
  pitch:        { type: Number, min: 0, default: 0 },     // mm between progressive die positions
  no_of_cavity: { type: Number, min: 1, default: 1 },     // parts per press stroke

  // Auto-computed from thickness × width × density — set in pre-save
  gross_weight_kg: { type: Number, min: 0, default: 0 },
  net_weight_kg:   { type: Number, min: 0, default: 0 },  // set manually or from DXF

  // ── Rejection & Scrap ─────────────────────────────────────────────────────
  rm_rejection_percent:      { type: Number, default: 2.0,  min: 0, max: 100 },
  scrap_realisation_percent: { type: Number, default: 85,   min: 0, max: 100 }, // was 98 — spec says 85%

  // ── Units & Tax ───────────────────────────────────────────────────────────
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    enum: ['Nos', 'Kg', 'Meter', 'Set', 'Piece', 'Sheet', 'Roll'], // added Sheet, Roll
    default: 'Nos',
  },
  hsn_code: {
    type: String, required: [true, 'HSN code is required'], trim: true,
  },
  gst_percentage: {
    type: Number,
    enum: [0, 5, 12, 18, 28],
    default: 18,
    // Auto-populated from Tax Master when hsn_code is entered — see itemController.createItem
  },

  // ── Inventory Control ─────────────────────────────────────────────────────
  reorder_level:  { type: Number, default: 0, min: 0 },
  reorder_qty:    { type: Number, default: 0, min: 0 },   // EOQ / standard PO qty
  safety_stock:   { type: Number, default: 0, min: 0 },   // buffer stock
  min_stock:      { type: Number, default: 0, min: 0 },
  max_stock:      { type: Number, default: 0, min: 0 },
  lead_time_days: { type: Number, default: 0, min: 0 },
  shelf_life_days:{ type: Number, default: 0, min: 0 },   // 0 = no expiry; for rubber/adhesives

  // ── Procurement Source ────────────────────────────────────────────────────
  procurement_type: {
    type: String,
    enum: ['Manufacture', 'Purchase', 'Subcontract', 'Free Issue'],
    default: 'Manufacture',
  },

  // ── WO Lock Flag ──────────────────────────────────────────────────────────
  // Set to true by Work Order service on first WO creation for this item.
  // Once true, part_no cannot be changed via PUT /api/items/:id.
  part_no_locked: { type: Boolean, default: false },

  // ── Audit ─────────────────────────────────────────────────────────────────
  is_active:  { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });


// ── Pre-save hooks ────────────────────────────────────────────────────────────

// 1. Auto-set item_no from part_no if not supplied
// 2. Auto-infer material label from rm_grade
// 3. Auto-compute gross_weight_kg from dimensions + density
itemSchema.pre('save', function (next) {
  if (!this.item_no && this.part_no) {
    this.item_no = this.part_no;
  }

  if (!this.material && this.rm_grade) {
    const g = this.rm_grade.toUpperCase();
    if      (g.startsWith('C') || g.includes('C110'))  this.material = 'Copper';
    else if (g.includes('AL') || g.includes('AA'))     this.material = 'Aluminium';
    else if (g.includes('SS'))                         this.material = 'Stainless Steel';
    else if (g.includes('IS2062') || g.includes('MS')) this.material = 'Mild Steel';
    else if (g.includes('EPDM') || g.includes('SBR'))  this.material = 'Rubber';
    else                                               this.material = this.rm_grade;
  }

  // gross_weight_kg: (thickness mm × width mm × 1000 mm length × density g/cm³) / 1,000,000 → kg per metre
  if (this.thickness && this.width && this.density) {
    this.gross_weight_kg = parseFloat(
      ((this.thickness * this.width * 1000 * this.density) / 1_000_000).toFixed(6)
    );
  }

  next();
});

// Guard: drawing_history is append-only — reject any attempt to shrink it
itemSchema.pre('save', function (next) {
  if (this.isModified('drawing_history') && this._original_drawing_history_length !== undefined) {
    if (this.drawing_history.length < this._original_drawing_history_length) {
      return next(new Error('drawing_history is append-only and cannot be reduced'));
    }
  }
  next();
});


// ── Indexes ───────────────────────────────────────────────────────────────────
// Spec: text index on part_no + part_description + part_name for search
itemSchema.index({ part_no: 'text', part_name: 'text', part_description: 'text' });

// Spec: compound index on item_category + is_active
itemSchema.index({ item_category: 1, is_active: 1 });

// Spec: unique index on part_no (already unique: true above, but explicit compound for filter queries)
itemSchema.index({ part_no: 1 }, { unique: true });

// Supporting indexes
itemSchema.index({ item_id: 1 }, { unique: true });
itemSchema.index({ hsn_code: 1 });
itemSchema.index({ procurement_type: 1 });
itemSchema.index({ rm_grade: 1 });
itemSchema.index({ item_type: 1, is_active: 1 });
itemSchema.index({ reorder_level: 1, is_active: 1 }); // for reorder-alerts query


module.exports = mongoose.model('Item', itemSchema);