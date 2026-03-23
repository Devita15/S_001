'use strict';
/**
 * FEASIBILITY CHECK CONTROLLER
 *
 * Exports TWO things:
 *
 *   1. runFeasibilityCheck(lead)
 *      Pure async function — takes a lean lead object, returns result object.
 *      Called directly by leadController (no HTTP involved, no circular require).
 *
 *   2. autoFeasibilityCheck(req, res)
 *      Express route handler for GET /api/leads/:id/feasibility-check.
 *      Fetches the lead itself, then calls runFeasibilityCheck internally.
 *
 * Checks per enquired item:
 *   1. Item Master       — does part_no already exist?
 *   2. RawMaterial Master — is rm_grade registered + current rate?
 *   3. DimensionWeight   — T×W×L record exists for weight calculation?
 *   4. Process Master    — active processes available?
 *   5. StockLedger       — is RM of this grade already in stock?
 *
 * Check status values: 'pass' | 'fail' | 'conditional' | 'skip'
 *   pass        = data found, no issues
 *   fail        = data missing, blocks feasibility
 *   conditional = partial data, human review needed
 *   skip        = not enough info on enquiry to run this check
 */

const { Lead }          = require('../../models/CRM/Lead');
const Item              = require('../../models/CRM/Item');
const RawMaterial       = require('../../models/CRM/RawMaterial');
const DimensionWeight   = require('../../models/CRM/DimensionWeight');
const Process           = require('../../models/CRM/Process');
const StockLedger       = require('../../models/CRM/Stockledger');

const err404 = (res) => res.status(404).json({ success: false, message: 'Lead not found' });
const err500 = (res, e) => res.status(500).json({ success: false, message: e.message });


// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPER — run all 5 checks for one enquired item
// ─────────────────────────────────────────────────────────────────────────────
async function checkOneItem(enquiredItem) {
  const {
    part_no,
    description,
    material_grade,
    drawing_ref_no,
    quantity,
    unit,
  } = enquiredItem;

  const result = {
    description,
    part_no:        part_no      || null,
    material_grade: material_grade || null,
    quantity,
    unit,
    drawing_ref_no: drawing_ref_no || null,

    item_exists:     { status: 'skip', note: 'No part_no provided — skipped' },
    material_check:  { status: 'skip', note: 'No material_grade provided — skipped' },
    dimension_check: { status: 'skip', note: 'No part_no provided — skipped' },
    process_check:   { status: 'skip', note: 'No process lookup at this stage' },
    stock_check:     { status: 'skip', note: 'No material_grade provided — skipped' },
  };

  // ── Check 1: Item Master ──────────────────────────────────────────────────
  let existingItem = null;
  if (part_no && part_no.trim() !== '') {
    existingItem = await Item.findOne({
      part_no:   part_no.trim().toUpperCase(),
      is_active: true,
    }).select('part_no part_description rm_grade density item_type').lean();

    if (existingItem) {
      result.item_exists = {
        status: 'pass',
        note: `Part ${existingItem.part_no} found — ${existingItem.part_description}`,
        data: {
          item_id:          existingItem._id,
          part_description: existingItem.part_description,
          rm_grade:         existingItem.rm_grade,
          item_type:        existingItem.item_type,
        },
      };
    } else {
      result.item_exists = {
        status: 'conditional',
        note: `Part ${part_no.trim().toUpperCase()} not in Item Master — new item will need to be created`,
      };
    }
  }

  // ── Check 2: Raw Material Master ─────────────────────────────────────────
  // Use material_grade from enquiry, fallback to Item Master rm_grade if item exists
  const gradeToCheck = material_grade?.trim() || existingItem?.rm_grade?.trim() || null;

  if (gradeToCheck) {
    const rmRecord = await RawMaterial.findOne({
      Grade:    { $regex: new RegExp(`^${gradeToCheck}$`, 'i') },
      IsActive: true,
    })
      .sort({ DateEffective: -1 })
      .select('MaterialName Grade RatePerKG EffectiveRate total_rm_rate DateEffective')
      .lean();

    if (rmRecord) {
      result.material_check = {
        status: 'pass',
        note: `${rmRecord.Grade} found — Rate: ₹${rmRecord.RatePerKG}/kg, Effective: ₹${rmRecord.EffectiveRate}/kg`,
        data: {
          rm_id:          rmRecord._id,
          material_name:  rmRecord.MaterialName,
          grade:          rmRecord.Grade,
          rate_per_kg:    rmRecord.RatePerKG,
          effective_rate: rmRecord.EffectiveRate,
          total_rm_rate:  rmRecord.total_rm_rate,
          date_effective: rmRecord.DateEffective,
        },
      };
    } else {
      result.material_check = {
        status: 'fail',
        note: `Grade "${gradeToCheck}" not found in RawMaterial Master — rate unknown, cannot cost`,
      };
    }
  }

  // ── Check 3: Dimension Weight Master ─────────────────────────────────────
  const partForDim = part_no?.trim()?.toUpperCase() || null;
  if (partForDim) {
    const dimRecord = await DimensionWeight.findOne({ PartNo: partForDim })
      .select('PartNo Thickness Width Length Density WeightInKG')
      .lean();

    if (dimRecord) {
      result.dimension_check = {
        status: 'pass',
        note: `T:${dimRecord.Thickness}mm × W:${dimRecord.Width}mm × L:${dimRecord.Length}mm = ${dimRecord.WeightInKG}kg`,
        data: {
          thickness: dimRecord.Thickness,
          width:     dimRecord.Width,
          length:    dimRecord.Length,
          density:   dimRecord.Density,
          weight_kg: dimRecord.WeightInKG,
        },
      };
    } else {
      result.dimension_check = {
        status: 'conditional',
        note: `No DimensionWeight record for ${partForDim} — dimensions must be entered manually for costing`,
      };
    }
  }

  // ── Check 4: Process Master ───────────────────────────────────────────────
  const activeProcessCount = await Process.countDocuments({ is_active: true });
  if (activeProcessCount > 0) {
    result.process_check = {
      status: 'pass',
      note:   `${activeProcessCount} active processes available in Process Master`,
      data:   { active_process_count: activeProcessCount },
    };
  } else {
    result.process_check = {
      status: 'fail',
      note:   'No active processes in Process Master — Process Master may not be set up',
    };
  }

  // ── Check 5: Stock Ledger ─────────────────────────────────────────────────
  if (gradeToCheck) {
    const itemsWithGrade = await Item.find({
      rm_grade:  { $regex: new RegExp(`^${gradeToCheck}$`, 'i') },
      is_active: true,
    }).select('_id part_no').lean();

    if (itemsWithGrade.length > 0) {
      const itemIds = itemsWithGrade.map(i => i._id);
      const stockRecords = await StockLedger.find({
        item_id:       { $in: itemIds },
        available_qty: { $gt: 0 },
      }).select('item_id part_no available_qty unit warehouse_id').lean();

      if (stockRecords.length > 0) {
        const totalAvailable = stockRecords.reduce((sum, s) => sum + s.available_qty, 0);
        result.stock_check = {
          status: 'pass',
          note:   `${totalAvailable} units of ${gradeToCheck} grade material in stock across ${stockRecords.length} record(s)`,
          data: {
            total_available: totalAvailable,
            stock_records: stockRecords.map(s => ({
              part_no:       s.part_no,
              available_qty: s.available_qty,
              unit:          s.unit,
            })),
          },
        };
      } else {
        result.stock_check = {
          status: 'conditional',
          note:   `No current stock of ${gradeToCheck} grade material — will need to procure`,
        };
      }
    } else {
      result.stock_check = {
        status: 'conditional',
        note:   `No items with grade ${gradeToCheck} in Item Master yet — stock status unknown`,
      };
    }
  }

  // ── Compute per-item verdict ──────────────────────────────────────────────
  const statuses = [
    result.item_exists.status,
    result.material_check.status,
    result.dimension_check.status,
    result.process_check.status,
    result.stock_check.status,
  ];

  if (statuses.includes('fail')) {
    result.is_feasible          = false;
    result.feasibility_verdict  = 'Not Feasible';
  } else if (statuses.includes('conditional')) {
    result.is_feasible          = true;
    result.feasibility_verdict  = 'Conditionally Feasible';
  } else {
    result.is_feasible          = true;
    result.feasibility_verdict  = 'Feasible';
  }

  return result;
}


// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED PURE FUNCTION
// Called directly from leadController — no HTTP, no circular require.
//
//   const result = await runFeasibilityCheck(lead);
//
// @param  {Object} lead  — lean lead document (must have enquired_items[])
// @return {Object}       — full result object ready to send to client
// ─────────────────────────────────────────────────────────────────────────────
async function runFeasibilityCheck(lead) {
  const itemResults = await Promise.all(
    lead.enquired_items.map(item => checkOneItem(item))
  );

  const overallFeasible = itemResults.every(r => r.is_feasible !== false);
  const hasConditional  = itemResults.some(r => r.feasibility_verdict === 'Conditionally Feasible');

  let overall_verdict = 'Feasible';
  if (!overallFeasible)    overall_verdict = 'Not Feasible';
  else if (hasConditional) overall_verdict = 'Conditionally Feasible';

  return {
    lead_id:          lead.lead_id,
    subject:          lead.subject,
    company_name:     lead.company_name,
    overall_feasible: overallFeasible,
    overall_verdict,
    summary: {
      total_items:            itemResults.length,
      feasible_items:         itemResults.filter(r => r.feasibility_verdict === 'Feasible').length,
      conditionally_feasible: itemResults.filter(r => r.feasibility_verdict === 'Conditionally Feasible').length,
      not_feasible_items:     itemResults.filter(r => r.feasibility_verdict === 'Not Feasible').length,
    },
    items:      itemResults,
    checked_at: new Date(),
    note: 'System auto-check. Use POST /api/leads/:id/feasibility to confirm or override with production notes.',
  };
}

exports.runFeasibilityCheck = runFeasibilityCheck;


// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED EXPRESS HANDLER
// GET /api/leads/:id/feasibility-check
// Fetches the lead, calls runFeasibilityCheck, sends response.
// ─────────────────────────────────────────────────────────────────────────────
exports.autoFeasibilityCheck = async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, is_active: true })
      .select('lead_id subject company_name enquired_items')
      .lean();

    if (!lead) return err404(res);

    if (!lead.enquired_items || lead.enquired_items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No enquired items on this lead — add items before running feasibility check',
      });
    }

    const result = await runFeasibilityCheck(lead);

    res.json({ success: true, data: result });
  } catch (e) {
    err500(res, e);
  }
};