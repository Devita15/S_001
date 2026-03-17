// utils/quotationCalculators.js
//
// One calculator per formula_engine.
// Each calculator receives { item, itemDetails, rawMaterial, template }
// and returns a fully-populated quotation item object ready to store.
//
// HOW TO ADD A NEW TEMPLATE:
//   1. Write a new calcXxx(params) function below.
//   2. Add it to the CALCULATORS map at the bottom.
//   3. Add the matching formula_engine value in models/Template.js enum.
//   4. Add a generateXxxExcel() in utils/excelGenerators.js.
//

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const r6 = (n) => Math.round((parseFloat(n) || 0) * 1e6) / 1e6;

// ─────────────────────────────────────────────────────────────────
// TEMPLATE 1 — BUSBAR
//
// Formulas (match actual Excel):
//   gross_weight_kg   = T × W × L × density / 1,000,000
//   total_rm_rate     = rm_rate + profile_conversion_rate
//   gross_rm_cost     = gross_weight_kg × total_rm_rate
//   net_weight_kg     = user supplied (or = gross_weight_kg if not given)
//   scrap_kgs         = gross_weight_kg − net_weight_kg
//   scrap_cost        = scrap_kgs × scrap_rate_per_kg
//   process_cost      = Σ calculated_cost per process
//   sub_cost          = gross_rm_cost − scrap_cost + process_cost
//   margin_amount     = sub_cost × (MarginPercent / 100)
//   final_rate        = sub_cost + margin_amount
//   amount            = Quantity × final_rate
// ─────────────────────────────────────────────────────────────────
function calcBusbar ({ item, itemDetails, rawMaterial, template, processResults }) {
  const T  = parseFloat(item.Thickness) || 0;
  const W  = parseFloat(item.Width)     || 0;
  const L  = parseFloat(item.Length)    || 0;
  const S  = parseFloat(itemDetails.density) || 8.93;
  const qty = parseFloat(item.Quantity) || 0;

  const rm_rate                 = r2(rawMaterial.RatePerKG || 0);
  const profile_conversion_rate = r2(rawMaterial.profile_conversion_rate || 0);
  const transport_rate          = r2(rawMaterial.transport_rate_per_kg || 0);
  const scrap_rate              = r2(rawMaterial.scrap_rate_per_kg || 0);

  const gross_weight_kg = r6(T * W * L * S / 1e6);
  const net_weight_kg   = r6(parseFloat(item.net_weight_kg) || gross_weight_kg);
  const total_rm_rate   = r2(rm_rate + profile_conversion_rate);       // RM Rate + Profile Conv
  const gross_rm_cost   = r2(gross_weight_kg * total_rm_rate);
  const scrap_kgs       = r6(Math.max(0, gross_weight_kg - net_weight_kg));
  const scrap_cost      = r2(scrap_kgs * scrap_rate);

  const process_cost    = r2(processResults.reduce((s, p) => s + (p.calculated_cost || 0), 0));

  const sub_cost        = r2(gross_rm_cost - scrap_cost + process_cost);
  const margin_pct      = parseFloat(item.MarginPercent) || (template.default_margin_percent || 0);
  const margin_amount   = r2(sub_cost * margin_pct / 100);
  const final_rate      = r2(sub_cost + margin_amount);
  const amount          = r2(qty * final_rate);

  return {
    // identity
    PartNo: item.PartNo, PartName: itemDetails.part_description,
    Description: itemDetails.description || '', HSNCode: itemDetails.hsn_code,
    Unit: itemDetails.unit, Quantity: qty,
    // item master
    item_no: itemDetails.item_no || item.PartNo,
    drawing_no: itemDetails.drawing_no || '',
    revision_no: itemDetails.revision_no || '0',
    rm_grade: itemDetails.rm_grade || '',
    material: itemDetails.material || rawMaterial.MaterialName || '',
    rm_source: itemDetails.rm_source || '',
    rm_type: itemDetails.rm_type || '',
    rm_spec: itemDetails.rm_spec || itemDetails.rm_grade || '',
    density: S,
    // dimensions
    Thickness: T, Width: W, Length: L,
    // busbar calc
    gross_weight_kg, net_weight_kg,
    rm_rate, profile_conversion_rate, transport_rate,
    total_rm_rate,
    gross_rm_cost,
    scrap_kgs, scrap_rate_per_kg: scrap_rate, scrap_cost,
    // common
    Weight: gross_weight_kg,
    RMCost: gross_rm_cost,
    ProcessCost: process_cost,
    OverheadPercent: 0, OverheadAmount: 0,
    MarginPercent: margin_pct, MarginAmount: margin_amount,
    SubCost: sub_cost, FinalRate: final_rate, Amount: amount,
    gst_percent: item.GSTPercentage || 0,
    gst_amount: r2(amount * (item.GSTPercentage || 0) / 100),
    processes: processResults
  };
}

