'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// quotationCalculators.js
//
// Pure calculation functions for every costing template.
// No DB calls, no side effects — these take raw data and return costed items.
//
// Templates supported:
//   busbar        → Copper/Aluminium busbar (horizontal table, multi-process cols)
//   landed_cost   → Stamping/CT parts with full ICC financing overlay
//   cost_breakup  → Simple RM + process + overhead (Steering bracket / proto style)
//   part_wise     → Customer quotation with RM cost + conversion + margin + P&F
//   nomex_paper   → Sheet-cut parts: weight-based RM + fabrication + wastage
//   custom        → Generic template driven by template.columns[]
// ─────────────────────────────────────────────────────────────────────────────

// ─── helpers ─────────────────────────────────────────────────────────────────
const n = (v, d = 6) => Math.round((parseFloat(v) || 0) * 10 ** d) / 10 ** d;
const pct = (v) => (v > 1 ? v / 100 : v);   // normalise: 15 → 0.15, 0.15 stays

// ─────────────────────────────────────────────────────────────────────────────
// 1.  BUSBAR TEMPLATE  (Busbar_cost__09_01_2026.xlsx)
//
// Columns: SR | PartNo | Description | Drawing | Rev | RMGrade |
//          T | W | L | S | GrossWt | RMRate | ProfileConvRate | TotalRMRate |
//          GrossRMCost | NetWt | ScrapKgs | ScrapRate | ScrapCost |
//          [dynamic process cols...] |
//          SubTotal | Margin+OH% | FinalPartCost | Qty
//
// Formula chain:
//   GrossWt = T * W * L * density / 1e6
//   GrossRMCost = GrossWt * (RMRate + ProfileConvRate)
//   ScrapKgs = GrossWt - NetWt
//   ScrapCost = ScrapKgs * ScrapRate
//   SubTotal = GrossRMCost - ScrapCost + sum(ProcessCosts)
//   FinalRate = SubTotal * (1 + MarginOHpct)
// ─────────────────────────────────────────────────────────────────────────────
function calcBusbar(item, template) {
  const T          = n(item.Thickness);
  const W          = n(item.Width);
  const L          = n(item.Length);
  const density    = n(item.density || 8.93);
  const grossWt    = n((T * W * L * density) / 1_000_000);

  const rmRate     = n(item.rm_rate || 0);
  const profConv   = n(item.profile_conversion_rate || 0);
  const totalRMRate = n(rmRate + profConv);
  const grossRMCost = n(grossWt * totalRMRate);

  const netWt      = n(item.net_weight_kg || grossWt);
  const scrapKgs   = n(Math.max(0, grossWt - netWt));
  const scrapRate  = n(item.scrap_rate_per_kg || 0);
  const scrapCost  = n(scrapKgs * scrapRate);

  // Process costs  — each process in item.processes[] has {name, cost}
  const processCosts = (item.processes || []).map(p => ({
    name: p.process_name || p.name || 'Process',
    cost: n(p.calculated_cost || p.cost || 0),
  }));
  const totalProcessCost = n(processCosts.reduce((s, p) => s + p.cost, 0));

  const subTotal   = n(grossRMCost - scrapCost + totalProcessCost);
  const marginOH   = n(pct(item.MarginPercent || item.margin_percent || 0));
  const finalRate  = n(subTotal * (1 + marginOH));
  const qty        = n(item.Quantity || 1);
  const amount     = n(finalRate * qty);

  return {
    ...item,
    gross_weight_kg:          grossWt,
    total_rm_rate:            totalRMRate,
    gross_rm_cost:            grossRMCost,
    net_weight_kg:            netWt,
    scrap_kgs:                scrapKgs,
    scrap_cost:               scrapCost,
    ProcessCost:              totalProcessCost,
    process_breakdown:        processCosts,
    SubTotal:                 subTotal,
    MarginPercent:            marginOH * 100,
    FinalRate:                finalRate,
    Amount:                   amount,
    Quantity:                 qty,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.  LANDED COST TEMPLATE  (CB71942_43_45_-26_12_2025.xlsx)
//
// Vertical per-item layout. Includes ICC financing cost overlay.
//
// Formula chain:
//   GrossWt = T * strip_width * pitch * density / 1e6   (for strip)
//   GrossWtInclRej = GrossWt * (1 + rm_rejection_pct)
//   ScrapWt = GrossWtInclRej - NetWt
//   ScrapActual = ScrapWt * scrap_realisation_pct
//   GrossRMRate = basic_rm_rate * (1 + GST%) + transport + LBT
//   NetRMRate = GrossRMRate - GST_setoff
//   GrossRMCost = GrossWtInclRej * NetRMRate
//   ScrapCredit = ScrapActual * scrap_rate
//   NetRMCost = GrossRMCost - ScrapCredit
//   ICCCost = NetRMCost * icc_days_total/365 * cost_of_capital
//   OHPmatl = NetRMCost * ohp_pct_matl
//   ProcessCost = sum(process costs)
//   OHPlabour = ProcessCost * ohp_pct_labour
//   FinalLandedCost = NetRMCost + ICCCost + OHPmatl + ProcessCost + OHPlabour +
//                     rejectionCost + packingCost + inspectionCost + toolMaintenanceCost + platingCost
// ─────────────────────────────────────────────────────────────────────────────
function calcLandedCost(item, template) {
  const T          = n(item.Thickness || 0);
  const W          = n(item.Width || item.strip_width || 0);      // strip width mm
  const pitch      = n(item.pitch || item.Length || 0);           // pitch mm
  const cavity     = Math.max(1, parseInt(item.no_of_cavity || 1));
  const density    = n(item.density || 8.93);

  // Gross weight per piece from strip dimensions
  const grossWtPerPiece = n((T * W * pitch * density) / (1_000_000 * cavity));
  const rejPct          = n(pct(item.rm_rejection_percent || 2));
  const grossWtInclRej  = n(grossWtPerPiece * (1 + rejPct));

  const netWt           = n(item.net_weight_kg || grossWtPerPiece * 0.82);
  const scrapWt         = n(Math.max(0, grossWtInclRej - netWt));
  const scrapReal       = n(pct(item.scrap_realisation_percent || 98));
  const scrapActual     = n(scrapWt * scrapReal);

  // RM Rate chain
  const basicRM         = n(item.rm_rate || 0);
  const gstPct          = n(pct(item.rm_gst_pct || 18));
  const gstOnRM         = n(basicRM * gstPct);
  const profileConv     = n(item.profile_conversion_rate || 0);
  const transport       = n(item.transport_rate_per_kg || 0);
  const grossRMRate     = n(basicRM + gstOnRM + profileConv + transport);
  const gstSetoff       = n(item.use_gst_setoff !== false ? -gstOnRM : 0);
  const netRMRate       = n(grossRMRate + gstSetoff);  // gstSetoff is negative

  const grossRMCost     = n(grossWtInclRej * netRMRate);
  const scrapCredit     = n(scrapActual * n(item.scrap_rate_per_kg || 875));
  const netRMCost       = n(grossRMCost - scrapCredit);

  // ICC financing
  const iccDays  = n(item.icc_credit_on_input_days || template?.icc_credit_on_input_days || -30);
  const wipDays  = n(item.icc_wip_fg_days || template?.icc_wip_fg_days || 30);
  const crdDays  = n(item.icc_credit_given_days || template?.icc_credit_given_days || 45);
  const totalDays = n(Math.abs(iccDays) + wipDays + crdDays);
  const coc      = n(pct(item.icc_cost_of_capital || template?.icc_cost_of_capital || 0.10));
  const iccCost  = n(netRMCost * (totalDays / 365) * coc);

  // OHP on material
  const ohpMatl  = n(netRMCost * n(pct(item.ohp_percent_on_matl || template?.ohp_percent_on_matl || 0.10)));

  // Process costs
  const processCosts = (item.processes || []).map(p => ({
    name: p.process_name || p.name || 'Process',
    cost: n(p.calculated_cost || p.cost || 0),
  }));
  const totalProcessCost = n(processCosts.reduce((s, p) => s + p.cost, 0));

  // OHP on labour
  const ohpLabour = n(totalProcessCost * n(pct(item.ohp_on_labour_pct || template?.ohp_on_labour_pct || 0.15)));
  const rejCostLabour = n(totalProcessCost * n(pct(template?.rejection_on_labour_pct || 0.02)));

  // Overhead additions
  const packingCost   = n(item.packing_cost_per_nos   || template?.packing_cost_per_nos   || 5);
  const inspCost      = n(item.inspection_cost        || template?.inspection_cost        || 0.2);
  const toolMaintCost = n(item.tool_maintenance_cost  || template?.tool_maintenance_cost  || 0.2);
  const platingCost   = n((item.plating_cost_per_kg   || template?.plating_cost_per_kg   || 70) * grossWtPerPiece);

  const landedCostPerPiece = n(
    netRMCost + iccCost + ohpMatl +
    totalProcessCost + ohpLabour + rejCostLabour +
    packingCost + inspCost + toolMaintCost + platingCost
  );

  const qty    = n(item.Quantity || 1);
  const amount = n(landedCostPerPiece * qty);

  return {
    ...item,
    gross_weight_kg:          grossWtPerPiece,
    gross_wt_incl_rejection:  grossWtInclRej,
    net_weight_kg:            netWt,
    scrap_wt_actual:          scrapActual,
    gross_rm_rate:            grossRMRate,
    gst_setoff:               gstSetoff,
    net_rm_rate:              netRMRate,
    gross_rm_cost:            grossRMCost,
    scrap_credit:             scrapCredit,
    net_rm_cost:              netRMCost,
    icc_cost:                 iccCost,
    ohp_on_material:          ohpMatl,
    ProcessCost:              totalProcessCost,
    process_breakdown:        processCosts,
    ohp_on_labour:            ohpLabour,
    rejection_cost_labour:    rejCostLabour,
    packing_cost:             packingCost,
    inspection_cost:          inspCost,
    tool_maintenance_cost:    toolMaintCost,
    plating_cost:             platingCost,
    FinalRate:                landedCostPerPiece,
    SubTotal:                 landedCostPerPiece,
    Amount:                   amount,
    Quantity:                 qty,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.  COST BREAKUP TEMPLATE  (Steering_brackets_3191227_-_19_01_2026.xls)
//
// Vertical per-part sheet. Simple structure:
//   RM Cost (laser cutting / material) + Processing Costs + Overhead% → Cost/piece
//
//   Total = RMCost + sum(OperationCosts)
//   Overhead = Total * overhead_pct
//   CostPerPiece = Total + Overhead
// ─────────────────────────────────────────────────────────────────────────────
function calcCostBreakup(item, template) {
  const rmCost = n(item.gross_rm_cost || item.rm_cost || 0);

  const processCosts = (item.processes || []).map(p => ({
    name:        p.process_name || p.name || 'Operation',
    operation:   p.operation    || '',
    machine:     p.machine      || '',
    days_mandays: p.days_mandays || 0,
    amount:      n(p.calculated_cost || p.cost || 0),
  }));
  const totalProcessCost = n(processCosts.reduce((s, p) => s + p.amount, 0));

  const total          = n(rmCost + totalProcessCost);
  const overheadPct    = n(pct(item.OverheadPercent || item.overhead_pct || 10));
  const overheadAmount = n(total * overheadPct);
  const costPerPiece   = n(total + overheadAmount);

  const qty    = n(item.Quantity || 1);
  const amount = n(costPerPiece * qty);

  return {
    ...item,
    rm_cost:             rmCost,
    ProcessCost:         totalProcessCost,
    process_breakdown:   processCosts,
    SubTotal:            total,
    OverheadPercent:     overheadPct * 100,
    OverheadAmount:      overheadAmount,
    FinalRate:           costPerPiece,
    Amount:              amount,
    Quantity:            qty,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.  PART-WISE COST SHEET  (Poly_sheet_-_thik__5_0_mm_-_22_02_2026.xls)
//
// Customer-facing quotation table: one row per part.
// Columns: SR | PartDesc | DocNo | SAPNo | Sheet | Rev | Thk | RM_size |
//          RM_type | RM_cost | Conv_cost | Rate/pc | Margin | P&F | Rate/pc_final | Qty
//
//   TotalWeight = L * W * thk * density / 1e6  (or given)
//   RMCost = TotalWeight * rm_rate_per_kg
//   ConvCost = given (conversion / fabrication cost per pc)
//   RatePerPc = RMCost + ConvCost
//   Margin = RatePerPc * margin_pct
//   PF = pf_pct * RatePerPc
//   FinalRate = RatePerPc + Margin + PF
// ─────────────────────────────────────────────────────────────────────────────
function calcPartWise(item, template) {
  const L       = n(item.Length || 0);
  const W       = n(item.Width  || 0);
  const thk     = n(item.Thickness || 0);
  const density = n(item.density || 1.2);   // polycarbonate default

  // Weight either given or calculated
  const netWt   = n(item.net_weight_kg || (L * W * thk * density) / 1_000_000);
  const rmRate  = n(item.rm_rate || 0);
  const rmCost  = n(netWt * rmRate);

  const convCost   = n(item.conversion_cost || item.ProcessCost || 0);
  const ratePerPc  = n(rmCost + convCost);

  const marginPct  = n(pct(item.MarginPercent || item.margin_pct || 0.20));
  const margin     = n(ratePerPc * marginPct);
  const pfPct      = n(pct(item.pf_pct || 0.05));
  const pf         = n(ratePerPc * pfPct);

  const finalRate  = n(ratePerPc + margin + pf);
  const qty        = n(item.Quantity || 1);
  const amount     = n(finalRate * qty);

  return {
    ...item,
    net_weight_kg:    netWt,
    gross_rm_cost:    rmCost,
    conversion_cost:  convCost,
    rate_per_pc:      ratePerPc,
    MarginAmount:     margin,
    pf_amount:        pf,
    FinalRate:        finalRate,
    Amount:           amount,
    Quantity:         qty,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.  NOMEX / SHEET MATERIAL  (Nomex_Paper_Quotation_02_02_2026.xlsx)
//
// Sheet/paper cut parts. Weight-based RM cost + fabrication + wastage.
// Columns: Sr | SAP | Drawing | SNo | Rev | L | W | Thk |
//          TotalWt | Rate/kg | RMCost | Wastage | TotalRM |
//          Fabrication | Total | Profit% | Total | P&F% | DevCost | Total |
//          Qty | ToolCost
//
//   TotalWt = L * W * thk * density / 1e6  (gm → kg: / 1000)
//   RMCost  = TotalWt * rm_rate_per_kg
//   Wastage = RMCost * wastage_pct   (typically included in TotalRM)
//   TotalRM = RMCost + Wastage
//   FabCost = given per piece
//   Sub1    = TotalRM + FabCost
//   Profit  = Sub1 * profit_pct
//   Sub2    = Sub1 + Profit
//   PF      = Sub2 * pf_pct
//   FinalRate = Sub2 + PF + dev_cost_per_pc
// ─────────────────────────────────────────────────────────────────────────────
function calcNomexSheet(item, template) {
  const L       = n(item.Length || 0);       // mm
  const W       = n(item.Width  || 0);       // mm
  const thk     = n(item.Thickness || 0);    // mm
  const density = n(item.density || 1.0);    // g/cm³  (Nomex ~1.0–1.4)

  // weight in kg  (L mm * W mm * thk mm * density g/cm³ / 1e6 → kg)
  const totalWt   = n((L * W * thk * density) / 1_000_000);
  const rmRate    = n(item.rm_rate || 0);
  const rmCost    = n(totalWt * rmRate);
  const wastagePct = n(pct(item.wastage_pct || 0));
  const wastage   = n(rmCost * wastagePct);
  const totalRM   = n(rmCost + wastage);

  const fabCost   = n(item.fabrication_cost || item.ProcessCost || 0);
  const sub1      = n(totalRM + fabCost);

  const profitPct = n(pct(item.MarginPercent || item.profit_pct || 15));
  const profit    = n(sub1 * profitPct);
  const sub2      = n(sub1 + profit);

  const pfPct     = n(pct(item.pf_pct || 5));
  const pf        = n(sub2 * pfPct);

  const devCost   = n(item.dev_cost_per_pc || 0);
  const finalRate = n(sub2 + pf + devCost);
  const qty       = n(item.Quantity || 1);
  const amount    = n(finalRate * qty);

  return {
    ...item,
    total_weight_kg:  totalWt,
    gross_rm_cost:    rmCost,
    wastage_amount:   wastage,
    total_rm_cost:    totalRM,
    fabrication_cost: fabCost,
    SubTotal_1:       sub1,
    profit_amount:    profit,
    SubTotal_2:       sub2,
    pf_amount:        pf,
    dev_cost:         devCost,
    FinalRate:        finalRate,
    Amount:           amount,
    Quantity:         qty,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6.  REVISED CONVERSION / MULTI-PART ASSEMBLY  (26_02_2026-_Revised_Conversion.xlsx)
//
// Assembly-level quotation where each "item" is a BUSBAR SET.
// Each set contains sub-parts (busbars), each costed individually.
// Total AMT/SET = sum of all sub-part (Rate/pc * qty/set).
//
//   Per busbar: GrossWt = T * W * L * density / 1e6
//   RMCost     = GrossWt * Cu_flat_rate  (or sheet rate based on rm_type)
//   Margin     = RMCost * margin_pct
//   PlatingCost = GrossWt * plating_rate  (Tin on Cu/Al)
//   RatePerPc  = RMCost + Margin + PlatingCost + InsertCut
//   AmtPerSet  = RatePerPc * qty_in_set
// ─────────────────────────────────────────────────────────────────────────────
function calcRevisedConversion(item, template) {
  const subParts = (item.sub_parts || [item]).map(sp => {
    const T       = n(sp.Thickness || 0);
    const W       = n(sp.Width     || 0);
    const L       = n(sp.Length    || 0);
    const density = n(sp.density   || 8.9);
    const grossWt = n((T * W * L * density) / 1_000_000);

    // RM rate depends on material type (Cu Flat vs Cu Sheet vs Al Flat vs Al Sheet)
    const rmType  = (sp.rm_type || 'Cu Flat').toLowerCase();
    let rmRate;
    if      (rmType.includes('cu') && rmType.includes('sheet')) rmRate = n(template?.cu_sheet_rate || sp.rm_rate || 1438.85);
    else if (rmType.includes('al') && rmType.includes('sheet')) rmRate = n(template?.al_sheet_rate || sp.rm_rate || 442);
    else if (rmType.includes('al'))                              rmRate = n(template?.al_flat_rate  || sp.rm_rate || 418);
    else                                                         rmRate = n(template?.cu_flat_rate  || sp.rm_rate || 1357.85);

    const rmCost       = n(grossWt * rmRate);
    const marginPct    = n(pct(sp.MarginPercent || 15));
    const margin       = n(rmCost * marginPct);

    // Plating (Tin on Cu: 75/kg, Tin on Al: 160/kg)
    const platingRate  = rmType.includes('al') ? 160 : 75;
    const platingCost  = n(grossWt * platingRate);

    const insertCut    = n(sp.insert_cut || sp.ProcessCost || 0);
    const scrapCredit  = n(grossWt * 0.10 * rmRate * 0.10);  // 10% scrap deduction
    const ratePerPc    = n(rmCost + margin + platingCost + insertCut - scrapCredit);
    const qtyInSet     = parseInt(sp.qty_in_set || sp.Quantity || 1);
    const amtPerSet    = n(ratePerPc * qtyInSet);

    return { ...sp, grossWt, rmCost, margin, platingCost, insertCut, ratePerPc, qty_in_set: qtyInSet, amtPerSet };
  });

  const totalAmtPerSet = n(subParts.reduce((s, sp) => s + sp.amtPerSet, 0));
  const qty            = n(item.Quantity || 1);
  const amount         = n(totalAmtPerSet * qty);

  return {
    ...item,
    sub_parts:    subParts,
    FinalRate:    totalAmtPerSet,
    SubTotal:     totalAmtPerSet,
    Amount:       amount,
    Quantity:     qty,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7.  LASER + FABRICATION SHEET  (27_02_2026__-___CC0L0005002___-.xlsx)
//
// Very detailed sheet metal cost sheet:
//   Drawing Spec → RM Calculation → Laser Calc → Special Ops →
//   Bending → Fabrication + Powder Coating → Total
//
//   NetWt    = L * W * thk / 1e6 * density
//   Wastage  = NetWt * 10%
//   TotalWt  = NetWt + Wastage
//   RMCost   = TotalWt * rm_rate
//   ScrapCredit = ScrapWt * scrap_rate
//   NetMatCost = RMCost - ScrapCredit
//   LaserCost = (path_length_sq * laser_rate) + (start_points * start_rate)
//   SpecialOpsCost = drilling + flatting + tapping + csk + mach/grinding + hardware
//   BendingCost = given
//   FabCost = given
//   TotalProcess = LaserCost + SpecialOpsCost + BendingCost + FabCost
//   Overheads = (inspection + rejection + design_jig + packaging + OH_profit + transport)
//   FinalCost = NetMatCost + TotalProcess + Overheads
// ─────────────────────────────────────────────────────────────────────────────
function calcLaserFabrication(item, template) {
  const L       = n(item.Length || 0);      // mm
  const W       = n(item.Width  || 0);      // mm
  const thk     = n(item.Thickness || 0);   // mm
  const density = n(item.density || 7.85);  // MS default
  const qty     = parseInt(item.Quantity || 1);

  const netWt     = n((L * W * thk * density) / 1_000_000);
  const wastage   = n(netWt * 0.10);
  const totalWt   = n(netWt + wastage);
  const rmRate    = n(item.rm_rate || 75);
  const rmCost    = n(totalWt * rmRate);
  const scrapRate = n(item.scrap_rate_per_kg || 20);
  const scrapWt   = n(totalWt * 0.10);
  const scrapCredit = n(scrapWt * scrapRate);
  const netMatCost = n(rmCost - scrapCredit);

  // Laser calculation
  const pathLengthSqMm = n(item.path_length_sq_mm || 0);
  const laserRate      = n(item.laser_rate_per_sq_mm || 0.02);
  const startPoints    = parseInt(item.start_points || 0);
  const startRate      = n(item.start_point_rate || 2.5);
  const laserCost      = n((pathLengthSqMm * laserRate) + (startPoints * startRate));

  // Special operations
  const flatningCost = n(item.flatning_cost || 0);
  const drillingCost = n(item.drilling_cost || 0);
  const tappingCost  = n(item.tapping_cost  || 0);
  const cskCost      = n(item.csk_cost      || 0);
  const machGrindCost= n(item.mach_grinding_cost || item.hardware_cost || 0);
  const bendingCost  = n(item.bending_cost  || 0);
  const fabCost      = n(item.fabrication_cost || item.ProcessCost || 0);

  const totalProcessCost = n(laserCost + flatningCost + drillingCost + tappingCost +
                              cskCost + machGrindCost + bendingCost + fabCost);

  const totalPlusMatCost = n(netMatCost + totalProcessCost);

  // Overhead rates (from template or defaults matching the CC0L0005002 file: 2% each)
  const ovhPct = n(pct(template?.inspection_pct         || 2));
  const rejPct = n(pct(template?.rejection_pct          || 2));
  const dsnPct = n(pct(template?.design_jig_pct         || 2));
  const pkgPct = n(pct(template?.packaging_pct          || 2));
  const ohpPct = n(pct(template?.overhead_profit_pct    || 15));
  const trsPct = n(pct(template?.transportation_pct     || 2));

  const inspCost    = n(totalPlusMatCost * ovhPct);
  const rejCost     = n(totalPlusMatCost * rejPct);
  const designCost  = n(totalPlusMatCost * dsnPct);
  const pkgCost     = n(totalPlusMatCost * pkgPct);
  const ohpCost     = n(totalPlusMatCost * ohpPct);
  const trsCost     = n(totalPlusMatCost * trsPct);
  const totalOverheads = n(inspCost + rejCost + designCost + pkgCost + ohpCost + trsCost);

  const finalCost   = n(totalPlusMatCost + totalOverheads);
  const amount      = n(finalCost * qty);

  return {
    ...item,
    net_weight_kg:        netWt,
    wastage_kg:           wastage,
    total_weight_kg:      totalWt,
    rm_cost:              rmCost,
    scrap_credit:         scrapCredit,
    net_material_cost:    netMatCost,
    laser_cost:           laserCost,
    flatning_cost:        flatningCost,
    drilling_cost:        drillingCost,
    tapping_cost:         tappingCost,
    csk_cost:             cskCost,
    mach_grind_cost:      machGrindCost,
    bending_cost:         bendingCost,
    fabrication_cost:     fabCost,
    ProcessCost:          totalProcessCost,
    total_process_plus_mat: totalPlusMatCost,
    inspection_cost:      inspCost,
    rejection_cost:       rejCost,
    design_jig_cost:      designCost,
    packaging_cost:       pkgCost,
    overhead_profit_cost: ohpCost,
    transportation_cost:  trsCost,
    total_overheads:      totalOverheads,
    FinalRate:            finalCost,
    SubTotal:             totalPlusMatCost,
    Amount:               amount,
    Quantity:             qty,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCHER — pick the right calculator by template formula_engine
// ─────────────────────────────────────────────────────────────────────────────
const CALCULATORS = {
  busbar:              calcBusbar,
  landed_cost:         calcLandedCost,
  cost_breakup:        calcCostBreakup,
  part_wise:           calcPartWise,
  nomex_sheet:         calcNomexSheet,
  revised_conversion:  calcRevisedConversion,
  laser_fabrication:   calcLaserFabrication,
};

function calculateItem(item, template) {
  const engine = template?.formula_engine || 'busbar';
  const calc   = CALCULATORS[engine] || calcBusbar;
  return calc(item, template);
}

function calculateAllItems(items, template) {
  return items.map(item => calculateItem(item, template));
}

module.exports = {
  calculateItem,
  calculateAllItems,
  calcBusbar,
  calcLandedCost,
  calcCostBreakup,
  calcPartWise,
  calcNomexSheet,
  calcRevisedConversion,
  calcLaserFabrication,
  CALCULATORS,
};