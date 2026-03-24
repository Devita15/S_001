'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// seedTemplates.js  — with full debug logging
// Usage: node scripts/seedTemplates.js
// ─────────────────────────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const Template = require('../models/CRM/Template');

const SEEDS = [
  {
    template_code:          'BUSBAR',
    template_name:          'Copper / Aluminium Busbar (Horizontal Table)',
    formula_engine:         'busbar',
    excel_layout:           'horizontal_table',
    default_margin_percent: 15,
    margin_label:           'Margin + OH',
    description:            'For copper and aluminium busbars. Horizontal row-per-item table with dynamic process columns.',
    overhead_flags: {
      use_profile_conversion:   true,
      use_effective_scrap_rate: true,
    },
    process_section: { enabled: true, sort_order: 19 },
    is_active:  true,
    is_default: true,
  },
  {
    template_code:          'LANDED_COST',
    template_name:          'Stamping / CT Parts — Landed Cost with ICC',
    formula_engine:         'landed_cost',
    excel_layout:           'vertical_per_item',
    default_margin_percent: 15,
    margin_label:           'OHP on Material',
    description:            'For stampings and CT parts. Vertical per-item layout with full ICC financing overlay, GST set-off, plating, packing, inspection.',
    overhead_flags: {
      use_icc:               true,
      use_ohp_on_material:   true,
      use_ohp_on_labour:     true,
      use_packing:           true,
      use_inspection:        true,
      use_tool_maintenance:  true,
      use_plating:           true,
      use_gst_on_rm:         true,
      use_gst_setoff:        true,
      use_transport:         true,
    },
    icc_credit_on_input_days:  -30,
    icc_wip_fg_days:            30,
    icc_credit_given_days:      45,
    icc_cost_of_capital:        0.10,
    ohp_percent_on_matl:        0.10,
    rejection_on_labour_pct:    0.02,
    ohp_on_labour_pct:          0.15,
    is_active: true,
  },
  {
    template_code:          'COST_BREAKUP',
    template_name:          'Cost Break Up Sheet (Proto / Stampings)',
    formula_engine:         'cost_breakup',
    excel_layout:           'vertical_per_item',
    default_margin_percent: 10,
    margin_label:           'Overheads & Profit',
    description:            'Simple cost break up sheet. RM Cost + Processing Operations + Overhead % = Cost per piece. Used for proto parts and stampings.',
    overhead_flags: {
      use_overhead_percent: true,
    },
    is_active: true,
  },
  {
    template_code:          'PART_WISE',
    template_name:          'Part-Wise Customer Quotation (Sheet / Gasket)',
    formula_engine:         'part_wise',
    excel_layout:           'horizontal_table',
    default_margin_percent: 20,
    margin_label:           'Margin',
    description:            'Customer-facing quotation table. RM cost + Conversion cost + Margin + Packing & Forwarding = Final Rate per piece.',
    overhead_flags: {
      use_overhead_percent: false,
    },
    is_active: true,
  },
  {
    template_code:          'NOMEX_SHEET',
    template_name:          'Nomex / Sheet Cut Parts Quotation',
    formula_engine:         'nomex_sheet',
    excel_layout:           'horizontal_table',
    default_margin_percent: 15,
    margin_label:           'Profit %',
    description:            'For Nomex, polycarbonate, and other sheet-cut insulation parts. Weight-based RM + wastage + fabrication + profit + P&F.',
    overhead_flags: {
      use_overhead_percent: true,
    },
    is_active: true,
  },
  {
    template_code:          'REVISED_CONV',
    template_name:          'Revised Conversion — Assembly Busbar Sets',
    formula_engine:         'revised_conversion',
    excel_layout:           'horizontal_table',
    default_margin_percent: 15,
    margin_label:           'Margin',
    description:            'Assembly-level quotation. Each item is a busbar SET with sub-parts. Supports Cu Flat, Cu Sheet, Al Flat, Al Sheet rates with plating.',
    overhead_flags: {
      use_plating:          true,
      use_ohp_on_material:  true,
    },
    is_active: true,
  },
  {
    template_code:          'LASER_FAB',
    template_name:          'Laser + Fabrication Full Sheet Metal',
    formula_engine:         'laser_fabrication',
    excel_layout:           'vertical_per_item',
    default_margin_percent: 15,
    margin_label:           'Overhead & Profit',
    description:            'Full sheet metal cost sheet with laser cutting, special operations (drilling, tapping, CSK), bending, fabrication, powder coating, and all overhead lines.',
    overhead_flags: {
      use_overhead_percent:  true,
      use_inspection:        true,
      use_packing:           true,
      use_transport:         true,
    },
    is_active: true,
  },
];

// ─── colour helpers (no deps) ─────────────────────────────────────────────────
const G = (s) => `\x1b[32m${s}\x1b[0m`;   // green
const Y = (s) => `\x1b[33m${s}\x1b[0m`;   // yellow
const R = (s) => `\x1b[31m${s}\x1b[0m`;   // red
const C = (s) => `\x1b[36m${s}\x1b[0m`;   // cyan
const B = (s) => `\x1b[1m${s}\x1b[0m`;    // bold
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;  // dim

