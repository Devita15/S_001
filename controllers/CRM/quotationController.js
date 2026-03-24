'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// quotationController.js  (UPDATED - Embedded Processes)
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');

const Quotation = require('../../models/CRM/Quotation');
// Remove: const QuotationItemProcess = require('../../models/CRM/QuotationItemProcess');
const Company = require('../../models/user\'s & setting\'s/Company');
const Customer = require('../../models/CRM/Customer');
const Item = require('../../models/CRM/Item');
const RawMaterial = require('../../models/CRM/RawMaterial');
const Process = require('../../models/CRM/Process');
const Tax = require('../../models/CRM/Tax');
const TermsCondition = require('../../models/CRM/TermsCondition');
const Template = require('../../models/CRM/Template');
const DimensionWeight = require('../../models/CRM/DimensionWeight');

const { generateQuotationExcel } = require('../../utils/excelGenerators');
const { calculateItem } = require('../../utils/quotationCalculators');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const ok = (res, data, code = 200) => res.status(code).json({ success: true, ...data });
const err = (res, msg, code = 500) => res.status(code).json({ success: false, message: msg });

function customerFields(customer) {
  const contact = customer.contacts?.find(c => c.is_primary) ?? customer.contacts?.[0] ?? {};
  const addr = customer.billing_address ?? {};
  return {
    CustomerID: customer._id,
    CustomerName: customer.customer_name,
    CustomerGSTIN: customer.gstin || '',
    CustomerState: addr.state || '',
    CustomerStateCode: addr.state_code || 0,
    CustomerAddress: [addr.line1, addr.line2].filter(Boolean).join(', '),
    CustomerCity: addr.city || '',
    CustomerPincode: addr.pincode || '',
    CustomerContactPerson: contact.name || '',
    CustomerPhone: contact.mobile || contact.phone || '',
    CustomerEmail: contact.email || '',
    CustomerPAN: customer.pan || '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP: load all masters needed for one item and compute full costing
// ─────────────────────────────────────────────────────────────────────────────
async function buildCostItem(reqItem, template, userId) {
  const partNo = (reqItem.PartNo || reqItem.part_no || '').toUpperCase();
  if (!partNo) throw new Error('part_no is required on each item');

  // ── Item master ────────────────────────────────────────────────────────────
  const itemMaster = await Item.findOne({ part_no: partNo, is_active: true });
  if (!itemMaster) throw new Error(`Item "${partNo}" not found in Item master`);

  // ── DimensionWeight master ─────────────────────────────────────────────────
  const dim = await DimensionWeight.findOne({ PartNo: partNo }).sort({ createdAt: -1 });
  if (!dim) throw new Error(`DimensionWeight record not found for "${partNo}"`);

  // ── RawMaterial master ────────────────────────────────────────────────────
  const rawMat = await RawMaterial.findOne({
    Grade: { $regex: new RegExp(`^${itemMaster.rm_grade.trim()}$`, 'i') },
    IsActive: true,
  });
  if (!rawMat) throw new Error(`Raw material not found for grade "${itemMaster.rm_grade}"`);

  // ── Tax master ─────────────────────────────────────────────────────────────
  const taxRec = await Tax.findOne({ HSNCode: itemMaster.hsn_code, IsActive: true });
  const gstForItem = taxRec ? taxRec.GSTPercentage : 18;

  // ── Process costs ──────────────────────────────────────────────────────────
  const processCosts = [];
  let totalProcessCost = 0;

  for (const pd of (reqItem.processes || [])) {
    const proc = await Process.findById(pd.process_id);
    if (!proc) throw new Error(`Process not found: ${pd.process_id}`);

    const rateEntered = pd.rate_per_hour ?? pd.rate_entered ?? 0;
    let cost = 0;
    const grossWt = (dim.Thickness || 0) * (dim.Width || 0) * (dim.Length || 0) * (itemMaster.density || 8.93) / 1_000_000;
    switch (proc.rate_type) {
      case 'Per Nos': cost = rateEntered; break;
      case 'Per Kg': cost = rateEntered * grossWt; break;
      case 'Per Hour': cost = rateEntered * (pd.hours || 1); break;
      default: cost = rateEntered;
    }
    totalProcessCost += cost;
    processCosts.push({
      process_id: proc._id,
      process_name: proc.process_name,
      rate_type: proc.rate_type,
      rate_used: rateEntered,
      calculated_cost: +cost.toFixed(4),
      hours: pd.hours || 1,
      machine: pd.machine || '',
      vendor_id: pd.outsourced_vendor_id || null,
    });
  }

  // ── Assemble raw item object for calculator ────────────────────────────────
  const cp = reqItem.costing_parameters || {};
  const rawOhp = cp.ohp_percent_on_material ?? reqItem.OverheadPercent ?? 0;
  const rawMargin = cp.margin_percent ?? reqItem.MarginPercent ?? 0;

  const rawItemObj = {
    // identity
    PartNo: partNo,
    PartName: itemMaster.part_description,
    Description: '',
    HSNCode: itemMaster.hsn_code,
    Unit: itemMaster.unit || 'Nos',
    Quantity: reqItem.Quantity || reqItem.quantity || 1,
    drawing_no: itemMaster.drawing_no || '',
    revision_no: String(itemMaster.revision_no ?? '0'),
    rm_grade: itemMaster.rm_grade || '',
    rm_source: itemMaster.rm_source || '',
    rm_type: itemMaster.rm_type || '',
    no_of_cavity: itemMaster.no_of_cavity || 1,
    strip_width: dim.Width || 0,
    // dimensions
    Thickness: dim.Thickness || 0,
    Width: dim.Width || 0,
    Length: dim.Length || 0,
    pitch: itemMaster.pitch || dim.Length || 0,
    // material
    density: itemMaster.density || 8.93,
    rm_rate: rawMat.RatePerKG || 0,
    profile_conversion_rate: rawMat.profile_conversion_rate || 0,
    scrap_rate_per_kg: rawMat.scrap_rate_per_kg || 0,
    transport_rate_per_kg: rawMat.transport_rate_per_kg || 0,
    rm_rejection_percent: itemMaster.rm_rejection_percent || 2,
    scrap_realisation_percent: itemMaster.scrap_realisation_percent || 85,
    // cost params
    gst_percentage: gstForItem,
    net_weight_kg: dim.WeightInKG || 0,
    OverheadPercent: rawOhp > 1 ? rawOhp : rawOhp * 100,
    MarginPercent: rawMargin > 1 ? rawMargin : rawMargin * 100,
    // override per-item ICC params if provided
    icc_credit_on_input_days: cp.icc_credit_on_input_days ?? null,
    icc_wip_fg_days: cp.icc_wip_fg_days ?? null,
    icc_credit_given_days: cp.icc_credit_given_days ?? null,
    icc_cost_of_capital: cp.icc_cost_of_capital ?? null,
    ohp_percent_on_matl: cp.ohp_percent_on_material ?? null,
    ohp_on_labour_pct: cp.ohp_percent_on_labour ?? null,
    packing_cost_per_nos: cp.packing_cost_per_nos ?? null,
    inspection_cost: cp.inspection_cost_per_nos ?? null,
    tool_maintenance_cost: cp.tool_maintenance_cost_per_nos ?? null,
    plating_cost_per_kg: cp.plating_cost_per_kg ?? null,
    // extra fields for laser_fabrication engine
    path_length_sq_mm: reqItem.path_length_sq_mm || 0,
    laser_rate_per_sq_mm: reqItem.laser_rate_per_sq_mm || 0,
    start_points: reqItem.start_points || 0,
    start_point_rate: reqItem.start_point_rate || 0,
    flatning_cost: reqItem.flatning_cost || 0,
    drilling_cost: reqItem.drilling_cost || 0,
    tapping_cost: reqItem.tapping_cost || 0,
    csk_cost: reqItem.csk_cost || 0,
    bending_cost: reqItem.bending_cost || 0,
    fabrication_cost: reqItem.fabrication_cost || 0,
    // processes resolved above (embedded)
    processes: processCosts,
    ProcessCost: +totalProcessCost.toFixed(4),
    // for part_wise / nomex
    conversion_cost: reqItem.conversion_cost || totalProcessCost || 0,
    wastage_pct: reqItem.wastage_pct || 0,
    fabrication_cost_override: reqItem.fabrication_cost_override || 0,
    dev_cost_per_pc: reqItem.dev_cost_per_pc || 0,
    pf_pct: reqItem.pf_pct || 5,
    sheet_no: reqItem.sheet_no || 1,
  };

  // Run calculation engine
  const costed = calculateItem(rawItemObj, template);
  return { costed, processCosts };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /quotations  → CREATE QUOTATION + STREAM EXCEL
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// POST /quotations  → CREATE QUOTATION + STREAM EXCEL
// ─────────────────────────────────────────────────────────────────────────────
const createQuotation = async (req, res) => {
  try {
    const userId = req.user._id;
    const body = req.body;

    // Normalise input
    const CustomerType = body.customer?.type || body.CustomerType || 'Existing';
    const CustomerIDRaw = body.customer?.id || body.CustomerID;
    const NewCustomer = body.customer?.new || body.NewCustomer;
    const TemplateID = body.template_id || body.TemplateID;
    const ValidTill = body.valid_till || body.ValidTill;
    const InternalRemarks = body.remarks?.internal || body.InternalRemarks || '';
    const CustomerRemarks = body.remarks?.customer || body.CustomerRemarks || '';
    const GSTPercentage = body.financials?.gst_percentage ?? body.GSTPercentage ?? 18;
    const rawItems = body.items || body.Items || [];

    if (!TemplateID) return err(res, 'template_id is required', 400);
    if (!rawItems.length) return err(res, 'items[] is required', 400);

    // Load masters
    const [company, template, terms] = await Promise.all([
      Company.findOne({ is_active: true }),
      Template.findById(TemplateID),
      TermsCondition.find({ IsActive: true }).sort({ Sequence: 1 }).select('Title Description Sequence'),
    ]);
    if (!company) return err(res, 'No active company found', 404);
    if (!template) return err(res, 'Template not found', 404);

    // Resolve customer
    let custData = {}, CustomerTypeSaved = CustomerType;
    if (CustomerType === 'Existing') {
      if (!CustomerIDRaw) return err(res, 'customer.id required', 400);
      const cust = await Customer.findById(CustomerIDRaw);
      if (!cust || !cust.is_active) return err(res, 'Customer not found', 404);
      custData = customerFields(cust);
    } else {
      if (!NewCustomer?.customer_name) return err(res, 'customer.new.customer_name required', 400);
      if (!NewCustomer?.billing_address) return err(res, 'customer.new.billing_address required', 400);
      const created = await Customer.create({
        customer_code: `CUST-${Date.now().toString().slice(-6)}`,
        customer_name: NewCustomer.customer_name,
        customer_type: NewCustomer.customer_type || 'Direct',
        gstin: NewCustomer.gstin || undefined,
        billing_address: NewCustomer.billing_address,
        contacts: NewCustomer.contact_person ? [{ name: NewCustomer.contact_person, email: NewCustomer.email || '', is_primary: true }] : [],
        created_by: userId,
      });
      custData = customerFields(created);
    }

    // Process all items - Build items with embedded processes
    const processedItems = [];
    for (const reqItem of rawItems) {
      const { costed } = await buildCostItem(reqItem, template, userId);
      
      // Ensure processes have all required fields
      // The buildCostItem already adds process_name and rate_type from the Process master
      // But let's add a fallback just in case
      if (costed.processes && costed.processes.length > 0) {
        costed.processes = costed.processes.map(proc => ({
          ...proc,
          process_name: proc.process_name || 'Unknown Process',
          rate_type: proc.rate_type || 'Per Hour'
        }));
      }
      
      processedItems.push(costed);
    }

    // Quotation totals
    const subTotal = +processedItems.reduce((s, i) => s + (i.Amount || 0), 0).toFixed(2);
    const gstAmt = +(subTotal * (GSTPercentage / 100)).toFixed(2);
    const grandTotal = +(subTotal + gstAmt).toFixed(2);
    const gstType = custData.CustomerStateCode !== company.state_code ? 'IGST' : 'CGST/SGST';

    // Handle ValidTill
    let validTillDate = ValidTill ? new Date(ValidTill) : null;
    if (!validTillDate) {
      validTillDate = new Date();
      validTillDate.setDate(validTillDate.getDate() + 30);
    }

    // Save quotation (processes are already embedded in items)
    const quotation = await Quotation.create({
      CompanyID: company._id,
      CompanyName: company.company_name,
      CompanyGSTIN: company.gstin || '',
      CompanyState: company.state || '',
      CompanyStateCode: company.state_code || 0,
      ...custData,
      CustomerType: CustomerTypeSaved,
      TemplateID,
      TemplateName: template.template_name,
      Items: processedItems,  // ← Contains embedded processes with all required fields
      GSTPercentage,
      GSTType: gstType,
      SubTotal: subTotal,
      GSTAmount: gstAmt,
      GrandTotal: grandTotal,
      ValidTill: validTillDate,
      InternalRemarks,
      CustomerRemarks,
      TermsConditions: terms,
      icc_credit_on_input_days: body.icc?.credit_on_input_days ?? -30,
      icc_wip_fg_days: body.icc?.wip_fg_days ?? 30,
      icc_credit_given_days: body.icc?.credit_to_customer_days ?? 45,
      icc_cost_of_capital: body.icc?.cost_of_capital ?? 0.10,
      ohp_percent_on_matl: body.icc?.ohp_percent_on_matl ?? 0.10,
      ohp_on_labour_pct: body.icc?.ohp_on_labour_pct ?? 0.15,
      inspection_cost: body.icc?.inspection_cost ?? 0.2,
      tool_maintenance_cost: body.icc?.tool_maintenance_cost ?? 0.2,
      packing_cost_per_nos: body.icc?.packing_cost_per_nos ?? 5,
      plating_cost_per_kg: body.icc?.plating_cost_per_kg ?? 70,
      CreatedBy: userId,
      UpdatedBy: userId,
    });

    // Build data for Excel
    const qDataForExcel = { ...quotation.toObject() };

    // Generate + stream Excel
    const wb = new ExcelJS.Workbook();
    wb.creator = company.company_name || 'QuotationSystem';
    wb.created = new Date();
    generateQuotationExcel(wb, qDataForExcel, template);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${template.template_code}_${quotation.QuotationNo}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();

  } catch (e) {
    console.error('createQuotation ERROR:', e.message);
    console.error('Stack:', e.stack);
    if (e.name === 'ValidationError') {
      const errors = Object.values(e.errors).map(v => v.message).join(', ');
      return err(res, errors, 400);
    }
    if (e.message?.toLowerCase().includes('not found')) return err(res, e.message, 404);
    return err(res, e.message || 'Server error');
  }
};
// ─────────────────────────────────────────────────────────────────────────────
// POST /quotations/item-cost  → LIVE COST PREVIEW (no DB save)
// ─────────────────────────────────────────────────────────────────────────────
const calculateItemCost = async (req, res) => {
  try {
    const { template_id, ...reqItem } = req.body;
    const template = template_id ? await Template.findById(template_id) : null;
    const { costed } = await buildCostItem(reqItem, template, req.user._id);
    ok(res, { data: costed });
  } catch (e) {
    if (e.message?.includes('not found')) return err(res, e.message, 404);
    return err(res, e.message || 'Calculation error', 400);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /quotations
// ─────────────────────────────────────────────────────────────────────────────
const getQuotations = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, customerId, templateId, search, startDate, endDate, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const q = { IsActive: true };
    if (status) q.Status = status;
    if (customerId) q.CustomerID = customerId;
    if (templateId) q.TemplateID = templateId;
    if (search) q.$or = [{ QuotationNo: new RegExp(search, 'i') }, { CustomerName: new RegExp(search, 'i') }];
    if (startDate || endDate) {
      q.QuotationDate = {};
      if (startDate) q.QuotationDate.$gte = new Date(startDate);
      if (endDate) q.QuotationDate.$lte = new Date(endDate);
    }
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const lim = parseInt(limit);
    const [quotations, total, stats] = await Promise.all([
      Quotation.find(q).populate('CustomerID', 'customer_name customer_code').populate('TemplateID', 'template_name template_code formula_engine').sort(sort).skip(skip).limit(lim),
      Quotation.countDocuments(q),
      Quotation.aggregate([{ $match: { IsActive: true } }, { $group: { _id: null, total: { $sum: 1 }, totalAmt: { $sum: '$GrandTotal' }, draft: { $sum: { $cond: [{ $eq: ['$Status', 'Draft'] }, 1, 0] } }, sent: { $sum: { $cond: [{ $eq: ['$Status', 'Sent'] }, 1, 0] } }, approved: { $sum: { $cond: [{ $eq: ['$Status', 'Approved'] }, 1, 0] } } } }]),
    ]);
    ok(res, { data: quotations, pagination: { page: parseInt(page), totalPages: Math.ceil(total / lim), total, limit: lim }, statistics: stats[0] || {} });
  } catch (e) { return err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /quotations/templates
// ─────────────────────────────────────────────────────────────────────────────
const getQuotationTemplates = async (_req, res) => {
  try {
    const templates = await Template.find({ is_active: true }).sort({ template_name: 1 })
      .select('_id template_code template_name formula_engine excel_layout default_margin_percent description');
    ok(res, { count: templates.length, data: templates });
  } catch (e) { return err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /quotations/:id
// ─────────────────────────────────────────────────────────────────────────────
const getQuotation = async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id)
      .populate('CustomerID', 'customer_name billing_address gstin pan contacts')
      .populate('TemplateID', 'template_name template_code formula_engine columns')
      .populate('CreatedBy', 'Username Email');
    if (!q) return err(res, 'Quotation not found', 404);

    ok(res, { data: q });
  } catch (e) {
    if (e.name === 'CastError') return err(res, 'Invalid ID', 400);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /quotations/:id/revise
// ─────────────────────────────────────────────────────────────────────────────
const reviseQuotation = async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id);
    if (!q || !q.IsActive) return err(res, 'Quotation not found', 404);
    if (q.Status === 'Cancelled') return err(res, 'Cannot revise a Cancelled quotation', 400);

    q.revision_history = q.revision_history || [];
    q.revision_history.push({
      revision_no: q.revision_no || 0,
      revised_at: new Date(),
      reason: req.body.reason || '',
      changed_by: req.user._id,
      items_snapshot: q.Items,
    });
    q.revision_no = (q.revision_no || 0) + 1;
    q.Status = 'Draft';
    q.UpdatedBy = req.user._id;
    await q.save();
    ok(res, { data: q, message: `Revision ${q.revision_no} created` });
  } catch (e) { return err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /quotations/:id/send  → generate Excel + email
// ─────────────────────────────────────────────────────────────────────────────
const sendQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation || !quotation.IsActive) return err(res, 'Quotation not found', 404);
    if (quotation.Status === 'Cancelled') return err(res, 'Cannot send a Cancelled quotation', 400);

    const [company, template] = await Promise.all([
      Company.findOne({ is_active: true }),
      Template.findById(quotation.TemplateID),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = company?.company_name || '';
    generateQuotationExcel(wb, { ...quotation.toObject() }, template || { formula_engine: 'busbar', template_code: 'QT' });

    // Write to buffer
    const buffer = await wb.xlsx.writeBuffer();

    // Send email if CustomerEmail present
    if (quotation.CustomerEmail && process.env.SMTP_HOST) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: `${company?.company_name || 'Sales'} <${process.env.SMTP_USER}>`,
        to: quotation.CustomerEmail,
        subject: `Quotation ${quotation.QuotationNo} from ${company?.company_name || ''}`,
        html: `<p>Dear ${quotation.CustomerContactPerson || 'Sir/Madam'},</p>
                      <p>Please find enclosed our quotation <strong>${quotation.QuotationNo}</strong> dated ${new Date(quotation.QuotationDate).toLocaleDateString()}.</p>
                      <p>This quotation is valid until ${new Date(quotation.ValidTill).toLocaleDateString()}.</p>
                      <p>Please do not hesitate to contact us for any clarifications.</p>
                      <p>Regards,<br/>${company?.company_name || ''}</p>`,
        attachments: [{ filename: `${quotation.QuotationNo}.xlsx`, content: buffer }],
      });
    }

    quotation.SentAt = new Date();
    quotation.Status = 'Sent';
    quotation.UpdatedBy = req.user._id;
    if (!quotation.email_log) quotation.email_log = [];
    quotation.email_log.push({ sent_at: new Date(), sent_to: quotation.CustomerEmail, sent_by: req.user._id, status: 'sent' });
    await quotation.save();

    // Stream Excel back as well
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${quotation.QuotationNo}.xlsx"`);
    res.send(buffer);
  } catch (e) { return err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /quotations/:id/approve  (Manager only)
// ─────────────────────────────────────────────────────────────────────────────
const approveQuotation = async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id);
    if (!q || !q.IsActive) return err(res, 'Quotation not found', 404);
    if (!['Sent', 'Under Review'].includes(q.Status)) return err(res, `Cannot approve from status ${q.Status}`, 400);
    q.Status = 'Approved';
    q.ApprovedAt = new Date();
    q.UpdatedBy = req.user._id;
    await q.save();
    ok(res, { data: q, message: 'Quotation approved — Sales Order creation triggered' });
  } catch (e) { return err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /quotations/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
const rejectQuotation = async (req, res) => {
  try {
    const q = await Quotation.findById(req.params.id);
    if (!q || !q.IsActive) return err(res, 'Quotation not found', 404);
    if (!req.body.rejection_reason) return err(res, 'rejection_reason is required', 400);
    q.Status = 'Rejected';
    q.rejection_reason = req.body.rejection_reason;
    q.UpdatedBy = req.user._id;
    await q.save();
    ok(res, { data: q });
  } catch (e) { return err(res, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /quotations/:id/duplicate
// ─────────────────────────────────────────────────────────────────────────────
const duplicateQuotation = async (req, res) => {
  try {
    const source = await Quotation.findById(req.params.id);
    if (!source || !source.IsActive) return err(res, 'Source quotation not found', 404);
    const template = await Template.findById(source.TemplateID);
    const company = await Company.findOne({ is_active: true });
    if (!company) return err(res, 'No active company', 404);

    let custData = {}, CustomerType = source.CustomerType || 'Existing';
    if (req.body.customer) {
      const { type: ct, id: ci } = req.body.customer;
      if (ct === 'Existing') {
        const cust = await Customer.findById(ci);
        if (!cust) return err(res, 'Customer not found', 404);
        custData = customerFields(cust);
        CustomerType = 'Existing';
      }
    } else {
      custData = {
        CustomerID: source.CustomerID, CustomerName: source.CustomerName, CustomerGSTIN: source.CustomerGSTIN,
        CustomerState: source.CustomerState, CustomerStateCode: source.CustomerStateCode,
        CustomerAddress: source.CustomerAddress, CustomerCity: source.CustomerCity, CustomerPincode: source.CustomerPincode,
        CustomerContactPerson: source.CustomerContactPerson, CustomerPhone: source.CustomerPhone,
        CustomerEmail: source.CustomerEmail, CustomerPAN: source.CustomerPAN
      };
    }

    const vt = new Date();
    vt.setDate(vt.getDate() + 30);
    const clonedItems = source.Items.map(s => ({ ...s.toObject(), _id: undefined }));
    const gstType = (custData.CustomerStateCode || 0) !== (company.state_code || 0) ? 'IGST' : 'CGST/SGST';
    const subTotal = +clonedItems.reduce((s, i) => s + (i.Amount || 0), 0).toFixed(2);
    const gstAmt = +(subTotal * (source.GSTPercentage / 100)).toFixed(2);
    const grandTotal = +(subTotal + gstAmt).toFixed(2);

    const newQ = await Quotation.create({
      CompanyID: source.CompanyID, CompanyName: source.CompanyName,
      CompanyGSTIN: source.CompanyGSTIN, CompanyState: source.CompanyState, CompanyStateCode: source.CompanyStateCode,
      ...custData, CustomerType,
      TemplateID: source.TemplateID, TemplateName: source.TemplateName,
      Items: clonedItems, GSTPercentage: source.GSTPercentage, GSTType: gstType,
      SubTotal: subTotal, GSTAmount: gstAmt, GrandTotal: grandTotal,
      ValidTill: req.body.valid_till ? new Date(req.body.valid_till) : vt,
      InternalRemarks: '', CustomerRemarks: '',
      TermsConditions: source.TermsConditions,
      icc_credit_on_input_days: source.icc_credit_on_input_days,
      icc_wip_fg_days: source.icc_wip_fg_days, icc_credit_given_days: source.icc_credit_given_days,
      icc_cost_of_capital: source.icc_cost_of_capital, ohp_percent_on_matl: source.ohp_percent_on_matl,
      Status: 'Draft', CreatedBy: req.user._id, UpdatedBy: req.user._id,
    });

    // Stream Excel
    const wb = new ExcelJS.Workbook();
    wb.creator = company.company_name || '';
    generateQuotationExcel(wb, { ...newQ.toObject() }, template || { formula_engine: 'busbar', template_code: 'QT' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${template?.template_code || 'QT'}_${newQ.QuotationNo}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('duplicateQuotation ERROR:', e.message);
    return err(res, e.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /quotations/:id/download?template_id=<id>  → re-render any template
// ─────────────────────────────────────────────────────────────────────────────
const downloadQuotationAsTemplate = async (req, res) => {
  try {
    const { template_id } = req.query;
    if (!template_id) return err(res, 'template_id query param required', 400);
    const [quotation, targetTemplate, company] = await Promise.all([
      Quotation.findById(req.params.id),
      Template.findById(template_id),
      Company.findOne({ is_active: true }),
    ]);
    if (!quotation || !quotation.IsActive) return err(res, 'Quotation not found', 404);
    if (!targetTemplate || !targetTemplate.is_active) return err(res, 'Template not found', 404);
    if (!company) return err(res, 'No active company', 404);

    const wb = new ExcelJS.Workbook();
    wb.creator = company.company_name || '';
    generateQuotationExcel(wb, { ...quotation.toObject() }, targetTemplate);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${targetTemplate.template_code}_${quotation.QuotationNo}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { return err(res, e.message); }
};

module.exports = {
  getQuotations,
  getQuotationTemplates,
  getQuotation,
  createQuotation,
  duplicateQuotation,
  downloadQuotationAsTemplate,
  reviseQuotation,
  sendQuotation,
  approveQuotation,
  rejectQuotation,
  calculateItemCost,
};