// ─────────────────────────────────────────────────────────────────
// TEMPLATE 2 — LANDED COST
//
// Formulas (match actual Excel CB71942):
//   gross_wt           = strip_size × thickness × density / 1e6   [pitch-based]
//   OR = T × W × L × density / 1e6                                [standard]
//
//   gross_wt_incl_rej  = gross_wt × (1 + rm_rejection_percent)
//   net_wt             = user supplied
//   scrap_wt           = gross_wt_incl_rej − net_wt
//   actual_scrap_wt    = scrap_wt × scrap_realisation_percent
//
//   gst_on_rm_amount   = basic_rm_rate × gst_percent_on_rm
//   gross_rm_rate      = basic_rm_rate + transport_rate + gst_on_rm_amount (if applicable)
//   gst_setoff_amount  = − gst_on_rm_amount (if gst_setoff_applicable)
//   net_rm_rate        = gross_rm_rate + gst_setoff_amount
//
//   effective_scrap_rate = scrap_rate_per_kg × effective_scrap_rate_factor
//   gross_rm_cost        = gross_wt_incl_rej × net_rm_rate
//   scrap_recovery       = actual_scrap_wt × effective_scrap_rate
//   net_rm_cost_per_pc   = gross_rm_cost − scrap_recovery
//
//   icc_net_days     = credit_on_input + wip_fg + credit_given_to_customer
//   icc_percent      = icc_net_days / 365
//   icc_amount       = net_rm_cost_per_pc × icc_percent × cost_of_capital
//   ohp_amount_matl  = net_rm_cost_per_pc × ohp_percent_on_matl × icc_percent  [OHP on matl]
//   net_matl_cost    = net_rm_cost_per_pc + icc_amount + ohp_amount_matl
//
//   total_mfg_cost         = Σ (process calculated_costs)
//   rejection_on_labour    = total_mfg_cost × rejection_on_labour_pct
//   ohp_on_labour          = total_mfg_cost × ohp_on_labour_pct
//   mfg_sub_total          = total_mfg_cost + rejection + ohp + inspection + tool + packing
//   plating_cost           = net_wt × plating_rate_per_kg
//   total_rate_per_ea      = net_matl_cost + mfg_sub_total + plating_cost
//   amount                 = qty × total_rate_per_ea
// ─────────────────────────────────────────────────────────────────
function calcLandedCost ({ item, itemDetails, rawMaterial, template, processResults }) {
  const qty   = parseFloat(item.Quantity) || 0;
  const T     = parseFloat(item.Thickness) || parseFloat(itemDetails.strip_size) || 0;
  const W     = parseFloat(item.Width) || 0;
  const L     = parseFloat(item.Length) || parseFloat(itemDetails.pitch) || 0;
  const S     = parseFloat(itemDetails.density) || 8.93;
  const rmRej = (parseFloat(itemDetails.rm_rejection_percent) || 2) / 100;
  const scrapReal = (parseFloat(itemDetails.scrap_realisation_percent) || 98) / 100;

  // RM rates from master
  const basic_rm_rate    = r2(rawMaterial.RatePerKG || 0);
  const transport_rate   = r2(rawMaterial.transport_rate_per_kg || 0);
  const gst_pct_on_rm    = parseFloat(rawMaterial.gst_percent_on_rm) || 0;    // e.g. 0.18
  const gst_setoff_flag  = rawMaterial.gst_setoff_applicable !== false;
  const scrap_rate_per_kg= r2(rawMaterial.scrap_rate_per_kg || 0);
  const eff_scrap_factor = parseFloat(rawMaterial.effective_scrap_rate_factor) || 0.85;

  // Weights
  let gross_wt;
  if (itemDetails.strip_size && itemDetails.pitch && itemDetails.no_of_cavity) {
    // pitch-based: (strip_size × thickness × pitch × no_of_cavity × density) / 1e6
    gross_wt = r6(
      itemDetails.strip_size * T * L * (itemDetails.no_of_cavity || 1) * S / 1e9
    );
  } else {
    gross_wt = r6(T * W * L * S / 1e6);
  }
  const gross_wt_incl_rej = r6(gross_wt * (1 + rmRej));
  const net_wt            = r6(parseFloat(item.net_weight_kg) || gross_wt);
  const scrap_wt          = r6(Math.max(0, gross_wt_incl_rej - net_wt));
  const actual_scrap_wt   = r6(scrap_wt * scrapReal);

  // RM rates calc
  const gst_on_rm_amount  = r2(basic_rm_rate * gst_pct_on_rm);
  // Gross RM Rate = basic + transport + GST (LBT omitted if zero)
  const gross_rm_rate     = r2(basic_rm_rate + transport_rate + gst_on_rm_amount);
  const gst_setoff_amount = gst_setoff_flag ? -gst_on_rm_amount : 0;
  const net_rm_rate       = r2(gross_rm_rate + gst_setoff_amount);

  // RM cost calcs
  const effective_scrap_rate = r2(scrap_rate_per_kg * eff_scrap_factor);
  const gross_rm_cost        = r2(gross_wt_incl_rej * net_rm_rate);
  const scrap_recovery       = r2(actual_scrap_wt * effective_scrap_rate);
  const net_rm_cost_per_pc   = r2(gross_rm_cost - scrap_recovery);

  // ICC
  const icc_credit_days  = parseInt(template.icc_credit_on_input_days) || -30;
  const icc_wip_days     = parseInt(template.icc_wip_fg_days) || 30;
  const icc_given_days   = parseInt(template.icc_credit_given_days) || 45;
  const icc_net_days     = icc_credit_days + icc_wip_days + icc_given_days;
  const cost_of_capital  = parseFloat(template.icc_cost_of_capital) || 0.10;
  const icc_percent      = r6(icc_net_days / 365);
  const icc_amount       = r6(net_rm_cost_per_pc * icc_percent * cost_of_capital);

  // OHP on material
  const ohp_pct_matl     = parseFloat(item.ohp_percent_on_matl) || parseFloat(template.ohp_percent_on_matl) || 0.10;
  const ohp_amount_matl  = r6(net_rm_cost_per_pc * icc_percent * ohp_pct_matl);
  const net_matl_cost    = r2(net_rm_cost_per_pc + icc_amount + ohp_amount_matl);

  // Manufacturing / tolling processes
  const total_mfg_cost   = r2(processResults.reduce((s, p) => s + (p.calculated_cost || 0), 0));
  const rej_pct          = parseFloat(template.rejection_on_labour_pct) || 0.02;
  const ohp_labour_pct   = parseFloat(template.ohp_on_labour_pct) || 0.15;
  const rejection_on_labour = r2(total_mfg_cost * rej_pct);
  const ohp_on_labour       = r2(total_mfg_cost * ohp_labour_pct);

  // Fixed cost lines (passed in item or use defaults from template overhead_flags)
  const inspection_cost     = r2(parseFloat(item.inspection_cost) || 0);
  const tool_maintenance_cost= r2(parseFloat(item.tool_maintenance_cost) || 0);
  const packing_rate_per_pc = r2(parseFloat(item.packing_rate_per_pc) || 0);
  const packing_cost        = r2(packing_rate_per_pc);

  const mfg_sub_total = r2(
    total_mfg_cost + rejection_on_labour + ohp_on_labour +
    inspection_cost + tool_maintenance_cost + packing_cost
  );

  // Plating: rate_per_kg × net_wt
  const plating_rate_per_kg = r2(parseFloat(item.plating_rate_per_kg) || 0);
  const plating_cost        = r2(plating_rate_per_kg * net_wt);

  const total_rate_per_ea = r2(net_matl_cost + mfg_sub_total + plating_cost);
  const amount            = r2(qty * total_rate_per_ea);

  return {
    // identity
    PartNo: item.PartNo, PartName: itemDetails.part_description,
    Description: itemDetails.description || '', HSNCode: itemDetails.hsn_code,
    Unit: itemDetails.unit, Quantity: qty,
    // item master
    item_no: itemDetails.item_no || item.PartNo,
    drawing_no: itemDetails.drawing_no || '',
    revision_no: itemDetails.revision_no || '0',
    rm_grade: itemDetails.rm_grade || '',
    material: itemDetails.material || rawMaterial.MaterialName || '',
    rm_source: itemDetails.rm_source || '',
    rm_type: itemDetails.rm_type || '',
    rm_spec: itemDetails.rm_spec || itemDetails.rm_grade || '',
    strip_size: itemDetails.strip_size || 0,
    pitch: itemDetails.pitch || 0,
    no_of_cavity: itemDetails.no_of_cavity || 1,
    density: S,
    rm_rejection_percent: rmRej * 100,
    scrap_realisation_percent: scrapReal * 100,
    // dimensions
    Thickness: T, Width: W, Length: L,
    // landed cost calc
    landed_cost_rate: r2(rawMaterial.landed_cost || 0),
    basic_rm_rate, transport_rate,
    gst_on_rm_amount, gst_setoff_amount,
    gross_rm_rate, net_rm_rate,
    gross_weight_kg: gross_wt,
    gross_weight_incl_rej: gross_wt_incl_rej,
    net_weight_kg: net_wt,
    scrap_wt, actual_scrap_wt,
    scrap_rate_per_kg, effective_scrap_rate,
    gross_rm_cost, scrap_recovery, net_rm_cost_per_pc,
    icc_net_days, icc_cost_of_capital: cost_of_capital,
    icc_percent, icc_amount,
    ohp_percent_on_matl: ohp_pct_matl, ohp_amount_on_matl: ohp_amount_matl,
    net_matl_cost,
    rejection_on_labour_pct: rej_pct, rejection_on_labour_amt: rejection_on_labour,
    ohp_on_labour_pct: ohp_labour_pct, ohp_on_labour_amt: ohp_on_labour,
    inspection_cost, tool_maintenance_cost,
    packing_rate_per_pc, packing_cost,
    plating_rate_per_kg, plating_cost,
    mfg_sub_total, total_rate_per_ea,
    // common
    Weight: gross_wt,
    RMCost: net_rm_cost_per_pc,
    ProcessCost: total_mfg_cost,
    OverheadPercent: 0, OverheadAmount: 0,
    MarginPercent: 0, MarginAmount: 0,
    SubCost: r2(net_matl_cost + mfg_sub_total),
    FinalRate: total_rate_per_ea, Amount: amount,
    gst_percent: item.GSTPercentage || 0,
    gst_amount: r2(amount * (item.GSTPercentage || 0) / 100),
    processes: processResults
  };
}

