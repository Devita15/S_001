'use strict';
const fs        = require('fs');
const mongoose  = require('mongoose');
const { Lead }  = require('../../models/CRM/Lead');
const Customer  = require('../../models/CRM/Customer');

// runFeasibilityCheck — pure async function, no express handler, no circular require
const { runFeasibilityCheck } = require('../CRM/Feasibilitycheckcontroller');
const { auditEntry, diffAudit } = require('../../utils/audit');


const AUDIT_FIELDS = [
  'subject', 'company_name', 'contact_name', 'contact_email', 'contact_phone',
  'contact_mobile', 'assigned_to', 'priority', 'estimated_value',
  'expected_close_date', 'next_follow_up_date', 'lead_source_detail',
];

const err404 = (res) => res.status(404).json({ success: false, message: 'Lead not found' });
const err500 = (res, e) => res.status(500).json({ success: false, message: e.message });


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leads
// ─────────────────────────────────────────────────────────────────────────────
exports.createLead = async (req, res) => {
  try {
    const lead = await Lead.create({ ...req.body, created_by: req.user._id });
    res.status(201).json({ success: true, data: lead });
  } catch (e) {
    err500(res, e);
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leads
// Filters: status, assigned_to, lead_source, priority, company_name,
//          contact_email, contact_mobile, tags, feasibility_status,
//          from_date, to_date, is_overdue, is_converted
// Pagination: page, limit, sort
// ─────────────────────────────────────────────────────────────────────────────
exports.getLeads = async (req, res) => {
  try {
    const {
      status, assigned_to, lead_source, priority, company_name,
      contact_email, contact_mobile, tags, feasibility_status,
      from_date, to_date, is_overdue, is_converted,
      page = 1, limit = 20, sort = '-createdAt',
    } = req.query;

    const f = { is_active: true };

    if (status)             f.status             = status;
    if (assigned_to)        f.assigned_to        = assigned_to;
    if (lead_source)        f.lead_source        = lead_source;
    if (priority)           f.priority           = priority;
    if (feasibility_status) f.feasibility_status = feasibility_status;
    if (contact_email)      f.contact_email      = { $regex: contact_email, $options: 'i' };
    if (contact_mobile)     f.contact_mobile     = { $regex: contact_mobile, $options: 'i' };
    if (is_converted !== undefined) f.is_converted = is_converted === 'true';

    if (tags) f.tags = { $in: tags.split(',').map(t => t.trim()) };

    if (company_name) {
      f.$or = [
        { company_name: { $regex: company_name, $options: 'i' } },
        { contact_name: { $regex: company_name, $options: 'i' } },
        { subject:      { $regex: company_name, $options: 'i' } },
      ];
    }

    if (from_date || to_date) {
      f.createdAt = {};
      if (from_date) f.createdAt.$gte = new Date(from_date);
      if (to_date)   f.createdAt.$lte = new Date(to_date);
    }

    if (is_overdue === 'true') {
      f.next_follow_up_date = { $lt: new Date() };
      f.status = { $nin: ['Won', 'Lost', 'Junk'] };
    }

    const pg   = Math.max(parseInt(page), 1);
    const lim  = Math.min(parseInt(limit), 100);
    const skip = (pg - 1) * lim;

    const [data, total] = await Promise.all([
      Lead.find(f)
        .populate('assigned_to', 'first_name last_name email')
        .select('-audit_log -follow_ups')
        .sort(sort).skip(skip).limit(lim)
        .lean({ virtuals: true }),
      Lead.countDocuments(f),
    ]);

    res.json({
      success: true, data,
      pagination: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) },
    });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leads/:id
// ─────────────────────────────────────────────────────────────────────────────
exports.getLeadById = async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, is_active: true })
      .populate('assigned_to',            'first_name last_name email')
      .populate('customer_id',            'customer_id customer_code customer_name gstin')
      .populate('feasibility_checked_by', 'first_name last_name')
      .populate('follow_ups.done_by',     'first_name last_name');

    if (!lead) return err404(res);
    res.json({ success: true, data: lead });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/leads/:id
