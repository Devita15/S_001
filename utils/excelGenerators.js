'use strict';

// utils/excelGenerators.js
//
// ⚠️  CRITICAL ExcelJS rule:
//     Formulas MUST be set as { formula: 'expression' } objects.
//     Setting cell.value = '=A1+B1' saves as a TEXT STRING (dtype=s).
//     Setting cell.value = { formula: 'A1+B1' } saves as a real FORMULA (dtype=f).
//     This file uses the f() helper everywhere to enforce this.

const ExcelJS = require('exceljs');

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** 1-based column index → Excel letter  (1→A, 28→AB …) */
function colLetter(n) {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

/**
 * Wrap a formula string so ExcelJS writes it as dtype=f, not dtype=s.
 * Pass the formula WITHOUT the leading '=' — this adds it.
 * Usage:  cell.value = f('A1+B1')   →  { formula: 'A1+B1' }
 */
function f(expression) {
  // strip any accidental leading '=' or '+' before wrapping
  const clean = expression.replace(/^[=+]+/, '');
  return { formula: clean };
}

const THIN_BORDER = {
  top: { style: 'thin' }, left: { style: 'thin' },
  bottom: { style: 'thin' }, right: { style: 'thin' },
};
const MEDIUM_BORDER = {
  top: { style: 'medium' }, left: { style: 'medium' },
  bottom: { style: 'medium' }, right: { style: 'medium' },
};

const YELLOW_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
const GREEN_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
const ORANGE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };

function centerAlign(wrap = true) { return { horizontal: 'center', vertical: 'middle', wrapText: wrap }; }
function leftAlign()              { return { horizontal: 'left',   vertical: 'middle', wrapText: true  }; }

/**
 * Apply style + value to a cell.
 * value can be:
 *   - a plain number/string  → stored as-is
 *   - { formula: '...' }     → stored as real Excel formula (use f() helper)
 */
function styleCell(cell, {
  value, numFmt,
  bold   = false,
  fill   = null,
  border = THIN_BORDER,
  align  = centerAlign(),
  fontSize = 10,
  italic = false,
} = {}) {
  if (value !== undefined) cell.value = value;
  cell.font      = { name: 'Arial', size: fontSize, bold, italic };
  cell.alignment = align;
  if (fill)   cell.fill   = fill;
  if (border) cell.border = border;
  if (numFmt) cell.numFmt = numFmt;
}


// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE 1 ── BUSBAR  (horizontal_table)
// ═══════════════════════════════════════════════════════════════════════════════
function generateBusbarExcel(workbook, quotationData, template) {

  // ── 1. Collect unique process names across all items ──────────────────────
  const processNames   = [];
  const processNameSet = new Set();
  for (const item of quotationData.Items) {
    for (const p of (item.processes || [])) {
      const name = (p.process_name || p.ProcessName || '').trim();
      if (name && !processNameSet.has(name)) {
        processNameSet.add(name);
        processNames.push(name);
      }
    }
  }

  // ── 2. Column layout ──────────────────────────────────────────────────────
  const FIXED_PRE_COUNT = 19;
  const dynCount  = processNames.length;
  const dynStart  = FIXED_PRE_COUNT + 1;
  const postStart = FIXED_PRE_COUNT + dynCount + 1;

  const COL = {
    SR_NO: 1, PART_NO: 2, PART_DESC: 3, DRAWING_NO: 4, REV_NO: 5, RM_GRADE: 6,
    THICKNESS: 7, WIDTH: 8, LENGTH: 9, DENSITY: 10,
    GROSS_WT: 11, RM_RATE: 12, PROFILE_CONV: 13, TOTAL_RM_RATE: 14,
    GROSS_RM_COST: 15, NET_WT: 16, SCRAP_KG: 17, SCRAP_RATE: 18, SCRAP_COST: 19,
    PROCESS_START: dynStart,
    SUB_TOTAL:  postStart,
    MARGIN:     postStart + 1,
    FINAL_COST: postStart + 2,
    QTY:        postStart + 3,
  };

  const totalCols = postStart + 3;
  const L = colLetter; // alias

  // ── 3. Worksheet ──────────────────────────────────────────────────────────
  const ws = workbook.addWorksheet(template.template_name || 'Copper Busbar Cost Sheet', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });

  // ── 4. Column widths ──────────────────────────────────────────────────────
  const COL_WIDTHS = {
    [COL.SR_NO]: 8, [COL.PART_NO]: 14, [COL.PART_DESC]: 34, [COL.DRAWING_NO]: 15,
    [COL.REV_NO]: 8, [COL.RM_GRADE]: 15, [COL.THICKNESS]: 9, [COL.WIDTH]: 8,
    [COL.LENGTH]: 10, [COL.DENSITY]: 9, [COL.GROSS_WT]: 13, [COL.RM_RATE]: 11,
    [COL.PROFILE_CONV]: 14, [COL.TOTAL_RM_RATE]: 14, [COL.GROSS_RM_COST]: 18,
    [COL.NET_WT]: 11, [COL.SCRAP_KG]: 11, [COL.SCRAP_RATE]: 18, [COL.SCRAP_COST]: 14,
    [COL.SUB_TOTAL]: 15, [COL.MARGIN]: 14, [COL.FINAL_COST]: 17, [COL.QTY]: 13,
  };
  for (let c = 1; c <= totalCols; c++) {
    ws.getColumn(c).width = COL_WIDTHS[c] || 12;
  }

  // ── 5. Row 1 – reserved blank ─────────────────────────────────────────────
  ws.getRow(1).height = 8;

  // ── 6. Header rows 2–4 ────────────────────────────────────────────────────
  ws.getRow(2).height = 28.5;
  ws.getRow(3).height = 48.75;
  ws.getRow(4).height = 22.5;

  const fixedHeaders = [
    { col: COL.SR_NO,         label: 'SR.NO.',                  mergeRows: 3, unit: ''    },
    { col: COL.PART_NO,       label: 'Part No.',                mergeRows: 3, unit: ''    },
    { col: COL.PART_DESC,     label: 'Part Description',        mergeRows: 3, unit: ''    },
    { col: COL.DRAWING_NO,    label: 'Drawing No.',             mergeRows: 3, unit: ''    },
    { col: COL.REV_NO,        label: 'Rev. No.',                mergeRows: 3, unit: ''    },
    { col: COL.RM_GRADE,      label: 'RM Grade',                mergeRows: 3, unit: ''    },
    { col: COL.THICKNESS,     label: 'T',                       mergeRows: 2, unit: 'MM'  },
    { col: COL.WIDTH,         label: 'W',                       mergeRows: 2, unit: 'MM'  },
    { col: COL.LENGTH,        label: 'L',                       mergeRows: 2, unit: 'MM'  },
    { col: COL.DENSITY,       label: 'S',                       mergeRows: 2, unit: 'MM'  },
    { col: COL.GROSS_WT,      label: 'G.Wt / Pcs',             mergeRows: 2, unit: 'KG'  },
    { col: COL.RM_RATE,       label: 'RM Rate',                 mergeRows: 2, unit: 'Rs.' },
    { col: COL.PROFILE_CONV,  label: 'Profile Conversion Rate', mergeRows: 2, unit: 'Rs.' },
    { col: COL.TOTAL_RM_RATE, label: 'Total RM rate per kgs',  mergeRows: 2, unit: 'Rs.' },
    { col: COL.GROSS_RM_COST, label: 'Gross Rm Cost',           mergeRows: 2, unit: 'INR' },
    { col: COL.NET_WT,        label: 'Net Wgt',                 mergeRows: 2, unit: 'Kgs' },
    { col: COL.SCRAP_KG,      label: 'Scrap Kgs',               mergeRows: 2, unit: 'Kgs' },
    { col: COL.SCRAP_RATE,    label: 'Scrap rate/ Kgs',         mergeRows: 2, unit: 'Rs.' },
    { col: COL.SCRAP_COST,    label: 'Scrap Cost',              mergeRows: 2, unit: 'Rs.' },
  ];

  for (const h of fixedHeaders) {
    styleCell(ws.getCell(2, h.col), { value: h.label, bold: true, fill: HEADER_FILL, border: THIN_BORDER, align: centerAlign() });
    if (h.mergeRows === 3) {
      ws.mergeCells(2, h.col, 4, h.col);
    } else {
      ws.mergeCells(2, h.col, 3, h.col);
      styleCell(ws.getCell(4, h.col), { value: h.unit, bold: true, fill: HEADER_FILL, border: THIN_BORDER, align: centerAlign() });
    }
  }

  // "Process" group header + per-process sub-headers
  if (dynCount > 0) {
    styleCell(ws.getCell(2, dynStart), { value: 'Process', bold: true, fill: ORANGE_FILL, border: THIN_BORDER, align: centerAlign() });
    if (dynCount > 1) ws.mergeCells(2, dynStart, 2, dynStart + dynCount - 1);
    for (let i = 0; i < dynCount; i++) {
      styleCell(ws.getCell(3, dynStart + i), { value: processNames[i], bold: true, fill: HEADER_FILL, border: THIN_BORDER, align: centerAlign() });
      styleCell(ws.getCell(4, dynStart + i), { value: 'INR',           bold: true, fill: HEADER_FILL, border: THIN_BORDER, align: centerAlign() });
    }
  }

  // Post-process column headers
  const postHeaders = [
    { col: COL.SUB_TOTAL,  label: 'SUB TOTAL',      unit: 'INR' },
    { col: COL.MARGIN,     label: 'Margin +OH',      unit: 'INR' },
    { col: COL.FINAL_COST, label: 'Final Part Cost', unit: 'INR' },
    { col: COL.QTY,        label: 'Qty Required',    unit: 'Nos' },
  ];
  for (const h of postHeaders) {
    const isFinal = h.col === COL.FINAL_COST;
    const hFill   = isFinal ? GREEN_FILL : HEADER_FILL;
    styleCell(ws.getCell(2, h.col), { value: h.label, bold: true, fill: hFill, border: THIN_BORDER, align: centerAlign() });
    ws.mergeCells(2, h.col, 3, h.col);
    styleCell(ws.getCell(4, h.col), { value: h.unit, bold: true, fill: hFill, border: THIN_BORDER, align: centerAlign() });
  }

  // ── 7. Data rows ──────────────────────────────────────────────────────────
  const DATA_START = 5;

  quotationData.Items.forEach((item, idx) => {
    const r = DATA_START + idx;
    ws.getRow(r).height = 31.2;

    // Build process cost lookup for this item: processName → calculated_cost
    const procCostMap = {};
    for (const p of (item.processes || [])) {
      const name = (p.process_name || p.ProcessName || '').trim();
      procCostMap[name] = p.calculated_cost || 0;
    }

    const density = item.density || 8.96;   // plain number e.g. 8.96

    // ── Fixed pre-process data columns ────────────────────────────────────
    const fixedData = [
      // Plain values
      { col: COL.SR_NO,        value: (idx + 1) * 10,                       numFmt: '0'         },
      { col: COL.PART_NO,      value: item.PartNo       || '',               numFmt: '@'         },
      { col: COL.PART_DESC,    value: item.PartName     || '',               numFmt: '@'         },
      { col: COL.DRAWING_NO,   value: item.drawing_no   || '',               numFmt: '@'         },
      { col: COL.REV_NO,       value: String(item.revision_no ?? '0'),       numFmt: '@'         },
      { col: COL.RM_GRADE,     value: item.rm_grade     || '',               numFmt: '@'         },
      { col: COL.THICKNESS,    value: item.Thickness    || 0,                numFmt: '0.00'      },
      { col: COL.WIDTH,        value: item.Width        || 0,                numFmt: '0.00'      },
      { col: COL.LENGTH,       value: item.Length       || 0,                numFmt: '0.00'      },
      // Density displayed in scientific notation (matches original sample)
      { col: COL.DENSITY,      value: density * 1e-6,                        numFmt: '0.00E+00'  },
      // ── FORMULAS — use f() so ExcelJS writes dtype=f not dtype=s ──────
      // Gross Weight = T × W × L × density / 1,000,000
      {
        col: COL.GROSS_WT,
        value: f(`${L(COL.THICKNESS)}${r}*${L(COL.WIDTH)}${r}*${L(COL.LENGTH)}${r}*${density}/1000000`),
        numFmt: '#,##0.000',
      },
      // RM Rate & Profile Conv – plain values from DB
      { col: COL.RM_RATE,      value: item.rm_rate                 || 0,     numFmt: '#,##0.00'  },
      { col: COL.PROFILE_CONV, value: item.profile_conversion_rate || 0,     numFmt: '#,##0.00'  },
      // Total RM Rate = RM Rate + Profile Conv Rate
      {
        col: COL.TOTAL_RM_RATE,
        value: f(`${L(COL.RM_RATE)}${r}+${L(COL.PROFILE_CONV)}${r}`),
        numFmt: '#,##0.00',
      },
      // Gross RM Cost = Gross Wt × Total RM Rate
      {
        col: COL.GROSS_RM_COST,
        value: f(`${L(COL.GROSS_WT)}${r}*${L(COL.TOTAL_RM_RATE)}${r}`),
        numFmt: '#,##0.00',
      },
      // Net Weight – stored value from DimensionWeight master
      { col: COL.NET_WT,       value: item.net_weight_kg           || 0,     numFmt: '#,##0.000' },
      // Scrap Kg = Gross Wt − Net Wt
      {
        col: COL.SCRAP_KG,
        value: f(`${L(COL.GROSS_WT)}${r}-${L(COL.NET_WT)}${r}`),
        numFmt: '#,##0.000',
      },
      // Scrap Rate = RM Rate × 0.6
      {
        col: COL.SCRAP_RATE,
        value: f(`${L(COL.RM_RATE)}${r}*0.6`),
        numFmt: '#,##0.00',
      },
      // Scrap Cost = Scrap Kg × Scrap Rate
      {
        col: COL.SCRAP_COST,
        value: f(`${L(COL.SCRAP_KG)}${r}*${L(COL.SCRAP_RATE)}${r}`),
        numFmt: '#,##0.00',
      },
    ];

    for (const fd of fixedData) {
      styleCell(ws.getCell(r, fd.col), {
        value: fd.value, numFmt: fd.numFmt,
        border: THIN_BORDER, align: centerAlign(false),
      });
    }

    // ── Dynamic process cost columns ──────────────────────────────────────
    for (let i = 0; i < dynCount; i++) {
      const c    = dynStart + i;
      const name = processNames[i];
      const cost = procCostMap[name] || 0;
      styleCell(ws.getCell(r, c), {
        value: cost, numFmt: '#,##0.00',
        border: THIN_BORDER, align: centerAlign(false),
      });
    }

    // ── SUB TOTAL = Gross RM Cost − Scrap Cost + SUM of all process cols ──
    const procParts = [];
    for (let i = 0; i < dynCount; i++) procParts.push(`${L(dynStart + i)}${r}`);
    const procSum = dynCount > 0 ? `+${procParts.join('+')}` : '';

    styleCell(ws.getCell(r, COL.SUB_TOTAL), {
      value:  f(`${L(COL.GROSS_RM_COST)}${r}-${L(COL.SCRAP_COST)}${r}${procSum}`),
      numFmt: '#,##0.00', border: THIN_BORDER, align: centerAlign(false),
    });

    // ── Margin = SubTotal × margin% ───────────────────────────────────────
    const marginPct = template.default_margin_percent || 15;
    styleCell(ws.getCell(r, COL.MARGIN), {
      value:  f(`${L(COL.SUB_TOTAL)}${r}*${marginPct}%`),
      numFmt: '#,##0.00', border: THIN_BORDER, align: centerAlign(false),
    });

    // ── Final Part Cost = SubTotal + Margin ───────────────────────────────
    styleCell(ws.getCell(r, COL.FINAL_COST), {
      value:  f(`SUM(${L(COL.SUB_TOTAL)}${r}:${L(COL.MARGIN)}${r})`),
      numFmt: '#,##0.00', fill: GREEN_FILL, bold: true,
      border: THIN_BORDER, align: centerAlign(false),
    });

    // ── Qty Required ──────────────────────────────────────────────────────
    styleCell(ws.getCell(r, COL.QTY), {
      value: item.Quantity || 0, numFmt: '0',
      border: THIN_BORDER, align: centerAlign(false),
    });
  });

  // ── 8. Freeze header rows ─────────────────────────────────────────────────
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 4, topLeftCell: 'A5' }];

  return ws;
}


// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE 2 ── LANDED COST  (vertical_per_item)
// ═══════════════════════════════════════════════════════════════════════════════
function generateLandedCostExcel(workbook, quotationData, template) {

  const SHEET_COL_WIDTHS = { 1: 33.5, 2: 10.5, 3: 8.5, 4: 15.5, 5: 11 };

  // ── Quotation-level settings (user provided at creation, stored on quotationData) ──
  // These are the same for ALL items in this quotation.
  const ICC_INPUT_DAYS   = quotationData.icc_credit_on_input_days ?? -30;
  const ICC_WIP_DAYS     = quotationData.icc_wip_fg_days          ?? 30;
  const ICC_CREDIT_DAYS  = quotationData.icc_credit_given_days    ?? 45;
  const COST_OF_CAPITAL  = quotationData.icc_cost_of_capital      ?? 0.10;
  const OHP_MATL         = quotationData.ohp_percent_on_matl      ?? 0.10;
  const OHP_LABOUR       = quotationData.ohp_on_labour_pct        ?? 0.15;
  const INSPECTION       = quotationData.inspection_cost          ?? 0.2;
  const TOOL_MAINTENANCE = quotationData.tool_maintenance_cost    ?? 0.2;
  const PACKING_PER_NOS  = quotationData.packing_cost_per_nos     ?? 5;
  const PLATING_PER_KG   = quotationData.plating_cost_per_kg      ?? 70;
  // NOTE: SCRAP_REAL_PCT, RM_REJECTION_PCT, TRANSPORT, GST_PCT are per-item
  // (read from item.scrap_realisation_percent, item.rm_rejection_percent,
  //  item.transport_rate_per_kg, item.gst_percentage inside the item loop below)

  for (const item of quotationData.Items) {

    const wsName = (item.PartNo || 'Item').replace(/[/\\?*[\]:]/g, '-').slice(0, 31);
    const ws     = workbook.addWorksheet(wsName);
    for (let c = 1; c <= 5; c++) ws.getColumn(c).width = SHEET_COL_WIDTHS[c] || 12;

    // ── Per-item constants from masters (stored on item by controller) ────
    // Percentages stored as plain numbers (e.g. 2 = 2%, 85 = 85%) — divide by 100
    const RM_REJECTION_PCT = (item.rm_rejection_percent      ?? 2)  / 100;  // → 0.02
    const SCRAP_REAL_PCT   = (item.scrap_realisation_percent ?? 85) / 100;  // → 0.85
    const TRANSPORT        = item.transport_rate_per_kg ?? 1.5;             // Rs/kg from RawMaterial master
    const GST_PCT          = (item.gst_percentage ?? 18) / 100;            // → 0.18 from Tax master

    // ─────────────────────────────────────────────────────────────────────
    // FIX: Use ws.getCell('D16') string notation — NOT ws.getCell(row, 4)
    // ExcelJS has a column-index conflict when you mix border-only cells
    // (col 2) with value cells (col 4) using numeric indexing in the same
    // row. String notation bypasses this and writes to the exact cell.
    //
    // Also supply result: alongside every formula so Excel shows the value
    // immediately on open without needing to recalculate.
    // ─────────────────────────────────────────────────────────────────────

    // Helper: set a cell by string ref with style
    const SC = (ref, opts = {}) => styleCell(ws.getCell(ref), opts);

    // Helper: write a 4-column row  A=label | B=blank | C=cVal | D=value
    // Uses STRING refs ('A5', 'B5', 'C5', 'D5') — avoids numeric index bug
    const R = (rowNum, label, dVal, opts = {}) => {
      ws.getRow(rowNum).height = opts.height || 14.4;
      SC(`A${rowNum}`, { value: label, bold: opts.labelBold || false, border: THIN_BORDER, align: leftAlign() });
      SC(`B${rowNum}`, { border: THIN_BORDER });
      SC(`C${rowNum}`, opts.cVal !== undefined
        ? { value: opts.cVal, bold: opts.cBold || false, numFmt: opts.cNumFmt, border: THIN_BORDER, align: centerAlign(false) }
        : { border: THIN_BORDER });
      SC(`D${rowNum}`, { value: dVal, fill: opts.fill || null, numFmt: opts.numFmt || '0.00', bold: opts.dBold || false, border: THIN_BORDER, align: centerAlign(false) });
    };

    // Blank 4-col row
    const BLANK = (rowNum, h = 14.4) => {
      ws.getRow(rowNum).height = h;
      ['A','B','C','D'].forEach(col => SC(`${col}${rowNum}`, { border: THIN_BORDER }));
    };

    // ── Row 1: column headers ──────────────────────────────────────────
    ws.getRow(1).height = 28.8;
    SC('A1', { value: 'Landed Cost (Rs/Kg)', border: THIN_BORDER, align: centerAlign(false) });
    SC('B1', { value: 'Fabrication rate',    border: THIN_BORDER, align: centerAlign(false) });
    SC('C1', { value: 'RM/KG',               border: THIN_BORDER, align: centerAlign(false) });

    // ── Row 2: rate inputs ─────────────────────────────────────────────
    // FIX: Put actual rm_rate directly in A2 so D25=$C$2 gets a real value
    // (previously landedCostPerKg=0 made D25=0 → all RM cost = 0)
    ws.getRow(2).height = 43.2;
    SC('A2', { value: item.rm_rate || 0,              numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });
    SC('B2', { value: item.profile_conversion_rate||0, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });
    SC('C2', { value: f('A2+B2'),                     numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });
    SC('D2', { value: 'rate will be applicable as per current BME', border: THIN_BORDER, align: leftAlign(), fontSize: 9, italic: true });

    ws.getRow(3).height = 14.4;
    ws.getRow(4).height = 14.4;

    // ── Rows 5–15: item info plain values ──────────────────────────────
    R(5,  'ITEM NO.',           item.PartNo                    || '', { labelBold: true, fill: YELLOW_FILL, numFmt: '@', height: 21 });
    R(6,  'MATERIAL',           item.rm_grade                  || '', { labelBold: true, numFmt: '@' });
    R(7,  'RM Source',          item.rm_source                 || '', { labelBold: true, numFmt: '@' });
    R(8,  'RM TYPE',            item.rm_type                   || 'Strip', { labelBold: true, numFmt: '@' });
    R(9,  'RAW MATERIAL Spec',  item.rm_grade                  || '', { numFmt: '@' });
    R(10, 'Strip Size',         item.Length                    || 0,  { numFmt: '0.00' });
    R(11, 'Thickness',          item.Thickness                 || 0,  { numFmt: '0.00' });
    R(12, 'Strip width',        item.Width                     || 0,  { numFmt: '0.00' });
    R(13, 'Pitch',              item.pitch || item.Length      || 0,  { fill: YELLOW_FILL, numFmt: '0.00' });
    R(14, 'No of Cavity',       item.no_of_cavity              || 1,  { numFmt: '0' });
    R(15, 'Density',            item.density                   || 8.96, { numFmt: '0.00' });

    // ── Row 16: Gross Weight formula ───────────────────────────────────
    // Pre-compute result so Excel doesn't show blank/error before recalc
    const T11 = item.Thickness  || 0;
    const T12 = item.Width      || 0;
    const T13 = item.pitch || item.Length || 0;
    const T14 = item.no_of_cavity || 1;
    const T15 = item.density    || 8.96;
    const grossWtResult = T11 * T12 * T13 * T15 * 1e-6 / T14;
    R(16, 'GROSS Wt/each', { formula: 'D11*D12*D13*D15*10^-6/D14', result: grossWtResult }, { numFmt: '0.000' });

    // ── Row 17: RM Rejection % ─────────────────────────────────────────
    ws.getRow(17).height = 14.4;
    SC('A17', { value: 'R.M. REJECTION %', border: THIN_BORDER, align: leftAlign() });
    SC('B17', { border: THIN_BORDER });
    SC('C17', { value: RM_REJECTION_PCT, bold: true, numFmt: '0.0%', border: THIN_BORDER, align: centerAlign(false) });
    SC('D17', { value: { formula: '$C$17', result: RM_REJECTION_PCT }, numFmt: '0%', border: THIN_BORDER, align: centerAlign(false) });

    // ── Row 18: Gross Wt incl rejection ───────────────────────────────
    const grossWtInclRejn = grossWtResult * (1 + RM_REJECTION_PCT);
    R(18, 'GROSS WT. INCL.REJN.', { formula: 'D16*(1+D17)', result: grossWtInclRejn }, { numFmt: '0.000' });

    BLANK(19);

    // ── Row 20: Net Weight (plain value from master) ───────────────────
    R(20, 'NET WT', item.net_weight_kg || 0, { fill: YELLOW_FILL, numFmt: '0.000' });

    // ── Row 21: Scrap Wt ───────────────────────────────────────────────
    const scrapWt = grossWtInclRejn - (item.net_weight_kg || 0);
    R(21, 'SCRAP WT.', { formula: 'D18-D20', result: scrapWt }, { numFmt: '0.000' });

    // ── Row 22: Actual Scrap Realisation % ────────────────────────────
    ws.getRow(22).height = 14.4;
    SC('A22', { value: 'ACTUAL SCRAP WT. REALISATION(%)', border: THIN_BORDER, align: leftAlign() });
    SC('B22', { border: THIN_BORDER });
    SC('C22', { value: SCRAP_REAL_PCT, bold: true, numFmt: '0%', border: THIN_BORDER, align: centerAlign(false) });
    SC('D22', { value: { formula: '$C$22', result: SCRAP_REAL_PCT }, numFmt: '0%', border: THIN_BORDER, align: centerAlign(false) });

    // ── Row 23: Scrap actual realisation ──────────────────────────────
    const scrapActual = scrapWt * SCRAP_REAL_PCT;
    R(23, 'SCRAP WT-ACTUAL REALISATION', { formula: 'D21*D22', result: scrapActual }, { numFmt: '0.0000' });
    BLANK(24);

    // ── Row 25: Basic RM Rate = C2 (rm_rate + profile conv rate) ──────
    const rmRateTotal = (item.rm_rate || 0) + (item.profile_conversion_rate || 0);
    R(25, 'BASIC RAW MATERIAL RATE', { formula: '$C$2', result: rmRateTotal }, { fill: YELLOW_FILL, numFmt: '0.00' });

    // ── Row 26: GST (from Tax master by HSNCode → item.gst_percentage) ─────
    ws.getRow(26).height = 15.6;
    SC('A26', { value: 'GST', border: THIN_BORDER, align: leftAlign() });
    SC('B26', { border: THIN_BORDER });
    SC('C26', { value: GST_PCT, bold: true, numFmt: '0.00%', border: THIN_BORDER, align: centerAlign(false) });
    SC('D26', { value: { formula: '$C$26', result: GST_PCT }, numFmt: '0.00%', border: THIN_BORDER, align: centerAlign(false) });

    const gstAmt = rmRateTotal * GST_PCT;
    R(27, '', { formula: 'D25*D26', result: gstAmt }, { numFmt: '0.00', height: 15.6 });

    // ── Row 28: Additional surcharge (0%) ─────────────────────────────
    ws.getRow(28).height = 15.6;
    SC('A28', { border: THIN_BORDER });
    SC('B28', { border: THIN_BORDER });
    SC('C28', { value: 0, bold: true, numFmt: '0%', border: THIN_BORDER, align: centerAlign(false) });
    SC('D28', { value: { formula: '$C$28', result: 0 }, numFmt: '0.00%', border: THIN_BORDER, align: centerAlign(false) });

    R(29, '', { formula: '(D25+D27)*D28', result: 0 }, { numFmt: '0.00', height: 15.6 });

    // ── Row 30: Transport ─────────────────────────────────────────────
    ws.getRow(30).height = 15.6;
    SC('A30', { value: 'Transport  Rs / Kg', border: THIN_BORDER, align: leftAlign() });
    SC('B30', { border: THIN_BORDER });
    SC('C30', { value: TRANSPORT, bold: true, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });  // from RawMaterial.transport_rate_per_kg
    SC('D30', { value: { formula: '$C$30', result: TRANSPORT }, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });

    R(31, 'LBT', 0, { numFmt: '0.00', height: 15.6 });

    const grossRmRate = rmRateTotal + gstAmt + 0 + TRANSPORT + 0;
    R(32, 'Gross Raw Material Rate', { formula: 'D25+D27+D29+D30+D31', result: grossRmRate }, { numFmt: '0.00', height: 15.6 });

    const gstSetoff = -gstAmt;
    R(33, 'GST Set off', { formula: '-D27', result: gstSetoff }, { numFmt: '0.00', height: 15.6 });
    BLANK(34, 15.6);

    const netRmRate = grossRmRate + gstSetoff;
    R(35, 'Net Raw Material Rate', { formula: 'SUM(D32:D34)', result: netRmRate }, { numFmt: '0.00', height: 15.6 });
    BLANK(36, 15.6);

    R(37, 'BDN qty in kg', 0, { numFmt: '0.00' });
    // D37/D18 — if D18=0 would be div/0, default result to 0
    R(38, 'Qty to be produced', { formula: 'D37/D18', result: grossWtInclRejn > 0 ? 0 / grossWtInclRejn : 0 }, { numFmt: '0' });
    BLANK(39, 15.6);

    // ── Row 40: Scrap Rate ────────────────────────────────────────────
    const scrapRateVal = item.scrap_rate_per_kg || 0;
    ws.getRow(40).height = 14.4;
    SC('A40', { value: 'SCRAP RATE. ( Rs./Kg.)', border: THIN_BORDER, align: leftAlign() });
    SC('B40', { border: THIN_BORDER });
    SC('C40', { value: scrapRateVal, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });
    SC('D40', { value: { formula: '$C$40', result: scrapRateVal }, fill: YELLOW_FILL, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });

    // ── Row 41: Effective scrap rate ──────────────────────────────────
    const effScrapRate = scrapRateVal * SCRAP_REAL_PCT;
    ws.getRow(41).height = 15.6;
    SC('A41', { value: 'Effective scrap rate', border: THIN_BORDER, align: leftAlign() });
    SC('B41', { border: THIN_BORDER });
    SC('C41', { value: SCRAP_REAL_PCT, bold: true, numFmt: '0%', border: THIN_BORDER, align: centerAlign(false) });
    SC('D41', { value: { formula: 'D40*$C$41', result: effScrapRate }, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });

    BLANK(42);

    const grossRmCost = netRmRate * grossWtInclRejn;
    R(43, 'Gross RM Cost',          { formula: 'D35*D18', result: grossRmCost },                     { numFmt: '0.000', height: 15.6 });
    const scrapRecovery = effScrapRate * scrapActual;
    R(44, 'Scrap recovery',         { formula: 'D41*D23', result: scrapRecovery },                   { numFmt: '0.000', height: 15.6 });
    const netRmCost = grossRmCost - scrapRecovery;
    R(45, 'NET RM COST /PC. ( Rs.)',{ formula: 'D43-D44', result: netRmCost },                       { numFmt: '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)' });
    BLANK(46);

    // ── ICC rows ──────────────────────────────────────────────────────
    R(47, 'ICC Calculation', '', { labelBold: true, height: 15.6 });

    const iccRows = [
      { r: 48, label: 'Credit on input material', value: ICC_INPUT_DAYS   },
      { r: 49, label: 'WIP / FG Inventory',        value: ICC_WIP_DAYS    },
      { r: 50, label: 'Crdit given to customer',   value: ICC_CREDIT_DAYS },
    ];
    for (const ir of iccRows) {
      ws.getRow(ir.r).height = 15.6;
      SC(`A${ir.r}`, { value: ir.label, border: THIN_BORDER, align: leftAlign() });
      SC(`B${ir.r}`, { border: THIN_BORDER });
      SC(`C${ir.r}`, { value: 'Days', bold: true, border: THIN_BORDER, align: centerAlign(false) });
      SC(`D${ir.r}`, { value: ir.value, numFmt: '0', border: THIN_BORDER, align: centerAlign(false) });
    }
    const netIccDays = ICC_INPUT_DAYS + ICC_WIP_DAYS + ICC_CREDIT_DAYS;
    ws.getRow(51).height = 15.6;
    SC('A51', { value: 'Net period for ICC', border: THIN_BORDER, align: leftAlign() });
    SC('B51', { border: THIN_BORDER });
    SC('C51', { value: 'Days', bold: true, border: THIN_BORDER, align: centerAlign(false) });
    SC('D51', { value: { formula: 'SUM(D48:D50)', result: netIccDays }, numFmt: '0', border: THIN_BORDER, align: centerAlign(false) });

    // ── Row 52: Cost of capital ───────────────────────────────────────
    ws.getRow(52).height = 15.6;
    SC('A52', { value: 'Cost of capital', border: THIN_BORDER, align: leftAlign() });
    SC('B52', { value: COST_OF_CAPITAL, numFmt: '0.00%', border: THIN_BORDER, align: centerAlign(false) });
    SC('C52', { border: THIN_BORDER });
    SC('D52', { value: { formula: '$B52', result: COST_OF_CAPITAL }, numFmt: '0.0%', border: THIN_BORDER, align: centerAlign(false) });

    const iccPct    = COST_OF_CAPITAL / 365 * netIccDays;
    R(53, 'ICC %',      { formula: 'D52/365*D51', result: iccPct    }, { numFmt: '0.00%', height: 15.6 });
    const iccAmount = netRmCost * iccPct;
    R(54, 'ICC amount', { formula: 'D45*D53',     result: iccAmount }, { numFmt: '0.00', height: 15.6 });

    // ── Row 55: OHP on Material ───────────────────────────────────────
    ws.getRow(55).height = 15.6;
    SC('A55', { value: 'OHP % on MATL', border: THIN_BORDER, align: leftAlign() });
    SC('B55', { value: OHP_MATL, numFmt: '0.00%', border: THIN_BORDER, align: centerAlign(false) });
    SC('C55', { border: THIN_BORDER });
    const ohpMatlPct = OHP_MATL / 365 * netIccDays;
    SC('D55', { value: ohpMatlPct, numFmt: '0.00%', border: THIN_BORDER, align: centerAlign(false) });

    const ohpMatlAmt = netRmCost * ohpMatlPct;
    R(56, '', { formula: 'D45*D55', result: ohpMatlAmt }, { numFmt: '0.00', height: 15.6 });

    // ── Row 57: Net Material Cost ─────────────────────────────────────
    const netMatlCost = iccAmount + netRmCost + ohpMatlAmt;
    ws.getRow(57).height = 18;
    SC('A57', { value: 'Net MATL cost', bold: true, border: THIN_BORDER, align: leftAlign() });
    SC('B57', { border: THIN_BORDER });
    SC('C57', { border: THIN_BORDER });
    SC('D57', { value: { formula: 'D54+D45+D56', result: netMatlCost }, bold: true, fill: YELLOW_FILL, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });

    ws.getRow(58).height = 15.6;
    ws.getCell('E58').value = 'Tolling Cost';

    // ── Dynamic process rows (start at row 59) ────────────────────────
    // FIX: Write process costs to column D (not column B)
    const processes  = item.processes || [];
    const PROC_START = 59;
    for (let pi = 0; pi < processes.length; pi++) {
      const proc = processes[pi];
      const rr   = PROC_START + pi;
      ws.getRow(rr).height = 15.6;
      SC(`A${rr}`, { value: proc.process_name || '', border: THIN_BORDER, align: leftAlign() });
      SC(`B${rr}`, { border: THIN_BORDER });
      SC(`C${rr}`, { border: THIN_BORDER });
      SC(`D${rr}`, { value: proc.calculated_cost || 0, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });
    }

    // ── Tail rows (dynamic row numbers) ──────────────────────────────
    let T = PROC_START + processes.length;
    const procFirst   = `D${PROC_START}`;
    const procLast    = `D${PROC_START + Math.max(processes.length - 1, 0)}`;
    const totalMfgVal = processes.reduce((s, p) => s + (p.calculated_cost || 0), 0);

    ws.getRow(T).height = 18;
    SC(`A${T}`, { value: 'Total Mfg Cost', bold: true, border: THIN_BORDER, align: leftAlign() });
    SC(`B${T}`, { border: THIN_BORDER });
    SC(`C${T}`, { border: THIN_BORDER });
    SC(`D${T}`, { value: processes.length > 0 ? { formula: `SUM(${procFirst}:${procLast})`, result: totalMfgVal } : 0, bold: true, numFmt: '0.000', border: THIN_BORDER, align: centerAlign(false) });
    const rowTotalMfg = T; T++;

    // Rejection on Labour
    const rejnAmt = RM_REJECTION_PCT * totalMfgVal;
    ws.getRow(T).height = 15.6;
    SC(`A${T}`, { value: 'Rejection on Labour', border: THIN_BORDER, align: leftAlign() });
    SC(`B${T}`, { border: THIN_BORDER });
    SC(`C${T}`, { value: { formula: 'C17', result: RM_REJECTION_PCT }, bold: true, numFmt: '0.0%', border: THIN_BORDER, align: centerAlign(false) });
    SC(`D${T}`, { value: { formula: `$C$${T}*D${rowTotalMfg}`, result: rejnAmt }, numFmt: '0.000', border: THIN_BORDER, align: centerAlign(false) });
    T++;

    // OHP on Labour
    const ohpLabourAmt = OHP_LABOUR * totalMfgVal;
    ws.getRow(T).height = 15.6;
    SC(`A${T}`, { value: 'OHP on Labour', bold: true, border: THIN_BORDER, align: leftAlign() });
    SC(`B${T}`, { border: THIN_BORDER });
    SC(`C${T}`, { value: OHP_LABOUR, bold: true, numFmt: '0%', border: THIN_BORDER, align: centerAlign(false) });
    SC(`D${T}`, { value: { formula: `D${rowTotalMfg}*$C$${T}`, result: ohpLabourAmt }, numFmt: '0.000', border: THIN_BORDER, align: centerAlign(false) });
    T++;

    // Inspection
    SC(`A${T}`, { value: 'INSPECTION',    border: THIN_BORDER, align: leftAlign() });
    SC(`B${T}`, { border: THIN_BORDER }); SC(`C${T}`, { border: THIN_BORDER });
    SC(`D${T}`, { value: INSPECTION, numFmt: '0.000', border: THIN_BORDER, align: centerAlign(false) }); T++;

    // Tool maintenance
    SC(`A${T}`, { value: 'TOOL MAINTANANCE', border: THIN_BORDER, align: leftAlign() });
    SC(`B${T}`, { border: THIN_BORDER }); SC(`C${T}`, { border: THIN_BORDER });
    SC(`D${T}`, { value: TOOL_MAINTENANCE, numFmt: '0.000', border: THIN_BORDER, align: centerAlign(false) }); T++;

    // Packing
    const packingAmt = PACKING_PER_NOS * (item.net_weight_kg || 0);
    SC(`A${T}`, { value: 'PACKING/FORWARDING CHARGES', border: THIN_BORDER, align: leftAlign() });
    SC(`B${T}`, { border: THIN_BORDER });
    SC(`C${T}`, { value: PACKING_PER_NOS, bold: true, border: THIN_BORDER, align: centerAlign(false) });
    SC(`D${T}`, { value: { formula: `$C$${T}*D20`, result: packingAmt }, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });
    const rowPacking = T; T++;

    // Sub-Total
    const subTotalMfg = totalMfgVal + rejnAmt + ohpLabourAmt + INSPECTION + TOOL_MAINTENANCE + packingAmt;
    SC(`A${T}`, { value: 'Sub-Total', bold: true, border: THIN_BORDER, align: leftAlign() });
    SC(`B${T}`, { border: THIN_BORDER }); SC(`C${T}`, { border: THIN_BORDER });
    SC(`D${T}`, { value: { formula: `SUM(D${rowTotalMfg}:D${rowPacking})`, result: subTotalMfg }, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });
    const rowSubTotal = T; T++;

    // Plating Cost Rs/Kg
    SC(`A${T}`, { value: 'Plating Cost Rs /Kg', border: THIN_BORDER, align: leftAlign() });
    SC(`B${T}`, { border: THIN_BORDER });
    SC(`C${T}`, { value: PLATING_PER_KG, bold: true, border: THIN_BORDER, align: centerAlign(false) });
    SC(`D${T}`, { value: { formula: 'D20', result: item.net_weight_kg || 0 }, numFmt: '0.000', border: THIN_BORDER, align: centerAlign(false) });
    const rowPlatingKg = T; T++;

    // Plating Cost Amount
    const platingAmt = (item.net_weight_kg || 0) * PLATING_PER_KG;
    SC(`A${T}`, { value: 'Plating Cost Amount', border: THIN_BORDER, align: leftAlign() });
    SC(`B${T}`, { border: THIN_BORDER }); SC(`C${T}`, { border: THIN_BORDER });
    SC(`D${T}`, { value: { formula: `D${rowPlatingKg}*$C$${rowPlatingKg}`, result: platingAmt }, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });
    const rowPlatingAmt = T; T++;

    // Total Rate
    const totalRate = platingAmt + subTotalMfg + netMatlCost;
    SC(`A${T}`, { value: 'Total Rate (Rs/Ea)', bold: true, border: THIN_BORDER, align: leftAlign() });
    SC(`B${T}`, { border: THIN_BORDER }); SC(`C${T}`, { border: THIN_BORDER });
    SC(`D${T}`, { value: { formula: `D${rowPlatingAmt}+D${rowSubTotal}+D57`, result: totalRate }, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });
    const rowTotalRate = T; T++;

    // Final PO Rate
    SC(`A${T}`, { value: 'Final Po Rate', bold: true, border: THIN_BORDER, align: leftAlign() });
    SC(`B${T}`, { border: THIN_BORDER }); SC(`C${T}`, { border: THIN_BORDER });
    SC(`D${T}`, { value: { formula: `ROUND(D${rowTotalRate},2)`, result: Math.round(totalRate * 100) / 100 }, bold: true, numFmt: '0.00', border: THIN_BORDER, align: centerAlign(false) });
  }

  return workbook;
}


// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE 3 ── COST BREAKUP  (Suyash Enterprises style — vertical per item)
//
// Layout (5 columns: A B C D E):
//   Row 1  : Company name (merged A:E)
//   Row 2  : 'COST BREAK UP SHEET' (merged A:D)  |  Date (E)
//   Row 3  : blank
//   Row 4  : 'PART NO' | PartNo | Supplier | blank | blank
//   Row 5  : 'PART DESCRIPTION' | PartName | VendorCode | blank | blank
//   Row 6  : blank x4 | 'RS'
//   Row 7  : 'RAW MATERIAL COST:-' | blank | first process name | blank | RM cost (E)
//   Row 8  : 'PROCESSING COST :-' (merged A:D)
//   Row 9  : headers: OPERATION DESC | OPERATION | MACHINE | COST PER PIECE | AMOUNT
//   Row 10+: one row per process:  blank | process_name | machine | rate | calculated_cost
//   Row T  : blank | blank | blank | 'TOTAL' | SUM(process costs)
//   Row T+1: 'TOTAL' (merged A:D) | SUM(RM + process total)
//   Row T+2: 'OVERHEADS & PROFIT' | blank | OH% | blank | OH amount
//   Row T+3: 'COST PER PIECE' (merged A:D) | Final cost
// ═══════════════════════════════════════════════════════════════════════════════
function generateCostBreakupExcel(workbook, quotationData, template) {

  // Column widths matching original
  const COL_WIDTHS = { 1: 28, 2: 22, 3: 20, 4: 14, 5: 16 };

  // Overhead % — from quotation-level or item OverheadPercent, fallback 10%
  const DEFAULT_OHP_PCT = (template.default_margin_percent || 10) / 100;

  // Fills
  const TITLE_FILL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }; // dark navy
  const HEADER_FILL2 = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6DCE4' } }; // light grey
  const RM_FILL      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } }; // yellow
  const PROC_FILL    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } }; // light green
  const TOTAL_FILL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } }; // light orange
  const FINAL_FILL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } }; // green

  const MEDIUM_ALL = {
    top:    { style: 'medium' }, bottom: { style: 'medium' },
    left:   { style: 'medium' }, right:  { style: 'medium' },
  };
  const THIN_ALL = {
    top:    { style: 'thin' }, bottom: { style: 'thin' },
    left:   { style: 'thin' }, right:  { style: 'thin' },
  };

  for (const item of quotationData.Items) {

    const wsName = (item.PartNo || 'Item').replace(/[/\\?*[\]:]/g, '-').slice(0, 31);
    const ws     = workbook.addWorksheet(wsName);

    // Column widths
    for (let c = 1; c <= 5; c++) ws.getColumn(c).width = COL_WIDTHS[c] || 12;

    const SC = (ref, opts = {}) => styleCell(ws.getCell(ref), opts);
    const mergeRow = (r, c1, c2, opts = {}) => {
      ws.mergeCells(r, c1, r, c2);
      styleCell(ws.getCell(r, c1), opts);
    };

    // ── Row 1: Company name ────────────────────────────────────────────────
    ws.getRow(1).height = 30;
    ws.mergeCells(1, 1, 1, 5);
    styleCell(ws.getCell(1, 1), {
      value:     quotationData.CompanyName || 'Company Name',
      bold:      true,
      fontSize:  14,
      fill:      TITLE_FILL,
      border:    MEDIUM_ALL,
      align:     { horizontal: 'center', vertical: 'middle' },
    });
    ws.getCell(1, 1).font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };

    // ── Row 2: Title + Date ────────────────────────────────────────────────
    ws.getRow(2).height = 22;
    ws.mergeCells(2, 1, 2, 4);
    styleCell(ws.getCell(2, 1), {
      value:    'COST BREAK UP SHEET',
      bold:     true,
      fontSize: 12,
      fill:     HEADER_FILL2,
      border:   THIN_ALL,
      align:    { horizontal: 'center', vertical: 'middle' },
    });
    const dateStr = quotationData.QuotationDate
      ? new Date(quotationData.QuotationDate).toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' })
      : '';
    SC('E2', { value: `DATE: ${dateStr}`, bold: true, border: THIN_ALL, align: { horizontal: 'center', vertical: 'middle' }, fontSize: 10 });

    // ── Row 3: blank ───────────────────────────────────────────────────────
    ws.getRow(3).height = 6;

    // ── Row 4: Part No ─────────────────────────────────────────────────────
    ws.getRow(4).height = 18;
    SC('A4', { value: 'PART NO',    bold: true, border: THIN_ALL, fill: HEADER_FILL2, align: { horizontal: 'left', vertical: 'middle' }, fontSize: 10 });
    SC('B4', { value: item.PartNo  || '', border: THIN_ALL, align: { horizontal: 'left', vertical: 'middle' }, fontSize: 10 });
    ws.mergeCells(4, 3, 4, 5);
    styleCell(ws.getCell(4, 3), {
      value:  `SUPPLIER:- ${quotationData.VendorName || ''}`,
      bold:   true,
      border: THIN_ALL,
      align:  { horizontal: 'left', vertical: 'middle' },
      fontSize: 10,
    });

    // ── Row 5: Part Description ────────────────────────────────────────────
    ws.getRow(5).height = 18;
    SC('A5', { value: 'PART  DESCRIPTION', bold: true, border: THIN_ALL, fill: HEADER_FILL2, align: { horizontal: 'left', vertical: 'middle' }, fontSize: 10 });
    SC('B5', { value: item.PartName || '', border: THIN_ALL, align: { horizontal: 'left', vertical: 'middle' }, fontSize: 10 });
    ws.mergeCells(5, 3, 5, 5);
    styleCell(ws.getCell(5, 3), {
      value:  `VENDOR CODE:- ${quotationData.VendorGSTIN || ''}`,
      bold:   true,
      border: THIN_ALL,
      align:  { horizontal: 'left', vertical: 'middle' },
      fontSize: 10,
    });

    // ── Row 6: Currency header ─────────────────────────────────────────────
    ws.getRow(6).height = 15;
    ['A6','B6','C6','D6'].forEach(ref => SC(ref, { border: THIN_ALL }));
    SC('E6', { value: 'RS', bold: true, border: THIN_ALL, fill: HEADER_FILL2, align: { horizontal: 'center', vertical: 'middle' }, fontSize: 10 });

    // ── Row 7: RM Cost row ─────────────────────────────────────────────────
    // C7 = first process name from the processes list
    // In the XLS: Row 7 C = "LASER CUTTING" = the RM cutting process
    //             Row 10 B = "Proto Tolling"  = the manufacturing operation
    // In your quotation: processes[0] = "Laser Cutting" = the RM cutting method ✅
    // item.rm_type = "Strip" = the FORM of RM (Strip/Sheet/Rod) — NOT shown here
    ws.getRow(7).height = 18;
    SC('A7', { value: 'RAW MATERIAL COST:-', bold: true, border: THIN_ALL, fill: RM_FILL, align: { horizontal: 'left', vertical: 'middle' }, fontSize: 10 });
    SC('B7', { border: THIN_ALL });
    const rmCuttingProcess = (item.processes && item.processes.length > 0)
      ? (item.processes[0].process_name || '')
      : '';
    SC('C7', { value: rmCuttingProcess, border: THIN_ALL, align: { horizontal: 'left', vertical: 'middle' }, fontSize: 10 });
    SC('D7', { border: THIN_ALL });
    SC('E7', {
      value:   item.net_rm_cost || 0,
      numFmt:  '#,##0.00',
      bold:    true,
      fill:    RM_FILL,
      border:  THIN_ALL,
      align:   { horizontal: 'right', vertical: 'middle' },
      fontSize: 10,
    });
    const rowRmCost = 7;

    // ── Row 8: Processing Cost header ─────────────────────────────────────
    ws.getRow(8).height = 18;
    ws.mergeCells(8, 1, 8, 5);
    styleCell(ws.getCell(8, 1), {
      value:    'PROCESSING COST :-',
      bold:     true,
      fill:     PROC_FILL,
      border:   THIN_ALL,
      align:    { horizontal: 'left', vertical: 'middle' },
      fontSize: 10,
    });

    // ── Row 9: Process table headers ───────────────────────────────────────
    ws.getRow(9).height = 20;
    const procHeaders = ['OPERATION DESCRIPTION', 'OPERATION', 'MACHINE', 'COST PER PIECE', 'AMOUNT'];
    procHeaders.forEach((h, i) => {
      styleCell(ws.getCell(9, i + 1), {
        value:    h,
        bold:     true,
        fill:     HEADER_FILL2,
        border:   THIN_ALL,
        align:    { horizontal: 'center', vertical: 'middle', wrapText: true },
        fontSize: 9,
      });
    });

    // ── Rows 10+: Process rows ─────────────────────────────────────────────
    const processes  = item.processes || [];
    const PROC_START = 10;

    for (let pi = 0; pi < processes.length; pi++) {
      const proc = processes[pi];
      const rr   = PROC_START + pi;
      ws.getRow(rr).height = 16;
      SC(`A${rr}`, { border: THIN_ALL });
      SC(`B${rr}`, { value: proc.process_name || '', border: THIN_ALL, align: { horizontal: 'left', vertical: 'middle' }, fontSize: 10 });
      SC(`C${rr}`, { value: proc.machine || '', border: THIN_ALL, align: { horizontal: 'center', vertical: 'middle' }, fontSize: 10 });
      SC(`D${rr}`, { value: proc.rate_used || 0, numFmt: '#,##0.00', border: THIN_ALL, align: { horizontal: 'right', vertical: 'middle' }, fontSize: 10 });
      SC(`E${rr}`, { value: proc.calculated_cost || 0, numFmt: '#,##0.00', border: THIN_ALL, align: { horizontal: 'right', vertical: 'middle' }, fontSize: 10 });
    }

    // If no processes, add one blank row
    if (processes.length === 0) {
      ws.getRow(10).height = 16;
      ['A10','B10','C10','D10','E10'].forEach(ref => SC(ref, { border: THIN_ALL }));
    }

    // ── Dynamic tail rows ──────────────────────────────────────────────────
    let T = PROC_START + Math.max(processes.length, 1);

    // Blank separator row
    ws.getRow(T).height = 8;
    ['A','B','C','D','E'].forEach(col => SC(`${col}${T}`, { border: THIN_ALL }));
    T++;

    // Process TOTAL row
    const procTotal = processes.reduce((s, p) => s + (p.calculated_cost || 0), 0);
    const procFirst = PROC_START;
    const procLast  = PROC_START + Math.max(processes.length - 1, 0);
    ws.getRow(T).height = 18;
    ['A','B','C'].forEach(col => SC(`${col}${T}`, { border: THIN_ALL }));
    SC(`D${T}`, { value: 'TOTAL', bold: true, fill: TOTAL_FILL, border: THIN_ALL, align: { horizontal: 'center', vertical: 'middle' }, fontSize: 10 });
    SC(`E${T}`, {
      value:   processes.length > 0
        ? { formula: `SUM(E${procFirst}:E${procLast})`, result: procTotal }
        : 0,
      numFmt:  '#,##0.00',
      bold:    true,
      fill:    TOTAL_FILL,
      border:  THIN_ALL,
      align:   { horizontal: 'right', vertical: 'middle' },
      fontSize: 10,
    });
    const rowProcTotal = T; T++;

    // Grand TOTAL row (RM + Process)
    const grandTotal = (item.net_rm_cost || 0) + procTotal;
    ws.getRow(T).height = 20;
    ws.mergeCells(T, 1, T, 4);
    styleCell(ws.getCell(T, 1), {
      value:    'TOTAL ',
      bold:     true,
      fill:     TOTAL_FILL,
      border:   MEDIUM_ALL,
      align:    { horizontal: 'left', vertical: 'middle' },
      fontSize: 10,
    });
    SC(`E${T}`, {
      value:   { formula: `E${rowRmCost}+E${rowProcTotal}`, result: grandTotal },
      numFmt:  '#,##0.00',
      bold:    true,
      fill:    TOTAL_FILL,
      border:  MEDIUM_ALL,
      align:   { horizontal: 'right', vertical: 'middle' },
      fontSize: 10,
    });
    const rowGrandTotal = T; T++;

    // OVERHEADS & PROFIT row
    // ⚠️  item.OverheadPercent is stored as PLAIN NUMBER (e.g. 10 = 10%)
    //     Divide by 100 once → decimal for Excel. DEFAULT_OHP_PCT is already decimal.
    const ohpRaw     = item.OverheadPercent ? item.OverheadPercent / 100 : DEFAULT_OHP_PCT;
    const ohpDecimal = ohpRaw > 1 ? ohpRaw / 100 : ohpRaw;  // safety guard against double-fraction
    const ohpAmt     = grandTotal * ohpDecimal;
    ws.getRow(T).height = 18;
    SC(`A${T}`, { value: 'OVERHEADS & PROFIT', bold: true, border: THIN_ALL, fill: HEADER_FILL2, align: { horizontal: 'left', vertical: 'middle' }, fontSize: 10 });
    SC(`B${T}`, { border: THIN_ALL });
    SC(`C${T}`, {
      value:   ohpDecimal,
      numFmt:  '0%',
      bold:    true,
      border:  THIN_ALL,
      align:   { horizontal: 'center', vertical: 'middle' },
      fontSize: 10,
    });
    SC(`D${T}`, { border: THIN_ALL });
    SC(`E${T}`, {
      value:   { formula: `E${rowGrandTotal}*C${T}`, result: ohpAmt },
      numFmt:  '#,##0.00',
      border:  THIN_ALL,
      align:   { horizontal: 'right', vertical: 'middle' },
      fontSize: 10,
    });
    const rowOhp = T; T++;

    // COST PER PIECE row
    const finalCost = grandTotal + ohpAmt;
    ws.getRow(T).height = 22;
    ws.mergeCells(T, 1, T, 4);
    styleCell(ws.getCell(T, 1), {
      value:    'COST PER PIECE',
      bold:     true,
      fontSize: 11,
      fill:     FINAL_FILL,
      border:   MEDIUM_ALL,
      align:    { horizontal: 'left', vertical: 'middle' },
    });
    ws.getCell(T, 1).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    SC(`E${T}`, {
      value:   { formula: `E${rowGrandTotal}+E${rowOhp}`, result: finalCost },
      numFmt:  '#,##0.00',
      bold:    true,
      fill:    FINAL_FILL,
      border:  MEDIUM_ALL,
      align:   { horizontal: 'right', vertical: 'middle' },
      fontSize: 11,
    });
    ws.getCell(`E${T}`).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };

    // Print area
    ws.pageSetup = {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    };
  }

  return workbook;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════════
function generateQuotationExcel(workbook, quotationData, template) {
  switch (template.formula_engine || 'busbar') {
    case 'busbar':       generateBusbarExcel(workbook, quotationData, template);      break;
    case 'landed_cost':  generateLandedCostExcel(workbook, quotationData, template);  break;
    case 'cost_breakup': generateCostBreakupExcel(workbook, quotationData, template); break;
    default:             generateBusbarExcel(workbook, quotationData, template);
  }
  return workbook;
}

module.exports = { generateQuotationExcel, generateBusbarExcel, generateLandedCostExcel, generateCostBreakupExcel };