// ─────────────────────────────────────────────────────────────────
// TEMPLATE 3 — COST BREAKUP (simple)
//
// Formulas (match actual Excel Steering brackets):
//   rm_cost_direct   = supplied per item (RM cost flat)
//   operations_total = Σ (all operation amounts)
//   total_before_oh  = rm_cost_direct + operations_total
//   overhead_profit  = total_before_oh × overhead_profit_pct
//   final_rate       = total_before_oh + overhead_profit
//   amount           = qty × final_rate
// ─────────────────────────────────────────────────────────────────
function calcCostBreakup ({ item, itemDetails, rawMaterial, template, processResults }) {
  const qty   = parseFloat(item.Quantity) || 0;

  // RM cost is flat — from item.rm_cost_direct or from item-master/raw-material lookup
  const rm_cost_direct = r2(
    parseFloat(item.rm_cost_direct) ||
    parseFloat(item.RMCost) ||
    0
  );

  // Operations (laser cutting, proto tolling, etc.)
  const operations_total = r2(processResults.reduce((s, p) => s + (p.calculated_cost || 0), 0));

  const total_before_oh = r2(rm_cost_direct + operations_total);

  const oh_pct = parseFloat(item.overhead_profit_pct) ||
                 parseFloat(template.default_margin_percent) || 0;
  const overhead_profit_amt = r2(total_before_oh * oh_pct / 100);

  const final_rate = r2(total_before_oh + overhead_profit_amt);
  const amount     = r2(qty * final_rate);

  return {
    // identity
    PartNo: item.PartNo, PartName: itemDetails.part_description,
    Description: itemDetails.description || '', HSNCode: itemDetails.hsn_code,
    Unit: itemDetails.unit, Quantity: qty,
    item_no: itemDetails.item_no || item.PartNo,
    drawing_no: itemDetails.drawing_no || '',
    revision_no: itemDetails.revision_no || '0',
    rm_grade: itemDetails.rm_grade || '',
    material: itemDetails.material || '',
    // cost breakup specific
    rm_cost_direct,
    operations_total,
    overhead_profit_pct: oh_pct,
    overhead_profit_amt,
    // common
    Weight: 0, RMCost: rm_cost_direct, ProcessCost: operations_total,
    OverheadPercent: oh_pct, OverheadAmount: overhead_profit_amt,
    MarginPercent: 0, MarginAmount: 0,
    SubCost: total_before_oh,
    FinalRate: final_rate, Amount: amount,
    gst_percent: item.GSTPercentage || 0,
    gst_amount: r2(amount * (item.GSTPercentage || 0) / 100),
    processes: processResults
  };
}

// ─────────────────────────────────────────────────────────────────
// ENGINE MAP — add new engines here as objects grow
// ─────────────────────────────────────────────────────────────────
const CALCULATORS = {
  busbar:       calcBusbar,
  landed_cost:  calcLandedCost,
  cost_breakup: calcCostBreakup,
  custom:       calcBusbar   // fallback to busbar until custom is defined
};

/**
 * Main entry point used by the controller.
 * @param {string} engine  - template.formula_engine
 * @param {object} params  - { item, itemDetails, rawMaterial, template, processResults }
 */
function calculateItem (engine, params) {
  const fn = CALCULATORS[engine];
  if (!fn) throw new Error(`Unknown formula_engine: "${engine}". Add it to CALCULATORS in quotationCalculators.js`);
  return fn(params);
}

module.exports = { calculateItem, CALCULATORS };