// ─────────────────────────────────────────────────────────────────────────────
exports.updateLead = async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, is_active: true });
    if (!lead) return err404(res);

    const entries = diffAudit(req.user._id, lead, req.body, AUDIT_FIELDS);
    Object.assign(lead, req.body);
    if (entries.length) lead.audit_log.push(...entries);
    lead.updated_by = req.user._id;

    await lead.save();
    res.json({ success: true, data: lead });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/leads/:id  (soft-delete)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, is_active: true },
      {
        is_active: false, updated_by: req.user._id,
        $push: { audit_log: auditEntry(req.user._id, 'is_active', true, false) },
      },
      { new: true }
    );
    if (!lead) return err404(res);
    res.json({ success: true, message: 'Lead deactivated' });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/leads/:id/status  (state-machine enforced)
// ─────────────────────────────────────────────────────────────────────────────
exports.updateStatus = async (req, res) => {
  try {
    const { status, lost_reason, lost_to = '', win_remarks = '' } = req.body;

    const lead = await Lead.findOne({ _id: req.params.id, is_active: true });
    if (!lead) return err404(res);

    if (!Lead.isValidTransition(lead.status, status)) {
      return res.status(400).json({
        success:    false,
        message:    `Invalid transition: ${lead.status} → ${status}`,
        valid_next: Lead.validNextStatuses(lead.status),
      });
    }

    const old = lead.status;
    lead.status = status;

    if (status === 'Won')  lead.win_remarks = win_remarks;
    if (status === 'Lost') { lead.lost_reason = lost_reason || ''; lead.lost_to = lost_to; }

    lead.audit_log.push(auditEntry(req.user._id, 'status', old, status));
    lead.updated_by = req.user._id;
    await lead.save();

    res.json({ success: true, data: lead });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leads/:id/followup
// ─────────────────────────────────────────────────────────────────────────────
exports.addFollowUp = async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, is_active: true });
    if (!lead) return err404(res);

    lead.follow_ups.push({ ...req.body, done_by: req.user._id });

    if (req.body.next_action_date) {
      lead.next_follow_up_date = new Date(req.body.next_action_date);
    }

    lead.updated_by = req.user._id;
    await lead.save();

    res.json({ success: true, data: lead.follow_ups });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leads/:id/drawing
