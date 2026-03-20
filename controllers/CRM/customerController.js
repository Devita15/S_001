'use strict';
const Customer = require('../../models/CRM/Customer');

const err404 = (res) => res.status(404).json({ success: false, message: 'Customer not found' });
const err500 = (res, e) => res.status(500).json({ success: false, message: e.message });
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customers
// ─────────────────────────────────────────────────────────────────────────────
exports.createCustomer = async (req, res) => {
  try {
    if (req.body.gstin) {
      const dup = await Customer.findOne({ gstin: req.body.gstin });
      if (dup) {
        return res.status(409).json({
          success: false,
          message: `GSTIN already registered: ${dup.customer_name} (${dup.customer_code})`,
        });
      }
    }
    const customer = await Customer.create({ ...req.body, created_by: req.user._id });
    res.status(201).json({ success: true, data: customer });
  } catch (e) {
    if (e.code === 11000) {
      const field = Object.keys(e.keyValue)[0];
      return res.status(409).json({
        success: false,
        message: `${field} already exists: ${e.keyValue[field]}`,
      });
    }
    err500(res, e);
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customers
// Filters: search (name/code/gstin), customer_type, industry_segment,
//          priority, territory, assigned_to, is_credit_hold, is_sez,
//          is_export, currency, page, limit, sort
// ─────────────────────────────────────────────────────────────────────────────
exports.getCustomers = async (req, res) => {
  try {
    const {
      search, customer_type, industry_segment, priority,
      territory, assigned_to, is_credit_hold, is_sez, is_export, currency,
      page = 1, limit = 20, sort = '-createdAt',
    } = req.query;

    const f = { is_active: true };

    if (customer_type)     f.customer_type     = customer_type;
    if (industry_segment)  f.industry_segment  = industry_segment;
    if (priority)          f.priority          = priority;
    if (territory)         f.territory         = { $regex: territory, $options: 'i' };
    if (assigned_to)       f.assigned_to       = assigned_to;
    if (currency)          f.currency          = currency;
    if (is_credit_hold !== undefined) f.is_credit_hold = is_credit_hold === 'true';
    if (is_sez    !== undefined)      f.is_sez    = is_sez    === 'true';
    if (is_export !== undefined)      f.is_export = is_export === 'true';

    if (search) {
      f.$or = [
        { customer_name: { $regex: search, $options: 'i' } },
        { customer_code: { $regex: search, $options: 'i' } },
        { gstin:         { $regex: search, $options: 'i' } },
      ];
    }

    const pg   = Math.max(parseInt(page), 1);
    const lim  = Math.min(parseInt(limit), 100);
    const skip = (pg - 1) * lim;

    const [data, total] = await Promise.all([
      Customer.find(f)
        .populate('assigned_to', 'first_name last_name email')
        .sort(sort).skip(skip).limit(lim)
        .lean({ virtuals: true }),
      Customer.countDocuments(f),
    ]);

    res.json({
      success: true, data,
      pagination: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) },
    });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customers/:id
// ─────────────────────────────────────────────────────────────────────────────
exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, is_active: true })
      .populate('assigned_to', 'first_name last_name email');
    if (!customer) return err404(res);
    res.json({ success: true, data: customer });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/customers/:id
// customer_code and customer_id are immutable — excluded from allowed
// ─────────────────────────────────────────────────────────────────────────────
exports.updateCustomer = async (req, res) => {
  try {
    const ALLOWED = [
      'customer_name', 'customer_type', 'industry_segment', 'priority',
      'gstin', 'pan', 'tan', 'msme_number', 'is_sez', 'is_export',
      'credit_limit', 'credit_days', 'payment_terms', 'currency', 'bank_details',
      'billing_address', 'assigned_to', 'territory', 'internal_remarks', 'is_credit_hold',
    ];
    const updates = { updated_by: req.user._id };
    for (const k of ALLOWED) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, is_active: true },
      updates,
      { new: true, runValidators: true }
    ).populate('assigned_to', 'first_name last_name email');

    if (!customer) return err404(res);
    res.json({ success: true, data: customer });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ success: false, message: 'GSTIN conflict' });
    err500(res, e);
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/customers/:id  (soft-delete)
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, is_active: true },
      { is_active: false, updated_by: req.user._id },
      { new: true }
    );
    if (!customer) return err404(res);
    res.json({ success: true, message: 'Customer deactivated' });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/customers/:id/shipping-addresses
