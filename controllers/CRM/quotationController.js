'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// quotationController.js
//
// Handles:
//   GET  /quotations                    → getQuotations          (list + pagination + stats)
//   GET  /quotations/templates          → getQuotationTemplates  (dropdown feed)
//   GET  /quotations/by-template        → getQuotationsByTemplate
//   GET  /quotations/:id                → getQuotation           (single with processes)
//   POST /quotations                    → createQuotation        (full costing + Excel stream)
//   POST /quotations/:id/duplicate      → duplicateQuotation     (clone + swap customer)
//
// ALL party references use Customer master (models/CRM/Customer.js).
// Customer fields are mapped onto the Quotation schema's CustomerXxx fields.
// ─────────────────────────────────────────────────────────────────────────────

const mongoose             = require('mongoose');
const Quotation            = require('../../models/CRM/Quotation');
const QuotationItemProcess = require('../../models/CRM/QuotationItemProcess');
const Company              = require('../../models/user\'s & setting\'s/Company');
const Customer             = require('../../models/CRM/Customer');
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
// HELPER — map a Customer document onto the CustomerXxx fields the schema uses
//
// Customer.customer_name            → CustomerName
// Customer.gstin                    → CustomerGSTIN
// Customer.billing_address.state    → CustomerState
// Customer.billing_address.state_code → CustomerStateCode
// Customer.billing_address (full)   → CustomerAddress / CustomerCity / CustomerPincode
// Customer.primary_contact.mobile   → CustomerPhone
// Customer.primary_contact.email    → CustomerEmail
// Customer.pan                      → CustomerPAN
// Customer.primary_contact.name     → CustomerContactPerson
// ─────────────────────────────────────────────────────────────────────────────
function _customerFields(customer) {
  const contact = customer.contacts?.find(c => c.is_primary) ?? customer.contacts?.[0] ?? {};
  const addr    = customer.billing_address ?? {};

  return {
    CustomerID:            customer._id,
    CustomerName:          customer.customer_name,
    CustomerGSTIN:         customer.gstin                                  || '',
    CustomerState:         addr.state                                      || '',
    CustomerStateCode:     addr.state_code                                 || 0,
    CustomerAddress:       [addr.line1, addr.line2].filter(Boolean).join(', '),
    CustomerCity:          addr.city                                       || '',
    CustomerPincode:       addr.pincode                                    || '',
    CustomerContactPerson: contact.name                                    || '',
    CustomerPhone:         contact.mobile || contact.phone                 || '',
    CustomerEmail:         contact.email                                   || '',
    CustomerPAN:           customer.pan                                    || '',
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// GET ALL QUOTATIONS
// GET /quotations
// Query: page, limit, status, customerId, startDate, endDate,
//        search, templateId, sortBy, sortOrder
// ─────────────────────────────────────────────────────────────────────────────
const getQuotations = async (req, res) => {
  try {
    const {
      page       = 1,
      limit      = 10,
      status,
      customerId,
      startDate,
      endDate,
      search,
      templateId,
      sortBy     = 'createdAt',
      sortOrder  = 'desc',
    } = req.query;

    const query = { IsActive: true };
    if (status)     query.Status     = status;
    if (customerId) query.CustomerID = customerId;
    if (templateId) query.TemplateID = templateId;
    if (startDate || endDate) {
      query.QuotationDate = {};
      if (startDate) query.QuotationDate.$gte = new Date(startDate);
      if (endDate)   query.QuotationDate.$lte = new Date(endDate);
    }
    if (search) {
      query.$or = [
        { QuotationNo:   new RegExp(search, 'i') },
        { CustomerName:  new RegExp(search, 'i') },
      ];
    }

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const lim  = parseInt(limit);

    const [quotations, total, stats] = await Promise.all([

      Quotation.find(query)
        .populate('CustomerID', 'customer_name customer_code gstin')
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
            _id:             null,
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
// GET QUOTATION TEMPLATES  (dropdown feed)
// GET /quotations/templates
// ─────────────────────────────────────────────────────────────────────────────
const getQuotationTemplates = async (req, res) => {
  try {
    const templates = await Template
      .find({ is_active: true })
      .sort({ template_name: 1 })
      .select('_id template_code template_name formula_engine excel_layout default_margin_percent description');

    return res.json({
      success: true,
      count:   templates.length,
      data:    templates,
    });

  } catch (err) {
    console.error('getQuotationTemplates error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET QUOTATIONS BY TEMPLATE
// GET /quotations/by-template?template_id=<id>&page=1&limit=10&search=&status=
// ─────────────────────────────────────────────────────────────────────────────
const getQuotationsByTemplate = async (req, res) => {
  try {
    const {
      template_id,
      page      = 1,
      limit     = 10,
      status,
      search,
      sortBy    = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    if (!template_id) {
      return res.status(400).json({
        success: false,
        message: 'template_id query parameter is required',
      });
    }

    const template = await Template
      .findById(template_id)
      .select('_id template_code template_name formula_engine excel_layout default_margin_percent is_active');

    if (!template || !template.is_active) {
      return res.status(404).json({ success: false, message: 'Template not found or inactive' });
    }

    const query = { IsActive: true, TemplateID: template_id };
    if (status) query.Status = status;
    if (search) {
      query.$or = [
        { QuotationNo:  new RegExp(search, 'i') },
        { CustomerName: new RegExp(search, 'i') },
      ];
    }

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const lim  = parseInt(limit);

    const [quotations, total, stats] = await Promise.all([

      Quotation.find(query)
        .populate('CustomerID', 'customer_name customer_code gstin')
        .populate('CompanyID',  'company_name gstin')
        .populate('TemplateID', 'template_name template_code formula_engine')
        .populate('CreatedBy',  'Username Email')
        .sort(sort)
        .skip(skip)
        .limit(lim),

      Quotation.countDocuments(query),

      Quotation.aggregate([
        {
          $match: {
            IsActive:   true,
            TemplateID: new mongoose.Types.ObjectId(template_id),
          },
        },
        {
          $group: {
            _id:             null,
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
      success:  true,
      template: template,
      data:     quotations,
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
    console.error('getQuotationsByTemplate error:', err);
    if (err.kind === 'ObjectId') {
      return res.status(400).json({ success: false, message: 'Invalid template_id format' });
    }
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE QUOTATION
// GET /quotations/:id
// ─────────────────────────────────────────────────────────────────────────────
const getQuotation = async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id)
      .populate('CustomerID', 'customer_name customer_code billing_address gstin pan contacts')
      .populate('CompanyID',  'company_name address gstin state state_code phone email')
      .populate('TemplateID', 'template_name template_code formula_engine columns')
      .populate('CreatedBy',  'Username Email')
      .populate('UpdatedBy',  'Username Email');

    if (!q) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }

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
//
// REQUEST BODY FORMAT:
// {
//   "customer": {
//     "type": "Existing",         // "Existing" | "New"
//     "id":   "<mongoId>",        // required when type = "Existing"
//     "new":  { ... }             // required when type = "New" — same shape as Customer doc
//   },
//   "template_id": "<mongoId>",
//   "valid_till":  "2026-04-30",
//   "remarks": { "internal": "...", "customer": "..." },
//   "financials": { "gst_percentage": 18 },
//   "icc": {
//     "credit_on_input_days":   -30,
//     "wip_fg_days":             30,
//     "credit_to_customer_days": 45,
//     "cost_of_capital":         0.10
//   },
//   "items": [
//     {
//       "part_no":  "BR-009",
//       "quantity": 100,
//       "costing_parameters": {
//         "ohp_percent_on_material":       0.10,
//         "ohp_percent_on_labour":         0.15,
//         "inspection_cost_per_nos":       0.20,
//         "tool_maintenance_cost_per_nos": 0.20,
//         "packing_cost_per_nos":          5.00,
//         "plating_cost_per_kg":          70.00,
//         "margin_percent":               15
//       },
//       "processes": [
//         {
//           "process_id":          "<mongoId>",
//           "rate_per_hour":        252.50,
//           "hours":                1.5,
//           "outsourced_vendor_id": null,
//           "machine":             "CNC Laser"
//         }
//       ]
//     }
//   ]
// }
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
    // =========================================================================

    // ── Customer ──────────────────────────────────────────────────────────────
    const CustomerType = body.customer?.type || body.CustomerType;
    const CustomerIDRaw = body.customer?.id  || body.CustomerID;
    const NewCustomer  = body.customer?.new  || body.NewCustomer;

    // ── Template ──────────────────────────────────────────────────────────────
    const TemplateID = body.template_id || body.TemplateID;

    // ── Dates & Remarks ───────────────────────────────────────────────────────
    const ValidTill       = body.valid_till        || body.ValidTill;
    const InternalRemarks = body.remarks?.internal || body.InternalRemarks || '';
    const CustomerRemarks = body.remarks?.customer || body.CustomerRemarks || '';

    // ── GST ───────────────────────────────────────────────────────────────────
    const GSTPercentage = body.financials?.gst_percentage ?? body.GSTPercentage ?? 18;

    // ── ICC / Landed Cost Settings ────────────────────────────────────────────
    const icc_credit_on_input_days = body.icc?.credit_on_input_days    ?? body.icc_credit_on_input_days    ?? -30;
    const icc_wip_fg_days          = body.icc?.wip_fg_days             ?? body.icc_wip_fg_days             ??  30;
    const icc_credit_given_days    = body.icc?.credit_to_customer_days ?? body.icc_credit_given_days       ??  45;
    const icc_cost_of_capital      = body.icc?.cost_of_capital         ?? body.icc_cost_of_capital         ??  0.10;

    const ohp_percent_on_matl   = body.icc?.ohp_percent_on_matl   ?? body.ohp_percent_on_matl   ?? 0.10;
    const ohp_on_labour_pct     = body.icc?.ohp_on_labour_pct     ?? body.ohp_on_labour_pct     ?? 0.15;
    const inspection_cost       = body.icc?.inspection_cost       ?? body.inspection_cost       ?? 0.2;
    const tool_maintenance_cost = body.icc?.tool_maintenance_cost ?? body.tool_maintenance_cost ?? 0.2;
    const packing_cost_per_nos  = body.icc?.packing_cost_per_nos  ?? body.packing_cost_per_nos  ?? 5;
    const plating_cost_per_kg   = body.icc?.plating_cost_per_kg   ?? body.plating_cost_per_kg   ?? 70;

    // ── Items Array ───────────────────────────────────────────────────────────
    const rawItems = body.items || body.Items || [];

    const Items = rawItems.map((it) => {
      const cp = it.costing_parameters || {};

      const processes = (it.processes || []).map((pd) => ({
        process_id:   pd.process_id,
        rate_entered: pd.rate_per_hour ?? pd.rate_entered ?? 0,
        hours:        pd.hours         ?? 1,
        vendor_id:    pd.outsourced_vendor_id ?? pd.vendor_id ?? null,
        machine:      pd.machine ?? '',
      }));

      const rawOhp    = cp.ohp_percent_on_material ?? it.OverheadPercent ?? 0;
      const rawMargin = cp.margin_percent           ?? it.MarginPercent   ?? 0;

      return {
        PartNo:          it.part_no  || it.PartNo,
        Quantity:        it.quantity || it.Quantity,
        OverheadPercent: rawOhp,
        MarginPercent:   rawMargin,
        processes,
        _ohp_on_labour_pct:     cp.ohp_percent_on_labour         ?? null,
        _inspection_cost:       cp.inspection_cost_per_nos       ?? null,
        _tool_maintenance_cost: cp.tool_maintenance_cost_per_nos ?? null,
        _packing_cost_per_nos:  cp.packing_cost_per_nos          ?? null,
        _plating_cost_per_kg:   cp.plating_cost_per_kg           ?? null,
      };
    });

    // ── Basic Validation ──────────────────────────────────────────────────────
    if (!CustomerType) {
      return res.status(400).json({ success: false, message: 'customer.type is required ("Existing" or "New")' });
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

    console.log('Customer:', CustomerType, CustomerIDRaw || '(new)');
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
    // STEP 3 — RESOLVE CUSTOMER
    // =========================================================================
    let customerData = {};

    if (CustomerType === 'Existing') {
      if (!CustomerIDRaw) {
        return res.status(400).json({ success: false, message: 'customer.id is required for Existing customer' });
      }
      const customer = await Customer.findById(CustomerIDRaw);
      if (!customer || !customer.is_active) {
        return res.status(404).json({ success: false, message: 'Customer not found or inactive' });
      }
      customerData = _customerFields(customer);
      console.log('Customer:', customer.customer_name);

    } else if (CustomerType === 'New') {
      if (!NewCustomer || !NewCustomer.customer_name) {
        return res.status(400).json({ success: false, message: 'customer.new with customer_name is required for New customer' });
      }

      // Create a new Customer document on the fly
      const created = await Customer.create({
        customer_code:   `CUST-${Date.now().toString().slice(-6)}`,
        customer_name:   NewCustomer.customer_name,
        customer_type:   NewCustomer.customer_type   || 'Direct',
        gstin:           NewCustomer.gstin           || undefined,
        pan:             NewCustomer.pan             || '',
        billing_address: NewCustomer.billing_address || {
          line1:      NewCustomer.address    || '',
          city:       NewCustomer.city       || '',
          state:      NewCustomer.state      || '',
          state_code: NewCustomer.state_code || 0,
          pincode:    NewCustomer.pincode    || '',
        },
        contacts: NewCustomer.contact_person ? [{
          name:       NewCustomer.contact_person,
          phone:      NewCustomer.phone || '',
          email:      NewCustomer.email || '',
          is_primary: true,
        }] : [],
        created_by: userId,
      });
      customerData = _customerFields(created);
      console.log('New customer created:', created.customer_name);

    } else {
      return res.status(400).json({ success: false, message: 'customer.type must be "Existing" or "New"' });
    }


    // =========================================================================
    // STEP 4 — PROCESS EACH ITEM
    // =========================================================================
    console.log('\nProcessing', Items.length, 'item(s)...');

    const processedItems   = [];
    const allItemProcesses = [];

    for (let i = 0; i < Items.length; i++) {
      const reqItem = Items[i];
      console.log(`\n  [${i + 1}] ${reqItem.PartNo} | Qty: ${reqItem.Quantity}`);

      // ── 4a. Item Master ───────────────────────────────────────────────────
      const itemMaster = await Item.findOne({
        part_no:   reqItem.PartNo.toUpperCase(),
        is_active: true,
      });
      if (!itemMaster) {
        throw new Error(`Item "${reqItem.PartNo}" not found in Item master`);
      }
      console.log(`    Item: ${itemMaster.part_description} | RM grade: ${itemMaster.rm_grade} | HSN: ${itemMaster.hsn_code}`);

      // ── 4b. DimensionWeight Master ────────────────────────────────────────
      const dim = await DimensionWeight
        .findOne({ PartNo: reqItem.PartNo.toUpperCase() })
        .sort({ createdAt: -1 });
      if (!dim) {
        throw new Error(`DimensionWeight record not found for "${reqItem.PartNo}"`);
      }

      const Thickness = dim.Thickness || 0;
      const Width     = dim.Width     || 0;
      const Length    = dim.Length    || 0;
      const density   = itemMaster.density || dim.Density || 8.96;
      console.log(`    Dimensions: T=${Thickness}mm W=${Width}mm L=${Length}mm | Density=${density} g/cm³`);

      // ── 4c. RawMaterial Master ────────────────────────────────────────────
      const rawMaterial = await RawMaterial.findOne({
        Grade:    { $regex: new RegExp(`^${itemMaster.rm_grade.trim()}$`, 'i') },
        IsActive: true,
      });
      if (!rawMaterial) {
        throw new Error(`Raw material not found for grade "${itemMaster.rm_grade}"`);
      }
      console.log(`    RM: Grade=${rawMaterial.Grade} | Rate=${rawMaterial.RatePerKG} Rs/kg`);

      // ── 4d. Tax Master ────────────────────────────────────────────────────
      const taxRecord     = await Tax.findOne({ HSNCode: itemMaster.hsn_code, IsActive: true });
      const gstPctForItem = taxRecord ? taxRecord.GSTPercentage : 18;
      console.log(`    Tax: HSN ${itemMaster.hsn_code} → GST ${gstPctForItem}%`);

      // ── 4e. Weight & RM Cost ───────────────────────────────────────────────
      const grossWeightKg         = (Thickness * Width * Length * density) / 1_000_000;
      const rmRate                = rawMaterial.RatePerKG               || 0;
      const profileConversionRate = rawMaterial.profile_conversion_rate || 0;
      const totalRmRate           = rmRate + profileConversionRate;
      const grossRmCost           = grossWeightKg * totalRmRate;
      const netWeightKg           = dim.WeightInKG || grossWeightKg;
      const scrapKgs              = parseFloat((grossWeightKg - netWeightKg).toFixed(6));
      const scrapRatePerKg        = rawMaterial.scrap_rate_per_kg || 0;
      const scrapCost             = scrapKgs > 0 ? scrapKgs * scrapRatePerKg : 0;
      const netRmCost             = grossRmCost - scrapCost;

      console.log(`    GrossWt=${grossWeightKg.toFixed(4)}kg NetWt=${netWeightKg.toFixed(4)}kg`);
      console.log(`    GrossRMCost=${grossRmCost.toFixed(2)} ScrapCost=${scrapCost.toFixed(2)} NetRMCost=${netRmCost.toFixed(2)} Rs`);

      // ── 4f. Process Cost ──────────────────────────────────────────────────
      let totalProcessCost = 0;
      const itemProcesses  = [];

      for (const pd of reqItem.processes) {
        const proc = await Process.findById(pd.process_id);
        if (!proc) {
          throw new Error(`Process not found: ${pd.process_id}`);
        }

        let cost = 0;
        switch (proc.rate_type) {
          case 'Per Nos':  cost = pd.rate_entered;                          break;
          case 'Per Kg':   cost = pd.rate_entered * grossWeightKg;          break;
          case 'Per Hour': cost = pd.rate_entered * (pd.hours || 1);        break;
          default:         cost = pd.rate_entered;
        }

        totalProcessCost += cost;

        itemProcesses.push({
          process_id:      proc._id,
          process_name:    proc.process_name,
          rate_type:       proc.rate_type,
          rate_used:       pd.rate_entered,
          calculated_cost: parseFloat(cost.toFixed(2)),
          vendor_id:       pd.vendor_id  || null,
          hours:           pd.hours      || 1,
          machine:         pd.machine    || '',
        });

        console.log(`    Process: ${proc.process_name} (${proc.rate_type}) | rate=${pd.rate_entered} → cost=${cost.toFixed(2)} Rs`);
      }
      console.log(`    Total Process Cost: ${totalProcessCost.toFixed(2)} Rs`);

      // ── 4g. Normalise Overhead & Margin ────────────────────────────────────
      // Input ≤1 → treat as fraction → convert to plain % (0.10 → 10)
      // Input >1 → already plain %   → keep as-is
      const rawOhp    = reqItem.OverheadPercent ?? 0;
      const rawMargin = reqItem.MarginPercent   ?? 0;
      const overheadPct = (rawOhp    > 0 && rawOhp    <= 1) ? rawOhp    * 100 : rawOhp;
      const marginPct   = (rawMargin > 0 && rawMargin <= 1) ? rawMargin * 100 : rawMargin;

      // ── 4h. Final Rate ─────────────────────────────────────────────────────
      const subCost        = netRmCost + totalProcessCost;
      const overheadAmount = (subCost * overheadPct) / 100;
      const marginAmount   = (subCost * marginPct)   / 100;
      const finalRate      = subCost + overheadAmount + marginAmount;
      const amount         = reqItem.Quantity * finalRate;

      console.log(`    SubCost=${subCost.toFixed(2)} OHP=${overheadPct}% Margin=${marginPct}%`);
      console.log(`    FinalRate=${finalRate.toFixed(2)} Rs | Amount=${amount.toFixed(2)} Rs`);

      // ── 4i. Build Processed Item Object ───────────────────────────────────
      processedItems.push({
        PartNo:      reqItem.PartNo,
        PartName:    itemMaster.part_description,
        Description: itemMaster.description || '',
        HSNCode:     itemMaster.hsn_code,
        Unit:        itemMaster.unit         || 'Nos',
        Quantity:    reqItem.Quantity,

        drawing_no:   itemMaster.drawing_no           || '',
        revision_no:  String(itemMaster.revision_no  ?? '0'),
        rm_grade:     itemMaster.rm_grade             || '',
        rm_source:    itemMaster.rm_source            || '',
        rm_type:      itemMaster.rm_type              || '',
        pitch:        itemMaster.pitch                || Length,
        no_of_cavity: itemMaster.no_of_cavity         || 1,

        rm_rejection_percent:      itemMaster.rm_rejection_percent      || 2,
        scrap_realisation_percent: itemMaster.scrap_realisation_percent || 85,

        gst_percentage: gstPctForItem,

        Thickness,
        Width,
        Length,

        density,
        rm_rate:                 rmRate,
        profile_conversion_rate: profileConversionRate,
        total_rm_rate:           parseFloat(totalRmRate.toFixed(4)),
        scrap_rate_per_kg:       scrapRatePerKg,
        transport_rate_per_kg:   rawMaterial.transport_rate_per_kg || 0,

        gross_weight_kg: parseFloat(grossWeightKg.toFixed(6)),
        net_weight_kg:   parseFloat(netWeightKg.toFixed(6)),
        scrap_kgs:       parseFloat(scrapKgs.toFixed(6)),

        gross_rm_cost: parseFloat(grossRmCost.toFixed(4)),
        scrap_cost:    parseFloat(scrapCost.toFixed(4)),
        net_rm_cost:   parseFloat(netRmCost.toFixed(4)),

        Weight: parseFloat(grossWeightKg.toFixed(4)),
        RMCost: parseFloat(grossRmCost.toFixed(2)),

        ProcessCost: parseFloat(totalProcessCost.toFixed(2)),

        OverheadPercent: overheadPct,
        OverheadAmount:  parseFloat(overheadAmount.toFixed(2)),
        MarginPercent:   marginPct,
        MarginAmount:    parseFloat(marginAmount.toFixed(2)),

        SubCost:   parseFloat(subCost.toFixed(2)),
        FinalRate: parseFloat(finalRate.toFixed(2)),
        Amount:    parseFloat(amount.toFixed(2)),
      });

      allItemProcesses.push(itemProcesses);

    } // end item loop


    // =========================================================================
    // STEP 5 — LOAD TERMS & CONDITIONS
    // =========================================================================
    const termsConditions = await TermsCondition
      .find({ IsActive: true })
      .sort({ Sequence: 1 })
      .select('Title Description Sequence');


    // =========================================================================
    // STEP 6 — QUOTATION-LEVEL TOTALS
    // =========================================================================
    const gstPct     = GSTPercentage || 18;
    const subTotal   = processedItems.reduce((sum, item) => sum + item.Amount, 0);
    const gstAmount  = subTotal * (gstPct / 100);
    const grandTotal = subTotal + gstAmount;

    const gstType = customerData.CustomerStateCode !== company.state_code
      ? 'IGST'
      : 'CGST/SGST';

    console.log(`\nSubTotal=${subTotal.toFixed(2)} GST(${gstPct}%)=${gstAmount.toFixed(2)} GrandTotal=${grandTotal.toFixed(2)} | ${gstType}`);


    // =========================================================================
    // STEP 7 — SAVE QUOTATION
    // =========================================================================
    console.log('\nSaving quotation...');

    const quotation = await Quotation.create({

      CompanyID:        company._id,
      CompanyName:      company.company_name,
      CompanyGSTIN:     company.gstin        || '',
      CompanyState:     company.state        || '',
      CompanyStateCode: company.state_code   || 0,

      // Customer fields spread in
      ...customerData,
      CustomerType,

      TemplateID:   TemplateID || null,
      TemplateName: template.template_name,

      Items: processedItems,

      GSTPercentage: gstPct,
      GSTType:       gstType,
      SubTotal:      parseFloat(subTotal.toFixed(2)),
      GSTAmount:     parseFloat(gstAmount.toFixed(2)),
      GrandTotal:    parseFloat(grandTotal.toFixed(2)),

      ValidTill:       ValidTill ? new Date(ValidTill) : undefined,
      InternalRemarks: InternalRemarks || '',
      CustomerRemarks: CustomerRemarks || '',

      TermsConditions: termsConditions,

      icc_credit_on_input_days,
      icc_wip_fg_days,
      icc_credit_given_days,
      icc_cost_of_capital,
      ohp_percent_on_matl,
      ohp_on_labour_pct,
      inspection_cost,
      tool_maintenance_cost,
      packing_cost_per_nos,
      plating_cost_per_kg,

      CreatedBy: userId,
      UpdatedBy: userId,

    });

    console.log('Saved:', quotation.QuotationNo);


    // =========================================================================
    // STEP 8 — SAVE QuotationItemProcess RECORDS
    // =========================================================================
    for (let i = 0; i < quotation.Items.length; i++) {
      const savedItem = quotation.Items[i];
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
    // =========================================================================
    const itemsWithProcesses = processedItems.map((item, idx) => ({
      ...item,
      processes: allItemProcesses[idx],
    }));

    const quotationDataForExcel = {
      ...quotation.toObject(),
      Items: itemsWithProcesses,
    };


    // =========================================================================
    // STEP 10 — GENERATE EXCEL AND STREAM
    // =========================================================================
    console.log('\nGenerating Excel | engine:', template.formula_engine);

    const workbook    = new ExcelJS.Workbook();
    workbook.creator  = company.company_name || 'QuotationSystem';
    workbook.created  = new Date();
    workbook.modified = new Date();

    generateQuotationExcel(workbook, quotationDataForExcel, template);

    console.log('='.repeat(80));
    console.log('DONE —', quotation.QuotationNo);
    console.log('='.repeat(80));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${template.template_code}_${quotation.QuotationNo}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('\ncreateQuotation ERROR:', err.name, '-', err.message);
    console.error(err.stack);

    if (err.name === 'ValidationError') {
      const msgs = Object.values(err.errors).map(v => v.message);
      return res.status(400).json({ success: false, message: msgs.join(', ') });
    }
    if (err.message?.toLowerCase().includes('not found')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ID format: ' + err.message });
    }
    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// DUPLICATE QUOTATION
// POST /quotations/:id/duplicate
//
// Clones every costing field from an existing quotation into a brand-new Draft.
// Optionally swaps the customer via body.customer.
//
// COPIED:   TemplateID, all Items[] costing fields, ICC settings,
//           GSTPercentage, TermsConditions snapshot
// NOT COPIED (always fresh): QuotationNo, QuotationDate, ValidTill,
//           Status (→ Draft), InternalRemarks, CustomerRemarks, CreatedBy
// ─────────────────────────────────────────────────────────────────────────────
const duplicateQuotation = async (req, res) => {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('DUPLICATE QUOTATION —', new Date().toISOString());
    console.log('Source ID:', req.params.id);
    console.log('='.repeat(80));

    const userId = req.user._id;
    const body   = req.body || {};

    // ── Load source quotation ─────────────────────────────────────────────────
    const source = await Quotation.findById(req.params.id);
    if (!source || !source.IsActive) {
      return res.status(404).json({ success: false, message: 'Source quotation not found' });
    }
    console.log('Source:', source.QuotationNo, '| Template:', source.TemplateName);

    // ── Load template ─────────────────────────────────────────────────────────
    const template = await Template.findById(source.TemplateID);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: `Template "${source.TemplateName}" not found. Cannot duplicate without a valid template.`,
      });
    }

    // ── Load company ──────────────────────────────────────────────────────────
    const company = await Company.findOne({ is_active: true });
    if (!company) {
      return res.status(404).json({ success: false, message: 'No active company found' });
    }

    // ── Resolve customer ──────────────────────────────────────────────────────
    // body.customer provided → swap customer
    // body.customer omitted  → keep original customer fields from source
    let customerData = {};
    let CustomerType = source.CustomerType || 'Existing';

    if (body.customer) {
      const { type: cType, id: cId, new: cNew } = body.customer;

      if (cType === 'Existing') {
        if (!cId) {
          return res.status(400).json({ success: false, message: 'customer.id is required for Existing customer' });
        }
        const customer = await Customer.findById(cId);
        if (!customer || !customer.is_active) {
          return res.status(404).json({ success: false, message: 'Customer not found or inactive' });
        }
        customerData = _customerFields(customer);
        CustomerType = 'Existing';
        console.log('Customer swapped →', customer.customer_name);

      } else if (cType === 'New') {
        if (!cNew || !cNew.customer_name) {
          return res.status(400).json({ success: false, message: 'customer.new with customer_name is required for New customer' });
        }
        const created = await Customer.create({
          customer_code:   `CUST-${Date.now().toString().slice(-6)}`,
          customer_name:   cNew.customer_name,
          customer_type:   cNew.customer_type   || 'Direct',
          gstin:           cNew.gstin           || undefined,
          pan:             cNew.pan             || '',
          billing_address: cNew.billing_address || {
            line1:      cNew.address    || '',
            city:       cNew.city       || '',
            state:      cNew.state      || '',
            state_code: cNew.state_code || 0,
            pincode:    cNew.pincode    || '',
          },
          contacts: cNew.contact_person ? [{
            name:       cNew.contact_person,
            phone:      cNew.phone || '',
            email:      cNew.email || '',
            is_primary: true,
          }] : [],
          created_by: userId,
        });
        customerData = _customerFields(created);
        CustomerType = 'New';
        console.log('New customer created:', created.customer_name);

      } else {
        return res.status(400).json({ success: false, message: 'customer.type must be "Existing" or "New"' });
      }

    } else {
      // Keep original customer fields from source
      customerData = {
        CustomerID:            source.CustomerID,
        CustomerName:          source.CustomerName,
        CustomerGSTIN:         source.CustomerGSTIN,
        CustomerState:         source.CustomerState,
        CustomerStateCode:     source.CustomerStateCode,
        CustomerAddress:       source.CustomerAddress,
        CustomerCity:          source.CustomerCity,
        CustomerPincode:       source.CustomerPincode,
        CustomerContactPerson: source.CustomerContactPerson,
        CustomerPhone:         source.CustomerPhone,
        CustomerEmail:         source.CustomerEmail,
        CustomerPAN:           source.CustomerPAN,
      };
      console.log('Customer kept from source:', source.CustomerName);
    }

    // ── Deep-copy items (no recalculation — numbers are already correct) ──────
    const clonedItems = source.Items.map((s) => ({
      PartNo:      s.PartNo,
      PartName:    s.PartName,
      Description: s.Description || '',
      HSNCode:     s.HSNCode,
      Unit:        s.Unit || 'Nos',
      Quantity:    s.Quantity,

      drawing_no:   s.drawing_no   || '',
      revision_no:  s.revision_no  || '0',
      rm_grade:     s.rm_grade     || '',
      rm_source:    s.rm_source    || '',
      rm_type:      s.rm_type      || '',
      pitch:        s.pitch        || 0,
      no_of_cavity: s.no_of_cavity || 1,

      rm_rejection_percent:      s.rm_rejection_percent      || 2,
      scrap_realisation_percent: s.scrap_realisation_percent || 85,
      gst_percentage:            s.gst_percentage            || 18,

      Thickness: s.Thickness || 0,
      Width:     s.Width     || 0,
      Length:    s.Length    || 0,

      density:                 s.density                 || 8.96,
      rm_rate:                 s.rm_rate                 || 0,
      profile_conversion_rate: s.profile_conversion_rate || 0,
      total_rm_rate:           s.total_rm_rate           || 0,
      scrap_rate_per_kg:       s.scrap_rate_per_kg       || 0,
      transport_rate_per_kg:   s.transport_rate_per_kg   || 0,

      gross_weight_kg: s.gross_weight_kg || 0,
      net_weight_kg:   s.net_weight_kg   || 0,
      scrap_kgs:       s.scrap_kgs       || 0,

      gross_rm_cost: s.gross_rm_cost || 0,
      scrap_cost:    s.scrap_cost    || 0,
      net_rm_cost:   s.net_rm_cost   || 0,

      Weight: s.Weight || s.gross_weight_kg || 0,
      RMCost: s.RMCost || s.gross_rm_cost   || 0,

      ProcessCost:     s.ProcessCost     || 0,
      OverheadPercent: s.OverheadPercent || 0,
      OverheadAmount:  s.OverheadAmount  || 0,
      MarginPercent:   s.MarginPercent   || 0,
      MarginAmount:    s.MarginAmount    || 0,

      SubCost:   s.SubCost   || 0,
      FinalRate: s.FinalRate || 0,
      Amount:    s.Amount    || 0,
    }));

    // ── Recalculate totals ────────────────────────────────────────────────────
    const gstPct     = source.GSTPercentage || 18;
    const subTotal   = clonedItems.reduce((sum, it) => sum + it.Amount, 0);
    const gstAmount  = subTotal * (gstPct / 100);
    const grandTotal = subTotal + gstAmount;

    const gstType = (customerData.CustomerStateCode || 0) !== (company.state_code || 0)
      ? 'IGST'
      : 'CGST/SGST';

    // ── Dates & remarks ───────────────────────────────────────────────────────
    let validTill = new Date();
    validTill.setDate(validTill.getDate() + 30);
    if (body.valid_till) validTill = new Date(body.valid_till);

    const InternalRemarks = body.remarks?.internal ?? '';
    const CustomerRemarks = body.remarks?.customer ?? '';

    // ── Save new quotation ────────────────────────────────────────────────────
    console.log('\nSaving duplicated quotation...');

    const newQuotation = await Quotation.create({
      CompanyID:        company._id,
      CompanyName:      company.company_name,
      CompanyGSTIN:     company.gstin      || '',
      CompanyState:     company.state      || '',
      CompanyStateCode: company.state_code || 0,

      ...customerData,
      CustomerType,

      TemplateID:   source.TemplateID,
      TemplateName: source.TemplateName,

      Items: clonedItems,

      GSTPercentage: gstPct,
      GSTType:       gstType,
      SubTotal:      parseFloat(subTotal.toFixed(2)),
      GSTAmount:     parseFloat(gstAmount.toFixed(2)),
      GrandTotal:    parseFloat(grandTotal.toFixed(2)),

      ValidTill:       validTill,
      InternalRemarks: InternalRemarks,
      CustomerRemarks: CustomerRemarks,

      TermsConditions: source.TermsConditions || [],

      icc_credit_on_input_days: source.icc_credit_on_input_days,
      icc_wip_fg_days:          source.icc_wip_fg_days,
      icc_credit_given_days:    source.icc_credit_given_days,
      icc_cost_of_capital:      source.icc_cost_of_capital,
      ohp_percent_on_matl:      source.ohp_percent_on_matl,
      ohp_on_labour_pct:        source.ohp_on_labour_pct,
      inspection_cost:          source.inspection_cost,
      tool_maintenance_cost:    source.tool_maintenance_cost,
      packing_cost_per_nos:     source.packing_cost_per_nos,
      plating_cost_per_kg:      source.plating_cost_per_kg,

      Status:    'Draft',
      CreatedBy: userId,
      UpdatedBy: userId,
    });

    console.log('Duplicated as:', newQuotation.QuotationNo);

    // ── Re-create QuotationItemProcess records ────────────────────────────────
    for (let i = 0; i < newQuotation.Items.length; i++) {
      const newItem = newQuotation.Items[i];
      const srcItem = source.Items[i];

      const srcProcesses = await QuotationItemProcess.find({ quotation_item_id: srcItem._id });

      for (const sp of srcProcesses) {
        await QuotationItemProcess.create({
          qip_id:            `QIP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          quotation_item_id: newItem._id,
          process_id:        sp.process_id,
          process_name:      sp.process_name,
          rate_type:         sp.rate_type,
          rate_used:         sp.rate_used,
          calculated_cost:   sp.calculated_cost,
          vendor_id:         sp.vendor_id || null,
          hours:             sp.hours     || 1,
          machine:           sp.machine   || '',
          CreatedBy:         userId,
          UpdatedBy:         userId,
        });
      }
    }
    console.log('QuotationItemProcess records duplicated.');

    // ── Build Excel data ──────────────────────────────────────────────────────
    const itemsWithProcesses = await Promise.all(
      newQuotation.Items.map(async (item) => {
        const procs = await QuotationItemProcess.find({ quotation_item_id: item._id });
        return { ...item.toObject(), processes: procs };
      })
    );

    const quotationDataForExcel = {
      ...newQuotation.toObject(),
      Items: itemsWithProcesses,
    };

    // ── Generate and stream Excel ─────────────────────────────────────────────
    console.log('\nGenerating Excel | engine:', template.formula_engine);

    const workbook    = new ExcelJS.Workbook();
    workbook.creator  = company.company_name || 'QuotationSystem';
    workbook.created  = new Date();
    workbook.modified = new Date();

    generateQuotationExcel(workbook, quotationDataForExcel, template);

    console.log('='.repeat(80));
    console.log('DUPLICATE DONE —', newQuotation.QuotationNo, '(from', source.QuotationNo + ')');
    console.log('='.repeat(80));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${template.template_code}_${newQuotation.QuotationNo}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('\nduplicateQuotation ERROR:', err.name, '-', err.message);
    console.error(err.stack);

    if (err.name === 'ValidationError') {
      const msgs = Object.values(err.errors).map(v => v.message);
      return res.status(400).json({ success: false, message: msgs.join(', ') });
    }
    if (err.message?.toLowerCase().includes('not found')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ID format: ' + err.message });
    }
    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD QUOTATION AS ANY TEMPLATE
// GET /quotations/:id/download?template_id=<id>
//
// Takes an EXISTING saved quotation and re-renders its stored costing data
// through ANY template the user selects — without touching the DB record.
//
// Use cases:
//   • Same quotation → busbar template for internal review
//   • Same quotation → landed_cost template for customer presentation
//   • Same quotation → cost_breakup template for costing audit
//
// The quotation data is NOT recalculated. All numbers (FinalRate, Amount,
// ProcessCost etc.) come directly from the stored Items[]. Only the Excel
// layout/engine changes.
//
// Query params:
//   template_id  (required) — ObjectId of the target Template
// ─────────────────────────────────────────────────────────────────────────────
const downloadQuotationAsTemplate = async (req, res) => {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('DOWNLOAD AS TEMPLATE —', new Date().toISOString());
    console.log('Quotation ID:', req.params.id);
    console.log('Template ID :', req.query.template_id);
    console.log('='.repeat(80));

    const { template_id } = req.query;

    if (!template_id) {
      return res.status(400).json({
        success: false,
        message: 'template_id query parameter is required',
      });
    }

    // ── Load quotation ────────────────────────────────────────────────────────
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation || !quotation.IsActive) {
      return res.status(404).json({ success: false, message: 'Quotation not found' });
    }
    console.log('Quotation:', quotation.QuotationNo);

    // ── Load the TARGET template (can be different from quotation's own template) ──
    const targetTemplate = await Template.findById(template_id);
    if (!targetTemplate || !targetTemplate.is_active) {
      return res.status(404).json({ success: false, message: 'Target template not found or inactive' });
    }
    console.log('Target template:', targetTemplate.template_name, '| engine:', targetTemplate.formula_engine);

    // ── Load company (needed for header info in Excel) ────────────────────────
    const company = await Company.findOne({ is_active: true });
    if (!company) {
      return res.status(404).json({ success: false, message: 'No active company found' });
    }

    // ── Attach QuotationItemProcess records to each item ──────────────────────
    // The Excel generators need the full processes[] array on each item
    const itemsWithProcesses = await Promise.all(
      quotation.Items.map(async (item) => {
        const procs = await QuotationItemProcess
          .find({ quotation_item_id: item._id })
          .populate('process_id', 'process_name rate_type');
        return { ...item.toObject(), processes: procs };
      })
    );

    // ── Build the data object the Excel generator expects ─────────────────────
    const quotationDataForExcel = {
      ...quotation.toObject(),
      Items: itemsWithProcesses,
    };

    // ── Generate Excel using the TARGET template's engine ─────────────────────
    const workbook    = new ExcelJS.Workbook();
    workbook.creator  = company.company_name || 'QuotationSystem';
    workbook.created  = new Date();
    workbook.modified = new Date();

    generateQuotationExcel(workbook, quotationDataForExcel, targetTemplate);

    console.log('='.repeat(80));
    console.log('DONE — streamed', quotation.QuotationNo, 'as', targetTemplate.template_code);
    console.log('='.repeat(80));

    // filename = <target_template_code>_<quotation_no>.xlsx
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${targetTemplate.template_code}_${quotation.QuotationNo}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('\ndownloadQuotationAsTemplate ERROR:', err.name, '-', err.message);
    console.error(err.stack);

    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ID format: ' + err.message });
    }
    if (err.message?.toLowerCase().includes('not found')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getQuotations,
  getQuotationTemplates,
  getQuotationsByTemplate,
  getQuotation,
  createQuotation,
  duplicateQuotation,
  downloadQuotationAsTemplate,
};