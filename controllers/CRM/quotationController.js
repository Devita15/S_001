'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// quotationController.js
//
// Handles:
//   GET  /quotations          → getQuotations   (list + pagination + stats)
//   GET  /quotations/:id      → getQuotation    (single with processes)
//   POST /quotations          → createQuotation (full costing + Excel stream)
//
// REQUEST BODY FORMAT (POST /quotations):
// {
//   "vendor": {
//     "type": "Existing",           // "Existing" | "New"
//     "id":   "<mongoId>",          // required when type = "Existing"
//     "new":  { ... }               // required when type = "New"
//   },
//   "template_id": "<mongoId>",
//   "valid_till":  "2026-04-30",
//   "remarks": {
//     "internal": "...",
//     "customer": "..."
//   },
//   "financials": {
//     "gst_percentage": 18
//   },
//   "icc": {
//     "credit_on_input_days":   -30,   // D48 Landed Cost
//     "wip_fg_days":             30,   // D49
//     "credit_to_customer_days": 45,   // D50
//     "cost_of_capital":         0.10  // B52 — FRACTION (0.10 = 10%)
//   },
//   "items": [
//     {
//       "part_no":  "BR-009",
//       "quantity": 100,
//       "costing_parameters": {
//         "ohp_percent_on_material":       0.10,  // FRACTION → stored as 10 (plain %)
//         "ohp_percent_on_labour":         0.15,  // FRACTION → C63 Landed Cost
//         "inspection_cost_per_nos":       0.20,  // Rs/piece → D64
//         "tool_maintenance_cost_per_nos": 0.20,  // Rs/piece → D65
//         "packing_cost_per_nos":          5.00,  // Rs/piece → C66
//         "plating_cost_per_kg":          70.00,  // Rs/kg    → C68
//         "margin_percent":               15      // plain %  → Busbar Margin col
//       },
//       "processes": [
//         {
//           "process_id":          "<mongoId>",
//           "rate_per_hour":        252.50,       // Rs rate (Per Nos / Per Hour / Per Kg)
//           "hours":                1.5,          // used when rate_type = Per Hour
//           "outsourced_vendor_id": null,         // null = in-house
//           "machine":             "CNC Laser"    // shown in MACHINE col in Cost Breakup
//         }
//       ]
//     }
//   ]
// }
//
// COSTING CALCULATION CHAIN (per item):
//   GrossWeight    = T × W × L × density / 1,000,000          (kg)
//   GrossRMCost    = GrossWeight × (RMRate + ProfileConvRate)
//   NetWeight      = DimensionWeight.WeightInKG
//   ScrapKg        = GrossWeight − NetWeight
//   ScrapCost      = ScrapKg × scrap_rate_per_kg
//   NetRMCost      = GrossRMCost − ScrapCost    ← Cost Breakup Row 7 E
//   ProcessCost    = Σ calculated_cost per process
//   SubCost        = NetRMCost + ProcessCost
//   OverheadAmount = SubCost × OverheadPercent / 100
//   MarginAmount   = SubCost × MarginPercent / 100
//   FinalRate      = SubCost + OverheadAmount + MarginAmount
//   Amount         = Quantity × FinalRate
// ─────────────────────────────────────────────────────────────────────────────

const Quotation            = require('../../models/CRM/Quotation');
const QuotationItemProcess = require('../../models/CRM/QuotationItemProcess');
const Company              = require('../../models/user\'s & setting\'s/Company');
const Vendor               = require('../../models/CRM/Vendor');
const Item                 = require('../../models/CRM/Item');
const RawMaterial          = require('../../models/CRM/RawMaterial');
const Process              = require('../../models/CRM/Process');
const Tax                  = require('../../models/CRM/Tax');
const TermsCondition       = require('../../models/CRM/TermsCondition');
const Template             = require('../../models/CRM/Template');
const DimensionWeight      = require('../../models/CRM/DimensionWeight');
const ExcelJS              = require('exceljs');
const { generateQuotationExcel } = require('../../utils/excelGenerators');