// action: add | update | remove
// ─────────────────────────────────────────────────────────────────────────────
exports.manageShipping = async (req, res) => {
  try {
    const { action, address_id, address } = req.body;
    const customer = await Customer.findOne({ _id: req.params.id, is_active: true });
    if (!customer) return err404(res);

    if (action === 'add') {
      customer.shipping_addresses.push(address);
    } else if (action === 'update') {
      const addr = customer.shipping_addresses.id(address_id);
      if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });
      Object.assign(addr, address);
    } else if (action === 'remove') {
      const addr = customer.shipping_addresses.id(address_id);
      if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });
      addr.deleteOne();
    }

    customer.updated_by = req.user._id;
    await customer.save();
    res.json({ success: true, data: customer.shipping_addresses });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/customers/:id/contacts
// action: add | update | remove | set_primary
// ─────────────────────────────────────────────────────────────────────────────
exports.manageContacts = async (req, res) => {
  try {
    const { action, contact_id, contact } = req.body;
    const customer = await Customer.findOne({ _id: req.params.id, is_active: true });
    if (!customer) return err404(res);

    if (action === 'add') {
      if (contact.is_primary) customer.contacts.forEach(c => { c.is_primary = false; });
      customer.contacts.push(contact);
    } else if (action === 'update') {
      const c = customer.contacts.id(contact_id);
      if (!c) return res.status(404).json({ success: false, message: 'Contact not found' });
      if (contact.is_primary) customer.contacts.forEach(x => { x.is_primary = false; });
      Object.assign(c, contact);
    } else if (action === 'remove') {
      const c = customer.contacts.id(contact_id);
      if (!c) return res.status(404).json({ success: false, message: 'Contact not found' });
      c.deleteOne();
    } else if (action === 'set_primary') {
      customer.contacts.forEach(c => { c.is_primary = c._id.toString() === contact_id; });
    }

    customer.updated_by = req.user._id;
    await customer.save();
    res.json({ success: true, data: customer.contacts });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/customers/:id/credit-hold
// ─────────────────────────────────────────────────────────────────────────────
exports.toggleCreditHold = async (req, res) => {
  try {
    const { is_credit_hold, reason = '' } = req.body;
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, is_active: true },
      {
        is_credit_hold, updated_by: req.user._id,
        ...(reason ? { internal_remarks: reason } : {}),
      },
      { new: true }
    );
    if (!customer) return err404(res);
    res.json({
      success: true,
      message: `Credit hold ${is_credit_hold ? 'applied' : 'released'}`,
      data: customer,
    });
  } catch (e) { err500(res, e); }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customers/:id/credit-outstanding
// ─────────────────────────────────────────────────────────────────────────────
exports.getCreditOutstanding = async (req, res) => {
  try {
    const c = await Customer.findOne({ _id: req.params.id, is_active: true })
      .select('customer_id customer_code customer_name credit_limit credit_days credit_outstanding is_credit_hold payment_terms currency');
    if (!c) return err404(res);

    const available = c.credit_limit === 0
      ? null  // null = unlimited
      : Math.max(0, c.credit_limit - c.credit_outstanding);

    res.json({
      success: true,
      data: {
        customer_id:        c.customer_id,
        customer_code:      c.customer_code,
        customer_name:      c.customer_name,
        credit_limit:       c.credit_limit,
        credit_outstanding: c.credit_outstanding,
        credit_available:   available === null ? 'Unlimited' : available,
        credit_days:        c.credit_days,
        payment_terms:      c.payment_terms,
        currency:           c.currency,
        is_credit_hold:     c.is_credit_hold,
      },
    });
  } catch (e) { err500(res, e); }
};