async function seed() {
  // ── 1. Connection ────────────────────────────────────────────────────────
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/employee_management';
  console.log(`\n${B('━━━ SEED: Templates ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}`);
  console.log(`${C('▶ Connecting to:')} ${DIM(uri)}`);

  await mongoose.connect(uri);

  // ── 2. Show which DB + collection we're actually writing to ──────────────
  const dbName         = mongoose.connection.db.databaseName;
  const collectionName = Template.collection.collectionName;
  console.log(`${G('✔ Connected')}  DB: ${B(dbName)}  |  Collection: ${B(collectionName)}\n`);

  // ── 3. Count existing docs before we start ───────────────────────────────
  const beforeCount = await Template.countDocuments();
  console.log(`${C('ℹ Before seed:')} ${beforeCount} template(s) in collection\n`);

  // ── 4. Upsert each template ───────────────────────────────────────────────
  const results = { created: [], updated: [], failed: [] };

  for (const s of SEEDS) {
    process.stdout.write(`  ${DIM(s.template_code.padEnd(16))} `);
    try {
      const existing = await Template.findOne({ template_code: s.template_code });

      let doc;
      if (existing) {
        // Use save() instead of findByIdAndUpdate so Mongoose validators run
        // and the returned doc is the full updated object
        Object.assign(existing, s);
        doc = await existing.save();
        console.log(`${Y('↺ Updated')}  _id: ${DIM(doc._id.toString())}`);
        results.updated.push(s.template_code);
      } else {
        doc = await Template.create(s);
        console.log(`${G('✚ Created')}  _id: ${DIM(doc._id.toString())}`);
        results.created.push(s.template_code);
      }

      // ── 5. Immediately re-fetch and print key fields to confirm ───────────
      const verify = await Template.findById(doc._id)
        .select('template_code template_name formula_engine excel_layout is_active');
      if (!verify) {
        console.log(`     ${R('⚠ WARNING: doc not found on re-fetch!')}`);
      } else {
        console.log(
          `     ${DIM('└─')} engine: ${C(verify.formula_engine.padEnd(20))}` +
          ` layout: ${C(verify.excel_layout.padEnd(18))}` +
          ` active: ${verify.is_active ? G('true') : R('false')}`
        );
      }
    } catch (e) {
      console.log(`${R('✖ FAILED')}`);
      console.error(`     ${R('Error:')} ${e.message}`);
      if (e.errors) {
        for (const [field, ve] of Object.entries(e.errors)) {
          console.error(`     ${R('  FieldError')} [${field}]: ${ve.message}`);
        }
      }
      results.failed.push({ code: s.template_code, error: e.message });
    }
  }

  // ── 6. Post-seed summary ─────────────────────────────────────────────────
  const afterCount = await Template.countDocuments();
  console.log(`\n${B('━━━ SUMMARY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}`);
  console.log(`  DB / Collection : ${B(dbName)} / ${B(collectionName)}`);
  console.log(`  Docs before     : ${beforeCount}`);
  console.log(`  Docs after      : ${afterCount}`);
  console.log(`  Created         : ${G(results.created.length)}  ${DIM(results.created.join(', '))}`);
  console.log(`  Updated         : ${Y(results.updated.length)}  ${DIM(results.updated.join(', '))}`);
  console.log(`  Failed          : ${results.failed.length > 0 ? R(results.failed.length) : '0'}`);
  if (results.failed.length) {
    results.failed.forEach(f => console.log(`    ${R('✖')} ${f.code}: ${f.error}`));
  }

  // ── 7. Full listing of every template now in the collection ──────────────
  console.log(`\n${B('━━━ ALL TEMPLATES IN DB ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}`);
  const all = await Template.find({})
    .select('template_code template_name formula_engine excel_layout is_active is_default')
    .lean();

  if (all.length === 0) {
    console.log(R('  ⚠  Collection is EMPTY — check you are connected to the right DB!'));
    console.log(`  ${Y('Hint:')} Your MONGO_URI env var currently points to: ${DIM(uri)}`);
    console.log(`  ${Y('Hint:')} Run: ${C('mongosh "' + uri + '" --eval "db.templates.find().pretty()"')}`);
  } else {
    const pad = (s, n) => String(s ?? '').padEnd(n);
    console.log(DIM(`  ${'CODE'.padEnd(16)} ${'ENGINE'.padEnd(22)} ${'LAYOUT'.padEnd(20)} ACT  DEF  NAME`));
    console.log(DIM(`  ${'─'.repeat(90)}`));
    for (const t of all) {
      console.log(
        `  ${C(pad(t.template_code, 16))}` +
        ` ${G(pad(t.formula_engine, 22))}` +
        ` ${DIM(pad(t.excel_layout, 20))}` +
        ` ${t.is_active  ? G('✔') : R('✖')}    ` +
        ` ${t.is_default ? G('✔') : DIM('–')}    ` +
        ` ${t.template_name}`
      );
    }
  }

  console.log(`\n${G('✔ Seed complete.')}\n`);
  process.exit(0);
}

seed().catch(e => {
  console.error(R(`\n✖ Fatal seed error: ${e.message}`));
  console.error(e);
  process.exit(1);
});