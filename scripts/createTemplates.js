// scripts/createTemplates.js
// Run: node scripts/createTemplates.js

require('dotenv').config();
const mongoose = require('mongoose');
const Template = require('../models/CRM/Template');

async function upsertTemplate(data) {
  return Template.findOneAndUpdate(
    { template_code: data.template_code },
    data,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // ==========================================================
  // 1️⃣ BUSBAR TEMPLATE (Horizontal + Dynamic Processes)
  // ==========================================================
  const busbar = await upsertTemplate({
    template_code: 'BUSBAR',
    template_id: 'TMP-BUSBAR',
    template_name: 'Copper Busbar Cost Sheet',
    formula_engine: 'busbar',
    excel_layout: 'horizontal_table',
    default_margin_percent: 15,
    margin_label: 'Margin +OH',

    overhead_flags: {
      use_profile_conversion: true,
      use_effective_scrap_rate: false
    },

    process_section: {
      enabled: true,
      sort_order: 20
    },

    columns: [
      { sort_order: 1, field_key: 'sr_no', display_name: 'SR.NO.', data_type: 'number' },
      { sort_order: 2, field_key: 'PartNo', display_name: 'Part No.', data_type: 'text' },
      { sort_order: 3, field_key: 'PartName', display_name: 'Part Description', data_type: 'text' },
      { sort_order: 4, field_key: 'drawing_no', display_name: 'Drawing No.', data_type: 'text' },
      { sort_order: 5, field_key: 'revision_no', display_name: 'Rev. No.', data_type: 'text' },
      { sort_order: 6, field_key: 'rm_grade', display_name: 'RM Grade', data_type: 'text' },
      { sort_order: 7, field_key: 'Thickness', display_name: 'T (MM)', data_type: 'number' },
      { sort_order: 8, field_key: 'Width', display_name: 'W (MM)', data_type: 'number' },
      { sort_order: 9, field_key: 'Length', display_name: 'L (MM)', data_type: 'number' },
      { sort_order: 10, field_key: 'density', display_name: 'Density', data_type: 'number' },
      { sort_order: 11, field_key: 'gross_weight_kg', display_name: 'Gross Wt / Pcs', data_type: 'number' },
      { sort_order: 12, field_key: 'rm_rate', display_name: 'RM Rate', data_type: 'currency' },
      { sort_order: 13, field_key: 'profile_conversion_rate', display_name: 'Profile Conv Rate', data_type: 'currency' },
      { sort_order: 14, field_key: 'total_rm_rate', display_name: 'Total RM Rate/Kg', data_type: 'currency' },
      { sort_order: 15, field_key: 'gross_rm_cost', display_name: 'Gross RM Cost', data_type: 'currency' },
      { sort_order: 16, field_key: 'net_weight_kg', display_name: 'Net Weight', data_type: 'number' },
      { sort_order: 17, field_key: 'scrap_kgs', display_name: 'Scrap Kg', data_type: 'number' },
      { sort_order: 18, field_key: 'scrap_rate_per_kg', display_name: 'Scrap Rate/Kg', data_type: 'currency' },
      { sort_order: 19, field_key: 'scrap_cost', display_name: 'Scrap Cost', data_type: 'currency' },

      // Dynamic process columns injected here

      { sort_order: 40, field_key: 'SubCost', display_name: 'SUB TOTAL', data_type: 'currency' },
      { sort_order: 41, field_key: 'MarginAmount', display_name: 'Margin +OH', data_type: 'currency' },
      { sort_order: 42, field_key: 'FinalRate', display_name: 'Final Part Cost', data_type: 'currency' },
      { sort_order: 43, field_key: 'Quantity', display_name: 'Qty Required', data_type: 'number', is_user_input: true }
    ],

    description: 'Horizontal busbar costing sheet with dynamic process columns',
    is_default: true,
    is_active: true
  });

  console.log('✅ BUSBAR ready:', busbar._id);

  // ==========================================================
  // 2️⃣ LANDED COST TEMPLATE (Vertical ICC Sheet)
  // ==========================================================
  const landed = await upsertTemplate({
    template_code: 'LANDED_COST',
    template_id: 'TMP-LANDED',
    template_name: 'Landed Cost Sheet',
    formula_engine: 'landed_cost',
    excel_layout: 'vertical_per_item',

    overhead_flags: {
      use_icc: true,
      use_ohp_on_material: true,
      use_ohp_on_labour: true,
      use_rejection_on_labour: true,
      use_packing: true,
      use_inspection: true,
      use_tool_maintenance: true,
      use_plating: true,
      use_gst_on_rm: true,
      use_gst_setoff: true,
      use_transport: true
    },

    icc_credit_on_input_days: -30,
    icc_wip_fg_days: 30,
    icc_credit_given_days: 45,
    icc_cost_of_capital: 0.10,
    ohp_percent_on_matl: 0.10,
    rejection_on_labour_pct: 0.02,
    ohp_on_labour_pct: 0.15,

    process_section: { enabled: true },

    columns: [],
    description: 'Vertical ICC landed cost sheet per part',
    is_active: true
  });

  console.log('✅ LANDED_COST ready:', landed._id);

  // ==========================================================
  // 3️⃣ COST BREAKUP TEMPLATE
  // ==========================================================
  const breakup = await upsertTemplate({
    template_code: 'COST_BREAKUP',
    template_id: 'TMP-BREAKUP',
    template_name: 'Cost Breakup Sheet',
    formula_engine: 'cost_breakup',
    excel_layout: 'vertical_per_item',

    default_margin_percent: 10,
    margin_label: 'OVERHEADS & PROFIT',

    overhead_flags: {
      use_overhead_percent: true
    },

    process_section: { enabled: true },

    columns: [],
    description: 'Simple RM + operations + OH % costing sheet',
    is_active: true
  });

  console.log('✅ COST_BREAKUP ready:', breakup._id);

  console.log('\n🎉 ALL TEMPLATES READY SUCCESSFULLY');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});