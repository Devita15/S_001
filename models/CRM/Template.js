// models/Template.js
//
// formula_engine controls the entire calculation + Excel generation path:
//
//   'busbar'       → horizontal table, one row per item
//                    dynamic process columns between Scrap Cost and SUB TOTAL
//
//   'landed_cost'  → vertical per-item sheet (one sheet per part)
//                    ICC + OHP on material + mfg processes + plating
//
//   'cost_breakup' → vertical per-item, simple:
//                    RM cost + operations + overhead%  → cost per piece
//
//   'custom'       → uses columns[] array + process_section, fully configurable
//
// To add a NEW template in future:
//   1. Add new formula_engine enum value
//   2. Add a generator function in utils/excelGenerators.js
//   3. Add calc function in utils/quotationCalculators.js
//   4. Register in the engine maps in quotationController.js
//
const mongoose = require('mongoose');

const templateColumnSchema = new mongoose.Schema({
  sort_order:    { type: Number, required: true },
  field_key:     { type: String, required: true },
  display_name:  { type: String, required: true },
  data_type: {
    type: String,
    enum: ['text', 'number', 'currency', 'percentage'],
    required: true
  },
  col_width:      { type: Number, default: 80 },
  is_visible:     { type: Boolean, default: true },
  is_user_input:  { type: Boolean, default: false }
}, { _id: false });

const processSectionSchema = new mongoose.Schema({
  enabled:    { type: Boolean, default: true },
  sort_order: { type: Number, default: 20 }   // column index where process cols start
}, { _id: false });

// Fine-grained flags for which overhead/cost lines to include
const overheadFlagsSchema = new mongoose.Schema({
  // Template 1 (busbar)
  use_profile_conversion:     { type: Boolean, default: false },
  use_effective_scrap_rate:   { type: Boolean, default: false },

  // Template 2 (landed_cost)
  use_icc:                    { type: Boolean, default: false },
  use_ohp_on_material:        { type: Boolean, default: false },
  use_ohp_on_labour:          { type: Boolean, default: false },
  use_rejection_on_labour:    { type: Boolean, default: false },
  use_packing:                { type: Boolean, default: false },
  use_inspection:             { type: Boolean, default: false },
  use_tool_maintenance:       { type: Boolean, default: false },
  use_plating:                { type: Boolean, default: false },
  use_gst_on_rm:              { type: Boolean, default: false },
  use_gst_setoff:             { type: Boolean, default: false },
  use_transport:              { type: Boolean, default: false },
  use_lbt:                    { type: Boolean, default: false },

  // Template 3 (cost_breakup)
  use_overhead_percent:       { type: Boolean, default: false }
}, { _id: false });

const templateSchema = new mongoose.Schema({
  template_code: {
    type: String,
    required: [true, 'Template code is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  template_name: {
    type: String,
    required: [true, 'Template name is required']
  },

  // Controls calculation logic AND Excel generation
  formula_engine: {
    type: String,
    required: [true, 'Formula engine is required'],
    // Add new engines here as needed
    enum: ['busbar', 'landed_cost', 'cost_breakup', 'custom']
  },

  // Controls Excel layout
  excel_layout: {
    type: String,
    required: [true, 'Excel layout is required'],
    // Add new layouts here as needed
    enum: ['horizontal_table', 'vertical_per_item']
  },

  default_margin_percent: { type: Number, default: 15, min: 0, max: 100 },
  margin_label:           { type: String, default: 'Margin +OH' },
  overhead_flags:         { type: overheadFlagsSchema, default: () => ({}) },

  // Used by 'custom' engine and 'busbar' for fixed columns
  columns: [templateColumnSchema],

  // Whether to add dynamic process columns (busbar + custom)
  process_section: {
    type: processSectionSchema,
    default: () => ({ enabled: true, sort_order: 20 })
  },

  // ── landed_cost specific config ──────────────────────────────
  // ICC parameters (defaults, can be overridden per-item)
  icc_credit_on_input_days:   { type: Number, default: -30 },
  icc_wip_fg_days:            { type: Number, default: 30  },
  icc_credit_given_days:      { type: Number, default: 45  },
  icc_cost_of_capital:        { type: Number, default: 0.10 },
  ohp_percent_on_matl:        { type: Number, default: 0.10 },
  rejection_on_labour_pct:    { type: Number, default: 0.02 },
  ohp_on_labour_pct:          { type: Number, default: 0.15 },

  description: { type: String, default: '' },
  is_active:   { type: Boolean, default: true },
  is_default:  { type: Boolean, default: false },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

templateSchema.pre('save', function (next) {
  if (this.columns && this.columns.length) {
    this.columns.sort((a, b) => a.sort_order - b.sort_order);
  }
  next();
});

module.exports = mongoose.model('Template', templateSchema);