// ─────────────────────────────────────────────────────────────────────────────
exports.uploadDrawing = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const lead = await Lead.findOne({ _id: req.params.id, is_active: true });
    if (!lead) {
      fs.unlinkSync(req.file.path);
      return err404(res);
    }

    const { drawing_no = '', revision_no = 'A', remarks = '' } = req.body;

    if (drawing_no) {
      lead.drawings
        .filter(d => d.drawing_no === drawing_no.toUpperCase())
        .forEach(d => { d.is_latest = false; });
    }

    lead.drawings.push({
      drawing_no:   drawing_no.toUpperCase() || `DWG-${Date.now()}`,
      file_name:    req.file.originalname,
      file_path:    req.file.path,
      file_size_kb: Math.round(req.file.size / 1024),
      mime_type:    req.file.mimetype,
      revision_no:  revision_no.toUpperCase(),
      is_latest:    true,
      uploaded_by:  req.user._id,
      remarks,
    });

    lead.updated_by = req.user._id;
    await lead.save();

    res.status(201).json({
      success:       true,
      data:          lead.drawings.filter(d => d.is_latest),
      all_revisions: lead.drawings.filter(d => d.drawing_no === drawing_no.toUpperCase()),
    });
  } catch (e) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    err500(res, e);
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leads/:id/feasibility-check
// Layer 1 — System Auto-Check
//
// Fetches the lead, passes it to runFeasibilityCheck (pure function from
// feasibilityCheckController), sends the result back.
// No mock req/res, no circular require, no inline require().
// ─────────────────────────────────────────────────────────────────────────────
exports.getFeasibilityCheck = async (req, res) => {
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
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leads/:id/feasibility
// Layer 2 — Production Manual Confirm / Override
// Role: Production | Manager | Admin
//
// 1. Fetches lead (full document for save)
// 2. Runs Layer 1 auto-check via runFeasibilityCheck (pure function, top-level import)
// 3. Saves production decision to lead
// 4. Returns saved lead + auto_check_result side by side
// ─────────────────────────────────────────────────────────────────────────────
exports.submitFeasibility = async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, is_active: true });
    if (!lead) return err404(res);

    const { feasibility_status, feasibility_notes = '' } = req.body;

    // ── Run Layer 1 auto-check — pure function call, no HTTP ─────────────────
    let autoCheckResult = null;
    try {
      if (lead.enquired_items && lead.enquired_items.length > 0) {
        autoCheckResult = await runFeasibilityCheck(lead.toObject());
      }
    } catch (_) {
      // auto-check failure must never block the manual submission
    }

    // ── Save production engineer's decision ───────────────────────────────────
    lead.feasibility_status     = feasibility_status;
    lead.feasibility_notes      = feasibility_notes;
    lead.feasibility_checked_by = req.user._id;
    lead.feasibility_date       = new Date();
    lead.updated_by             = req.user._id;

    lead.audit_log.push(
      auditEntry(req.user._id, 'feasibility_status', null, feasibility_status)
    );

    await lead.save();

    res.json({
      success:           true,
      data:              lead,
      auto_check_result: autoCheckResult,
    });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leads/:id/convert
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leads/:id/convert
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leads/:id/convert
// Works on standalone MongoDB (no replica set required)
// ─────────────────────────────────────────────────────────────────────────────
exports.convertLead = async (req, res) => {
    try {
      // ── 1. Fetch lead ─────────────────────────────────────────────────────────
      const lead = await Lead.findOne({ _id: req.params.id, is_active: true });
      if (!lead) return err404(res);
  
      // ── 2. Guards ─────────────────────────────────────────────────────────────
      if (lead.status !== 'Won') {
        return res.status(400).json({
          success: false,
          message: `Lead must be Won to convert. Current: ${lead.status}`,
        });
      }
      if (lead.is_converted) {
        return res.status(400).json({
          success:     false,
          message:     'Lead already converted',
          customer_id: lead.customer_id,
        });
      }
  
      let customer;
      let isExisting = false;
  
      // ── 3. Path A — caller passed existing_customer_id ────────────────────────
      if (req.body.existing_customer_id) {
        customer = await Customer.findById(req.body.existing_customer_id);
        if (!customer) {
          return res.status(404).json({ success: false, message: 'Existing customer not found' });
        }
        isExisting = true;
  
      } else {
        // ── 4. Auto-detect existing customer ─────────────────────────────────────
        const gstin = req.body.new_customer?.gstin || null;
  
        if (gstin) {
          customer = await Customer.findOne({ gstin, is_active: true });
        }
        if (!customer) {
          customer = await Customer.findOne({
            customer_name: { $regex: `^${lead.company_name.trim()}$`, $options: 'i' },
            is_active: true,
          });
        }
  
        if (customer) {
          isExisting = true;
  
        } else {
          // ── 5. Create new customer ────────────────────────────────────────────
          const nc = req.body.new_customer || {};
  
          if (!nc.customer_code) {
            return res.status(400).json({
              success: false,
              message: 'customer_code is required to create a new customer',
            });
          }
  
          // billing_address MUST come from request body.
          // Lead schema does not have address/state/pincode fields.
          // Caller must send billing_address with at least: line1, city, state, state_code, pincode
          if (!nc.billing_address) {
            return res.status(400).json({
              success: false,
              message: 'billing_address is required in new_customer. Provide: line1, city, state, state_code (1-37), pincode',
            });
          }
  
          const { line1, city, state, state_code, pincode } = nc.billing_address;
          if (!line1 || !city || !state || !state_code || !pincode) {
            return res.status(400).json({
              success: false,
              message: 'billing_address must include: line1, city, state, state_code (1-37), pincode',
            });
          }
          if (state_code < 1 || state_code > 37) {
            return res.status(400).json({
              success: false,
              message: 'billing_address.state_code must be between 1 and 37 (GST state code). Maharashtra=27, Gujarat=24, Delhi=07',
            });
          }
  
          const contacts = nc.contacts?.length ? nc.contacts : [{
            name:        lead.contact_name,
            designation: lead.designation    || '',
            phone:       lead.contact_phone  || '',
            mobile:      lead.contact_mobile || '',
            email:       lead.contact_email  || '',
            is_primary:  true,
          }];
  
          customer = new Customer({
            customer_name:    lead.company_name,
            gstin:            gstin || null,
            pan:              nc.pan          || '',
            industry_segment: lead.industry   || '',
            billing_address:  nc.billing_address,
            contacts,
            customer_code:    nc.customer_code,
            customer_type:    nc.customer_type    || 'OEM',
            priority:         nc.priority         || 'Regular',
            credit_limit:     nc.credit_limit      ?? 0,
            credit_days:      nc.credit_days       ?? 30,
            payment_terms:    nc.payment_terms     || 'Net 30',
            currency:         nc.currency          || 'INR',
            territory:        nc.territory         || '',
            assigned_to:      nc.assigned_to       || null,
            internal_remarks: nc.internal_remarks  || '',
            source_lead_id:   lead._id,
            source_lead_no:   lead.lead_id,
            created_by:       req.user._id,
          });
  
          await customer.save();
        }
      }
  
      // ── 6. Mark lead as converted ─────────────────────────────────────────────
      lead.is_converted = true;
      lead.converted_at = new Date();
      lead.customer_id  = customer._id;
      lead.updated_by   = req.user._id;
      lead.audit_log.push(auditEntry(req.user._id, 'is_converted', false, true));
      await lead.save();
  
      res.status(201).json({
        success:              true,
        message:              isExisting
                                ? 'Lead linked to existing customer'
                                : 'Lead converted — new customer created',
        is_existing_customer: isExisting,
        customer,
        lead_id:              lead._id,
      });
  
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Customer code or GSTIN conflict',
          detail:  e.keyValue,
        });
      }
      err500(res, e);
    }
  };


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leads/dashboard
// ─────────────────────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const [byStatus, bySalesperson, bySource, summary, overdueCount] = await Promise.all([

      Lead.aggregate([
        { $match: { is_active: true } },
        { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$estimated_value' } } },
        { $sort: { count: -1 } },
      ]),

      Lead.aggregate([
        { $match: { is_active: true, assigned_to: { $ne: null } } },
        { $group: {
          _id:      '$assigned_to',
          total:    { $sum: 1 },
          won:      { $sum: { $cond: [{ $eq: ['$status', 'Won'] }, 1, 0] } },
          pipeline: { $sum: { $cond: [{ $not: [{ $in: ['$status', ['Won','Lost','Junk']] }] }, 1, 0] } },
          value:    { $sum: '$estimated_value' },
        }},
        { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'employee' } },
        { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
      ]),

      Lead.aggregate([
        { $match: { is_active: true } },
        { $group: { _id: '$lead_source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      Lead.aggregate([
        { $match: { is_active: true } },
        { $group: {
          _id:           null,
          total_leads:   { $sum: 1 },
          total_won:     { $sum: { $cond: [{ $eq: ['$status', 'Won'] }, 1, 0] } },
          total_lost:    { $sum: { $cond: [{ $eq: ['$status', 'Lost'] }, 1, 0] } },
          total_value:   { $sum: '$estimated_value' },
          avg_deal_size: { $avg: '$estimated_value' },
        }},
      ]),

      Lead.countDocuments({
        is_active:           true,
        next_follow_up_date: { $lt: new Date() },
        status:              { $nin: ['Won', 'Lost', 'Junk'] },
      }),
    ]);

    const s = summary[0] || {};
    const convRate = s.total_leads
      ? ((s.total_won / s.total_leads) * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        funnel:               byStatus,
        by_salesperson:       bySalesperson,
        by_source:            bySource,
        total_leads:          s.total_leads || 0,
        total_won:            s.total_won   || 0,
        total_lost:           s.total_lost  || 0,
        conversion_rate_pct:  parseFloat(convRate),
        total_pipeline_value: s.total_value || 0,
        avg_deal_size:        Math.round(s.avg_deal_size || 0),
        overdue_follow_ups:   overdueCount,
      },
    });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leads/overdue-followups
// ─────────────────────────────────────────────────────────────────────────────
exports.getOverdueFollowups = async (req, res) => {
  try {
    const leads = await Lead.find({
      is_active:           true,
      next_follow_up_date: { $lt: new Date() },
      status:              { $nin: ['Won', 'Lost', 'Junk'] },
    })
      .populate('assigned_to', 'first_name last_name email')
      .select('lead_id subject company_name contact_name status assigned_to next_follow_up_date priority')
      .sort('next_follow_up_date')
      .lean();

    res.json({ success: true, count: leads.length, data: leads });
  } catch (e) { err500(res, e); }
};