// ─────────────────────────────────────────────────────────────────────────────
// HELPER — extract vendor fields from a vendor document
// ─────────────────────────────────────────────────────────────────────────────
function _vendorFields(vendor) {
  return {
    VendorID:            vendor._id,
    VendorName:          vendor.vendor_name,
    VendorGSTIN:         vendor.gstin          || '',
    VendorState:         vendor.state          || '',
    VendorStateCode:     vendor.state_code     || 0,
    VendorAddress:       vendor.address        || '',
    VendorCity:          vendor.city           || '',
    VendorPincode:       vendor.pincode        || '',
    VendorContactPerson: vendor.contact_person || '',
    VendorPhone:         vendor.phone          || '',
    VendorEmail:         vendor.email          || '',
    VendorPAN:           vendor.pan            || '',
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// GET ALL QUOTATIONS
// GET /quotations
// Query: page, limit, status, vendorId, startDate, endDate,
//        search, templateId, sortBy, sortOrder
// ─────────────────────────────────────────────────────────────────────────────
const getQuotations = async (req, res) => {
  try {
    const {
      page      = 1,
      limit     = 10,
      status,
      vendorId,
      startDate,
      endDate,
      search,
      templateId,
      sortBy    = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // Build MongoDB filter
    const query = { IsActive: true };
    if (status)     query.Status     = status;
    if (vendorId)   query.VendorID   = vendorId;
    if (templateId) query.TemplateID = templateId;
    if (startDate || endDate) {
      query.QuotationDate = {};
      if (startDate) query.QuotationDate.$gte = new Date(startDate);
      if (endDate)   query.QuotationDate.$lte = new Date(endDate);
    }
    if (search) {
      query.$or = [
        { QuotationNo: new RegExp(search, 'i') },
        { VendorName:  new RegExp(search, 'i') },
      ];
    }

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const lim  = parseInt(limit);

    // Run list query, count, and aggregate stats in parallel
    const [quotations, total, stats] = await Promise.all([

      Quotation.find(query)
        .populate('VendorID',   'vendor_name vendor_code gstin')
        .populate('CompanyID',  'company_name gstin')
        .populate('TemplateID', 'template_name template_code')
        .populate('CreatedBy',  'Username Email')
        .sort(sort)
        .skip(skip)
        .limit(lim),

      Quotation.countDocuments(query),

      Quotation.aggregate([
        { $match: { IsActive: true } },
        {
          $group: {
            _id:           null,
            totalQuotations: { $sum: 1 },
            totalAmount:     { $sum: '$GrandTotal' },
            avgAmount:       { $avg: '$GrandTotal' },
            draftCount:      { $sum: { $cond: [{ $eq: ['$Status', 'Draft']    }, 1, 0] } },
            sentCount:       { $sum: { $cond: [{ $eq: ['$Status', 'Sent']     }, 1, 0] } },
            approvedCount:   { $sum: { $cond: [{ $eq: ['$Status', 'Approved'] }, 1, 0] } },
          },
        },
      ]),

    ]);

    return res.json({
      success: true,
      data:    quotations,
      pagination: {
        currentPage:  parseInt(page),
        totalPages:   Math.ceil(total / lim),
        totalItems:   total,
        itemsPerPage: lim,
      },
      statistics: stats[0] || {
        totalQuotations: 0,
        totalAmount:     0,
        avgAmount:       0,
        draftCount:      0,
        sentCount:       0,
        approvedCount:   0,
      },
    });

  } catch (err) {
    console.error('getQuotations error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE QUOTATION
// GET /quotations/:id
// Returns quotation with processes attached to each item
// ─────────────────────────────────────────────────────────────────────────────
const getQuotation = async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id)
      .populate('VendorID',   'vendor_name vendor_code address gstin state state_code phone email')
      .populate('CompanyID',  'company_name address gstin state state_code phone email')
      .populate('TemplateID', 'template_name template_code columns formula_engine')
      .populate('CreatedBy',  'Username Email')
      .populate('UpdatedBy',  'Username Email');

    if (!q) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

    // Attach QuotationItemProcess records to each item
    const items = await Promise.all(
      q.Items.map(async (item) => {
        const procs = await QuotationItemProcess
          .find({ quotation_item_id: item._id })
          .populate('process_id', 'process_name rate_type');
        return { ...item.toObject(), processes: procs };
      })
    );

    return res.json({
      success: true,
      data: { ...q.toObject(), Items: items },
    });

  } catch (err) {
    console.error('getQuotation error:', err);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// CREATE QUOTATION
// POST /quotations
// ─────────────────────────────────────────────────────────────────────────────
const createQuotation = async (req, res) => {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('CREATE QUOTATION —', new Date().toISOString());
    console.log('='.repeat(80));

    const userId = req.user._id;
    const body   = req.body;

    // =========================================================================
    // STEP 0 — NORMALISE REQUEST BODY
    // Supports new frontend format AND legacy flat format in same controller
    // =========================================================================

    // ── Vendor ────────────────────────────────────────────────────────────────
    // New format:  body.vendor.type  body.vendor.id  body.vendor.new
    // Old format:  body.VendorType   body.VendorID   body.NewVendor
    const VendorType = body.vendor?.type || body.VendorType;
    const VendorID   = body.vendor?.id   || body.VendorID;
    const NewVendor  = body.vendor?.new  || body.NewVendor;

    // ── Template ──────────────────────────────────────────────────────────────
    // New: body.template_id   Old: body.TemplateID
    const TemplateID = body.template_id || body.TemplateID;

    // ── Dates & Remarks ───────────────────────────────────────────────────────
    // New: body.valid_till / body.remarks.internal / body.remarks.customer
    // Old: body.ValidTill  / body.InternalRemarks  / body.CustomerRemarks
    const ValidTill       = body.valid_till        || body.ValidTill;
    const InternalRemarks = body.remarks?.internal || body.InternalRemarks || '';
    const CustomerRemarks = body.remarks?.customer || body.CustomerRemarks || '';

    // ── GST ───────────────────────────────────────────────────────────────────
    // New: body.financials.gst_percentage   Old: body.GSTPercentage
    const GSTPercentage = body.financials?.gst_percentage ?? body.GSTPercentage ?? 18;

    // ── ICC / Landed Cost Settings ────────────────────────────────────────────
    // New: body.icc.xxx   Old: body.icc_xxx (flat)
    // These are quotation-level — same for all items
    const icc_credit_on_input_days = body.icc?.credit_on_input_days    ?? body.icc_credit_on_input_days    ?? -30;
    const icc_wip_fg_days          = body.icc?.wip_fg_days             ?? body.icc_wip_fg_days             ??  30;
    const icc_credit_given_days    = body.icc?.credit_to_customer_days ?? body.icc_credit_given_days       ??  45;
    const icc_cost_of_capital      = body.icc?.cost_of_capital         ?? body.icc_cost_of_capital         ??  0.10;

    // These can also come from body.icc or flat body, with defaults
    const ohp_percent_on_matl   = body.icc?.ohp_percent_on_matl   ?? body.ohp_percent_on_matl   ?? 0.10;
    const ohp_on_labour_pct     = body.icc?.ohp_on_labour_pct     ?? body.ohp_on_labour_pct     ?? 0.15;
    const inspection_cost       = body.icc?.inspection_cost       ?? body.inspection_cost       ?? 0.2;
    const tool_maintenance_cost = body.icc?.tool_maintenance_cost ?? body.tool_maintenance_cost ?? 0.2;
    const packing_cost_per_nos  = body.icc?.packing_cost_per_nos  ?? body.packing_cost_per_nos  ?? 5;
    const plating_cost_per_kg   = body.icc?.plating_cost_per_kg   ?? body.plating_cost_per_kg   ?? 70;

    // ── Items Array ───────────────────────────────────────────────────────────
    // New format: body.items (lowercase array)
    // Old format: body.Items (uppercase array)
    const rawItems = body.items || body.Items || [];

    // Normalise each item to consistent internal shape
    const Items = rawItems.map((it) => {
      const cp = it.costing_parameters || {};

      // Normalise processes array
      const processes = (it.processes || []).map((pd) => ({
        process_id:   pd.process_id,
        // New: rate_per_hour   Old: rate_entered
        rate_entered: pd.rate_per_hour ?? pd.rate_entered ?? 0,
        hours:        pd.hours         ?? 1,
        // New: outsourced_vendor_id   Old: vendor_id
        vendor_id:    pd.outsourced_vendor_id ?? pd.vendor_id ?? null,
        machine:      pd.machine ?? '',
      }));

      // ohp_percent_on_material arrives as FRACTION (0.10 = 10%)
      // or OverheadPercent as plain % (10 = 10%)
      // Normalisation to plain % happens in Step 4g
      const rawOhp    = cp.ohp_percent_on_material ?? it.OverheadPercent ?? 0;
      const rawMargin = cp.margin_percent           ?? it.MarginPercent   ?? 0;

      return {
        PartNo:          it.part_no  || it.PartNo,
        Quantity:        it.quantity || it.Quantity,
        OverheadPercent: rawOhp,     // raw — normalised in Step 4g
        MarginPercent:   rawMargin,  // raw — normalised in Step 4g
        processes,
        // Per-item costing overrides from costing_parameters
        // These override quotation-level values for Landed Cost sheet
        _ohp_on_labour_pct:     cp.ohp_percent_on_labour         ?? null,
        _inspection_cost:       cp.inspection_cost_per_nos       ?? null,
        _tool_maintenance_cost: cp.tool_maintenance_cost_per_nos ?? null,
        _packing_cost_per_nos:  cp.packing_cost_per_nos          ?? null,
        _plating_cost_per_kg:   cp.plating_cost_per_kg           ?? null,
      };
    });

    // ── Basic Validation ──────────────────────────────────────────────────────
    if (!VendorType) {
      return res.status(400).json({ success: false, message: 'vendor.type is required ("Existing" or "New")' });
    }
    if (!TemplateID) {
      return res.status(400).json({ success: false, message: 'template_id is required' });
    }
    if (!Items.length) {
      return res.status(400).json({ success: false, message: 'At least one item is required in items[]' });
    }
    for (const it of Items) {
      if (!it.PartNo)   return res.status(400).json({ success: false, message: 'part_no is required for each item' });
      if (!it.Quantity) return res.status(400).json({ success: false, message: `quantity is required for item ${it.PartNo}` });
    }

    console.log('Vendor:', VendorType, VendorID || '(new)');
    console.log('Template:', TemplateID);
    console.log('Items:', Items.length);


    // =========================================================================
    // STEP 1 — LOAD COMPANY MASTER
    // =========================================================================
    const company = await Company.findOne({ is_active: true });
    if (!company) {
      return res.status(404).json({ success: false, message: 'No active company found in Company master' });
    }
    console.log('Company:', company.company_name);


    // =========================================================================
    // STEP 2 — LOAD TEMPLATE MASTER
    // =========================================================================
    const template = await Template.findById(TemplateID);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    console.log('Template:', template.template_name, '| engine:', template.formula_engine);


    // =========================================================================
    // STEP 3 — RESOLVE VENDOR
    // =========================================================================
    let vendorData = {};

    if (VendorType === 'Existing') {
      if (!VendorID) {
        return res.status(400).json({ success: false, message: 'vendor.id is required for Existing vendor' });
      }
      const vendor = await Vendor.findById(VendorID);
      if (!vendor || !vendor.is_active) {
        return res.status(404).json({ success: false, message: 'Vendor not found or inactive' });
      }
      vendorData = _vendorFields(vendor);
      console.log('Vendor:', vendor.vendor_name);

    } else if (VendorType === 'New') {
      if (!NewVendor || !NewVendor.vendor_name) {
        return res.status(400).json({ success: false, message: 'vendor.new with vendor_name is required for New vendor' });
      }
      const created = await Vendor.create({
        vendor_id:      `V-${Date.now()}`,
        vendor_code:    `VC-${Date.now().toString().slice(-6)}`,
        vendor_name:    NewVendor.vendor_name,
        vendor_type:    NewVendor.vendor_type    || 'Both',
        address:        NewVendor.address        || '',
        gstin:          NewVendor.gstin          || '',
        state:          NewVendor.state          || '',
        state_code:     NewVendor.state_code     || 0,
        contact_person: NewVendor.contact_person || '',
        phone:          NewVendor.phone          || '',
        email:          NewVendor.email          || '',
        pan:            NewVendor.pan            || '',
        created_by:     userId,
        updated_by:     userId,
      });
      vendorData = _vendorFields(created);
      console.log('New vendor created:', created.vendor_name);

    } else {
      return res.status(400).json({ success: false, message: 'vendor.type must be "Existing" or "New"' });
    }


    // =========================================================================
    // STEP 4 — PROCESS EACH ITEM
    // Load all masters, calculate costs, build processed item objects
    // =========================================================================
    console.log('\nProcessing', Items.length, 'item(s)...');

    const processedItems   = []; // final item objects for Quotation.Items[]
    const allItemProcesses = []; // process arrays for QuotationItemProcess (one array per item)

    for (let i = 0; i < Items.length; i++) {
      const reqItem = Items[i];
      console.log(`\n  [${i + 1}] ${reqItem.PartNo} | Qty: ${reqItem.Quantity}`);

      // ── 4a. Item Master ───────────────────────────────────────────────────
      // Provides: part_description, rm_grade, rm_source, rm_type, pitch,
      //           no_of_cavity, density, drawing_no, revision_no, hsn_code,
      //           rm_rejection_percent, scrap_realisation_percent, unit
      const itemMaster = await Item.findOne({
        part_no:   reqItem.PartNo.toUpperCase(),
        is_active: true,
      });
      if (!itemMaster) {
        throw new Error(`Item "${reqItem.PartNo}" not found in Item master`);
      }
      console.log(`    Item: ${itemMaster.part_description} | RM grade: ${itemMaster.rm_grade} | HSN: ${itemMaster.hsn_code}`);

      // ── 4b. DimensionWeight Master ────────────────────────────────────────
      // Provides: Thickness (mm), Width (mm), Length (mm), WeightInKG (net weight per piece)
      const dim = await DimensionWeight
        .findOne({ PartNo: reqItem.PartNo.toUpperCase() })
        .sort({ createdAt: -1 });  // get the latest record if multiple exist
      if (!dim) {
        throw new Error(`DimensionWeight record not found for "${reqItem.PartNo}"`);
      }

      const Thickness = dim.Thickness || 0;  // mm
      const Width     = dim.Width     || 0;  // mm
      const Length    = dim.Length    || 0;  // mm
      // Density priority: Item master > DimensionWeight master > copper default (8.96 g/cm³)
      const density   = itemMaster.density || dim.Density || 8.96;

      console.log(`    Dimensions: T=${Thickness}mm W=${Width}mm L=${Length}mm | Density=${density} g/cm³`);

      // ── 4c. RawMaterial Master ────────────────────────────────────────────
      // Match by Grade (case-insensitive) to itemMaster.rm_grade
      // Provides: RatePerKG, profile_conversion_rate, scrap_rate_per_kg, transport_rate_per_kg
      const rawMaterial = await RawMaterial.findOne({
        Grade:    { $regex: new RegExp(`^${itemMaster.rm_grade.trim()}$`, 'i') },
        IsActive: true,
      });
      if (!rawMaterial) {
        throw new Error(`Raw material not found for grade "${itemMaster.rm_grade}"`);
      }
      console.log(`    RM: Grade=${rawMaterial.Grade} | Rate=${rawMaterial.RatePerKG} Rs/kg | Profile=${rawMaterial.profile_conversion_rate} | Scrap=${rawMaterial.scrap_rate_per_kg} | Transport=${rawMaterial.transport_rate_per_kg}`);

      // ── 4d. Tax Master ────────────────────────────────────────────────────
      // Match by HSN code from Item master → get GST percentage
      const taxRecord     = await Tax.findOne({ HSNCode: itemMaster.hsn_code, IsActive: true });
      const gstPctForItem = taxRecord ? taxRecord.GSTPercentage : 18;
      console.log(`    Tax: HSN ${itemMaster.hsn_code} → GST ${gstPctForItem}%`);

      // ── 4e. Weight & RM Cost Calculations ─────────────────────────────────
      //
      // GrossWeight (kg):
      //   Formula: T(mm) × W(mm) × L(mm) × density(g/cm³) / 1,000,000
      //   Why /1e6: 1 mm³ = 1e-3 cm³, density in g/cm³, 1g = 0.001kg
      //             so mm³ × g/cm³ / 1e6 = kg
      const grossWeightKg = (Thickness * Width * Length * density) / 1_000_000;

      // RM Rate components (all in Rs/kg)
      const rmRate                = rawMaterial.RatePerKG               || 0;
      const profileConversionRate = rawMaterial.profile_conversion_rate || 0;
      const totalRmRate           = rmRate + profileConversionRate;  // Rs/kg

      // Gross RM Cost = what you pay for the raw material piece before considering scrap
      const grossRmCost = grossWeightKg * totalRmRate;

      // Net Weight = finished part weight from DimensionWeight master
      // If not set, assume equal to gross weight (no material removed)
      const netWeightKg = dim.WeightInKG || grossWeightKg;

      // Scrap = material removed during processing (can be 0 for busbars)
      const scrapKgs       = parseFloat((grossWeightKg - netWeightKg).toFixed(6));
      const scrapRatePerKg = rawMaterial.scrap_rate_per_kg || 0;
      const scrapCost      = scrapKgs > 0 ? scrapKgs * scrapRatePerKg : 0;

      // Net RM Cost = actual RM spend after recovering scrap value
      // This value goes into Cost Breakup Row 7 (E7)
      const netRmCost = grossRmCost - scrapCost;

      console.log(`    GrossWt=${grossWeightKg.toFixed(4)}kg NetWt=${netWeightKg.toFixed(4)}kg ScrapKg=${scrapKgs.toFixed(4)}`);
      console.log(`    GrossRMCost=${grossRmCost.toFixed(2)} ScrapCost=${scrapCost.toFixed(2)} NetRMCost=${netRmCost.toFixed(2)} Rs`);

      // ── 4f. Process Cost Calculations ─────────────────────────────────────
      let totalProcessCost = 0;
      const itemProcesses  = [];

      for (const pd of reqItem.processes) {
        const proc = await Process.findById(pd.process_id);
        if (!proc) {
          throw new Error(`Process not found: ${pd.process_id}`);
        }

        // Calculate cost based on rate_type from Process master
        let cost = 0;
        switch (proc.rate_type) {
          case 'Per Nos':
            // Flat rate per piece regardless of weight
            cost = pd.rate_entered;
            break;
          case 'Per Kg':
            // Rate per kg × gross weight of the piece
            cost = pd.rate_entered * grossWeightKg;
            break;
          case 'Per Hour':
            // Hourly rate × number of hours
            cost = pd.rate_entered * (pd.hours || 1);
            break;
          default:
            // Unknown rate_type — treat as Per Nos (safe fallback)
            cost = pd.rate_entered;
        }

        totalProcessCost += cost;

        itemProcesses.push({
          process_id:      proc._id,
          process_name:    proc.process_name,   // → shown in OPERATION col (B) Cost Breakup
          rate_type:       proc.rate_type,
          rate_used:       pd.rate_entered,      // → shown in COST PER PIECE col (D)
          calculated_cost: parseFloat(cost.toFixed(2)), // → shown in AMOUNT col (E)
          vendor_id:       pd.vendor_id  || null,
          hours:           pd.hours      || 1,
          machine:         pd.machine    || '',  // → shown in MACHINE col (C) Cost Breakup
        });

        console.log(`    Process: ${proc.process_name} (${proc.rate_type}) | rate=${pd.rate_entered} hrs=${pd.hours} → cost=${cost.toFixed(2)} Rs`);
      }
      console.log(`    Total Process Cost: ${totalProcessCost.toFixed(2)} Rs`);

      // ── 4g. Normalise Overhead & Margin Percentages ───────────────────────
      //
      // STORAGE CONVENTION: Always store as PLAIN NUMBER (e.g. 10 means 10%)
      // Excel generator reads it and divides by 100 → 0.10
      //
      // INPUT can come in 2 ways:
      //   Fraction: 0.10  (from costing_parameters.ohp_percent_on_material)
      //   Plain %:  10    (from OverheadPercent directly)
      //
      // NORMALISATION RULE:
      //   value > 0 AND value <= 1  → treat as fraction → multiply × 100 → store as 10
      //   value > 1                 → already plain %   → store as-is
      //   value = 0                 → 0%                → store as 0
      const rawOhp    = reqItem.OverheadPercent ?? 0;
      const rawMargin = reqItem.MarginPercent   ?? 0;

      const overheadPct = (rawOhp    > 0 && rawOhp    <= 1) ? rawOhp    * 100 : rawOhp;
      const marginPct   = (rawMargin > 0 && rawMargin <= 1) ? rawMargin * 100 : rawMargin;

      // ── 4h. Final Rate Calculation ────────────────────────────────────────
      const subCost        = netRmCost + totalProcessCost;
      const overheadAmount = (subCost * overheadPct) / 100;
      const marginAmount   = (subCost * marginPct)   / 100;
      const finalRate      = subCost + overheadAmount + marginAmount;
      const amount         = reqItem.Quantity * finalRate;

      console.log(`    SubCost=${subCost.toFixed(2)} OHP=${overheadPct}%(${overheadAmount.toFixed(2)}) Margin=${marginPct}%(${marginAmount.toFixed(2)})`);
      console.log(`    FinalRate=${finalRate.toFixed(2)} Rs | Amount=${amount.toFixed(2)} Rs`);

      // ── 4i. Build Processed Item Object ───────────────────────────────────
      // IMPORTANT: Every field listed here MUST exist in quotationItemSchema
      // Mongoose silently strips any field not in the schema during .create()
      processedItems.push({

        // ── Identity ────────────────────────────────────────────────────────
        PartNo:      reqItem.PartNo,
        PartName:    itemMaster.part_description,
        Description: itemMaster.description || '',
        HSNCode:     itemMaster.hsn_code,
        Unit:        itemMaster.unit         || 'Nos',
        Quantity:    reqItem.Quantity,

        // ── From Item Master ─────────────────────────────────────────────────
        drawing_no:   itemMaster.drawing_no           || '',
        revision_no:  String(itemMaster.revision_no  ?? '0'),
        rm_grade:     itemMaster.rm_grade             || '',
        rm_source:    itemMaster.rm_source            || '',
        rm_type:      itemMaster.rm_type              || '',   // e.g. "Strip", "Sheet", "Rod"
        pitch:        itemMaster.pitch                || Length,
        no_of_cavity: itemMaster.no_of_cavity         || 1,

        // Percentages from Item master — stored as plain numbers (2 = 2%, 85 = 85%)
        rm_rejection_percent:      itemMaster.rm_rejection_percent      || 2,
        scrap_realisation_percent: itemMaster.scrap_realisation_percent || 85,

        // ── From Tax Master ──────────────────────────────────────────────────
        // Plain number (18 = 18%)
        gst_percentage: gstPctForItem,

        // ── Dimensions (from DimensionWeight Master) ─────────────────────────
        Thickness,   // mm
        Width,       // mm
        Length,      // mm

        // ── From RawMaterial Master ──────────────────────────────────────────
        density,                                           // g/cm³
        rm_rate:                 rmRate,                   // Rs/kg
        profile_conversion_rate: profileConversionRate,   // Rs/kg
        total_rm_rate:           parseFloat(totalRmRate.toFixed(4)),   // Rs/kg
        scrap_rate_per_kg:       scrapRatePerKg,           // Rs/kg
        transport_rate_per_kg:   rawMaterial.transport_rate_per_kg || 0, // Rs/kg

        // ── Weight Calculations ──────────────────────────────────────────────
        gross_weight_kg: parseFloat(grossWeightKg.toFixed(6)),  // kg
        net_weight_kg:   parseFloat(netWeightKg.toFixed(6)),    // kg
        scrap_kgs:       parseFloat(scrapKgs.toFixed(6)),       // kg

        // ── RM Cost Calculations ─────────────────────────────────────────────
        gross_rm_cost: parseFloat(grossRmCost.toFixed(4)),  // Rs
        scrap_cost:    parseFloat(scrapCost.toFixed(4)),    // Rs
        net_rm_cost:   parseFloat(netRmCost.toFixed(4)),    // Rs → Cost Breakup E7

        // ── Legacy Aliases (backward compat) ────────────────────────────────
        Weight: parseFloat(grossWeightKg.toFixed(4)),
        RMCost: parseFloat(grossRmCost.toFixed(2)),

        // ── Process Total ────────────────────────────────────────────────────
        ProcessCost: parseFloat(totalProcessCost.toFixed(2)),  // Rs

        // ── Overhead & Margin — stored as PLAIN % (e.g. 10 = 10%) ───────────
        // Excel generator reads these and divides by 100
        OverheadPercent: overheadPct,
        OverheadAmount:  parseFloat(overheadAmount.toFixed(2)),
        MarginPercent:   marginPct,
        MarginAmount:    parseFloat(marginAmount.toFixed(2)),

        // ── Totals ───────────────────────────────────────────────────────────
        SubCost:   parseFloat(subCost.toFixed(2)),
        FinalRate: parseFloat(finalRate.toFixed(2)),
        Amount:    parseFloat(amount.toFixed(2)),

      });

      allItemProcesses.push(itemProcesses);

    } // ── end item loop ──────────────────────────────────────────────────────


    // =========================================================================
    // STEP 5 — LOAD TERMS & CONDITIONS
    // =========================================================================
    const termsConditions = await TermsCondition
      .find({ IsActive: true })
      .sort({ Sequence: 1 })
      .select('Title Description Sequence');


    // =========================================================================
    // STEP 6 — COMPUTE QUOTATION-LEVEL TOTALS
    // =========================================================================
    const gstPct     = GSTPercentage || 18;
    const subTotal   = processedItems.reduce((sum, item) => sum + item.Amount, 0);
    const gstAmount  = subTotal * (gstPct / 100);
    const grandTotal = subTotal + gstAmount;

    // IGST = inter-state (vendor state ≠ company state)
    // CGST/SGST = intra-state
    const gstType = vendorData.VendorStateCode !== company.state_code
      ? 'IGST'
      : 'CGST/SGST';

    console.log(`\nSubTotal=${subTotal.toFixed(2)} GST(${gstPct}%)=${gstAmount.toFixed(2)} GrandTotal=${grandTotal.toFixed(2)} | ${gstType}`);


    // =========================================================================
    // STEP 7 — SAVE QUOTATION TO DATABASE
    // =========================================================================
    console.log('\nSaving quotation...');

    const quotation = await Quotation.create({

      // Company (auto-loaded from Company master)
      CompanyID:        company._id,
      CompanyName:      company.company_name,
      CompanyGSTIN:     company.gstin        || '',
      CompanyState:     company.state        || '',
      CompanyStateCode: company.state_code   || 0,

      // Vendor (spread from _vendorFields helper output)
      ...vendorData,
      VendorType,

      // Template
      TemplateID:   TemplateID || null,
      TemplateName: template.template_name,

      // Items array with all costing fields
      Items: processedItems,

      // Quotation-level totals
      GSTPercentage: gstPct,
      GSTType:       gstType,
      SubTotal:      parseFloat(subTotal.toFixed(2)),
      GSTAmount:     parseFloat(gstAmount.toFixed(2)),
      GrandTotal:    parseFloat(grandTotal.toFixed(2)),

      // Dates & remarks
      ValidTill:       ValidTill ? new Date(ValidTill) : undefined,
      InternalRemarks: InternalRemarks || '',
      CustomerRemarks: CustomerRemarks || '',

      // Terms & conditions (copied from master at time of quotation creation)
      TermsConditions: termsConditions,

      // ── Landed Cost / ICC Settings ────────────────────────────────────────
      // These are used by generateLandedCostExcel() to fill the ICC calculation rows
      icc_credit_on_input_days,   // D48 — days (negative = you pay before receiving material)
      icc_wip_fg_days,            // D49 — days stock sits as WIP/FG
      icc_credit_given_days,      // D50 — days credit given to customer
      icc_cost_of_capital,        // B52 — fraction (0.10 = 10% per year)
      ohp_percent_on_matl,        // B55 — fraction (0.10 = 10%)
      ohp_on_labour_pct,          // C63 — fraction (0.15 = 15%)
      inspection_cost,            // D64 — Rs per piece
      tool_maintenance_cost,      // D65 — Rs per piece
      packing_cost_per_nos,       // C66 — Rs per piece
      plating_cost_per_kg,        // C68 — Rs per kg

      // Audit
      CreatedBy: userId,
      UpdatedBy: userId,

    });

    console.log('Saved:', quotation.QuotationNo);


    // =========================================================================
    // STEP 8 — SAVE QuotationItemProcess RECORDS
    // One document per process per item — used for GET /quotations/:id
    // and for history / audit trail
    // =========================================================================
    for (let i = 0; i < quotation.Items.length; i++) {
      const savedItem = quotation.Items[i]; // has _id assigned by MongoDB

      for (const pd of allItemProcesses[i]) {
        await QuotationItemProcess.create({
          qip_id:            `QIP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          quotation_item_id: savedItem._id,
          process_id:        pd.process_id,
          process_name:      pd.process_name,
          rate_type:         pd.rate_type,
          rate_used:         pd.rate_used,
          calculated_cost:   pd.calculated_cost,
          vendor_id:         pd.vendor_id  || null,
          hours:             pd.hours      || 1,
          machine:           pd.machine    || '',
          CreatedBy:         userId,
          UpdatedBy:         userId,
        });
      }
    }

    console.log('QuotationItemProcess records saved.');


    // =========================================================================
    // STEP 9 — BUILD EXCEL DATA OBJECT
    // Use in-memory processedItems — do NOT re-read from DB
    // Reason: quotation.Items.toObject() strips non-schema fields
    //         and we need the full processes array with all fields
    // =========================================================================
    const itemsWithProcesses = processedItems.map((item, idx) => ({
      ...item,
      processes: allItemProcesses[idx],
    }));

    const quotationDataForExcel = {
      ...quotation.toObject(),    // QuotationNo, QuotationDate, CompanyName, VendorName, etc.
      Items: itemsWithProcesses,  // override with full in-memory items including processes
    };


    // =========================================================================
    // STEP 10 — GENERATE EXCEL AND STREAM TO CLIENT
    // =========================================================================
    console.log('\nGenerating Excel | engine:', template.formula_engine);

    const workbook    = new ExcelJS.Workbook();
    workbook.creator  = company.company_name || 'QuotationSystem';
    workbook.created  = new Date();
    workbook.modified = new Date();

    // generateQuotationExcel dispatches to correct generator:
    //   formula_engine = 'busbar'       → generateBusbarExcel       (horizontal table)
    //   formula_engine = 'landed_cost'  → generateLandedCostExcel   (vertical, ICC/OHP rows)
    //   formula_engine = 'cost_breakup' → generateCostBreakupExcel  (Suyash-style vertical)
    generateQuotationExcel(workbook, quotationDataForExcel, template);

    console.log('='.repeat(80));
    console.log('DONE —', quotation.QuotationNo);
    console.log('='.repeat(80));

    // Stream Excel file as download
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${template.template_code}_${quotation.QuotationNo}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('\ncreatQuotation ERROR:', err.name, '-', err.message);
    console.error(err.stack);

    // Mongoose validation error — missing required field, enum mismatch, etc.
    if (err.name === 'ValidationError') {
      const msgs = Object.values(err.errors).map((v) => v.message);
      return res.status(400).json({ success: false, message: msgs.join(', ') });
    }

    // Known "not found" errors from throw new Error(...)
    if (err.message && err.message.toLowerCase().includes('not found')) {
      return res.status(404).json({ success: false, message: err.message });
    }

    // Invalid MongoDB ObjectId format
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ID format: ' + err.message });
    }

    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { getQuotations, getQuotation, createQuotation };
