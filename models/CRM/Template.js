'use strict';
const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({

  template_code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    example: 'BUSBAR',
  },

  template_name: {
    type: String,
    required: true,
    trim: true,
  },

  // ── THIS IS THE FIELD THAT WAS CAUSING THE ERROR ──────────────────────────
  // The old enum was missing: part_wise, nomex_sheet, revised_conversion, laser_fabrication
  formula_engine: {
    type: String,
    required: true,
    enum: [
      'busbar',
      'landed_cost',
      'cost_breakup',
      'part_wise',           // ← was missing
      'nomex_sheet',         // ← was missing
      'revised_conversion',  // ← was missing
      'laser_fabrication',   // ← was missing
    ],
    default: 'busbar',
  },

  excel_layout: {
    type: String,
    enum: ['horizontal_table', 'vertical_per_item'],
    default: 'horizontal_table',
  },

  default_margin_percent: {
    type: Number,
    default: 15,
    min: 0,
    max: 100,
  },

  margin_label: {
    type: String,
    default: 'Margin',
  },

  description: {
    type: String,
    default: '',
  },

  // ── Overhead flags — controls which overhead rows appear in the UI ─────────
  overhead_flags: {
    use_profile_conversion:   { type: Boolean, default: false },
    use_effective_scrap_rate: { type: Boolean, default: false },
    use_icc:                  { type: Boolean, default: false },
    use_ohp_on_material:      { type: Boolean, default: false },
    use_ohp_on_labour:        { type: Boolean, default: false },
    use_packing:              { type: Boolean, default: false },
    use_inspection:           { type: Boolean, default: false },
    use_tool_maintenance:     { type: Boolean, default: false },
    use_plating:              { type: Boolean, default: false },
    use_gst_on_rm:            { type: Boolean, default: false },
    use_gst_setoff:           { type: Boolean, default: false },
    use_transport:            { type: Boolean, default: false },
    use_overhead_percent:     { type: Boolean, default: false },
  },

  // ── ICC defaults (only relevant for landed_cost engine) ───────────────────
  icc_credit_on_input_days: { type: Number, default: -30   },
  icc_wip_fg_days:          { type: Number, default:  30   },
  icc_credit_given_days:    { type: Number, default:  45   },
  icc_cost_of_capital:      { type: Number, default:  0.10 },
  ohp_percent_on_matl:      { type: Number, default:  0.10 },
  rejection_on_labour_pct:  { type: Number, default:  0.02 },
  ohp_on_labour_pct:        { type: Number, default:  0.15 },

  // ── revised_conversion rate overrides ─────────────────────────────────────
  cu_flat_rate:   { type: Number, default: 0 },
  cu_sheet_rate:  { type: Number, default: 0 },
  al_flat_rate:   { type: Number, default: 0 },
  al_sheet_rate:  { type: Number, default: 0 },

  // ── laser_fabrication overhead % overrides ────────────────────────────────
  inspection_pct:       { type: Number, default: 2  },
  rejection_pct:        { type: Number, default: 2  },
  design_jig_pct:       { type: Number, default: 2  },
  packaging_pct:        { type: Number, default: 2  },
  overhead_profit_pct:  { type: Number, default: 15 },
  transportation_pct:   { type: Number, default: 2  },

  // ── Process section config ─────────────────────────────────────────────────
  process_section: {
    enabled:    { type: Boolean, default: true },
    sort_order: { type: Number,  default: 1    },
  },

  is_active:  { type: Boolean, default: true  },
  is_default: { type: Boolean, default: false },

}, { timestamps: true });

module.exports = mongoose.model('Template', templateSchema);