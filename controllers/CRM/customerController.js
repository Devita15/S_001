// controllers/CRM/customerController.js
'use strict';

const mongoose = require('mongoose');
const Joi      = require('joi');
const Customer = require('../../models/CRM/Customer');

// ═══════════════════════════════════════════════════════════════════════════════
// JOI SCHEMAS  (inline — no separate validators file)
// ═══════════════════════════════════════════════════════════════════════════════

const addressSchema = Joi.object({
  line1:      Joi.string().trim().required(),
  line2:      Joi.string().trim().allow('').default(''),
  city:       Joi.string().trim().required(),
  district:   Joi.string().trim().allow('').default(''),
  state:      Joi.string().trim().required(),
  state_code: Joi.number().integer().min(1).max(37).required()
    .messages({ 'number.min': 'state_code must be 1–37', 'number.max': 'state_code must be 1–37' }),
  pincode:    Joi.string().trim().required(),
  country:    Joi.string().trim().default('India'),
});

const shippingSchema = addressSchema.keys({
  label:      Joi.string().trim().required().messages({ 'any.required': 'Shipping address label is required (e.g. "Pune Plant")' }),
  is_default: Joi.boolean().default(false),
});

const contactSchema = Joi.object({
  name:        Joi.string().trim().required(),
  designation: Joi.string().trim().allow('').default(''),
  department:  Joi.string().trim().allow('').default(''),
  phone:       Joi.string().trim().allow('').default(''),
  mobile:      Joi.string().trim().allow('').default(''),
  email:       Joi.string().trim().email({ tlds: { allow: false } }).allow('').default(''),
  is_primary:  Joi.boolean().default(false),
});

const bankSchema = Joi.object({
  bank_name:    Joi.string().trim().allow('').default(''),
  account_no:   Joi.string().trim().allow('').default(''),
  ifsc:         Joi.string().trim().allow('').default(''),
  branch:       Joi.string().trim().allow('').default(''),
  account_name: Joi.string().trim().allow('').default(''),
});

const SCHEMAS = {
  create: Joi.object({
    customer_code:      Joi.string().trim().uppercase().required()
      .messages({ 'any.required': 'customer_code is required', 'string.empty': 'customer_code cannot be empty' }),
    customer_name:      Joi.string().trim().required()
      .messages({ 'any.required': 'customer_name is required' }),
    customer_type:      Joi.string().valid('OEM','Dealer','Distributor','Direct','Government','Export','Other').required()
      .messages({ 'any.required': 'customer_type is required', 'any.only': 'customer_type must be: OEM, Dealer, Distributor, Direct, Government, Export, Other' }),
    industry_segment:   Joi.string().valid('Automotive','Electronics','Energy','Switchgear','EV','Defence','General','').default(''),
    priority:           Joi.string().valid('Key Account','Regular','Prospect','Dormant','').default('Regular'),
    gstin:              Joi.string().trim().uppercase()
      .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
      .allow(null,'').default(null)
      .messages({ 'string.pattern.base': 'GSTIN format invalid — expected e.g. 27AAECS7112G1Z5' }),
    pan:                Joi.string().trim().uppercase()
      .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).allow('').default('')
      .messages({ 'string.pattern.base': 'PAN format invalid — expected AAAAA9999A' }),
    tan:                Joi.string().trim().allow('').default(''),
    msme_number:        Joi.string().trim().allow('').default(''),
    is_sez:             Joi.boolean().default(false),
    is_export:          Joi.boolean().default(false),
    credit_limit:       Joi.number().min(0).default(0),
    credit_days:        Joi.number().integer().min(0).default(30),
    payment_terms:      Joi.string().valid('Advance','On Delivery','Net 15','Net 30','Net 45','Net 60','Net 90','LC','Custom').default('Net 30'),
    currency:           Joi.string().valid('INR','USD','EUR','GBP','AED','JPY').default('INR'),
    bank_details:       bankSchema.default({}),
    billing_address:    addressSchema.required().messages({ 'any.required': 'billing_address is required' }),
    shipping_addresses: Joi.array().items(shippingSchema).default([]),
    contacts:           Joi.array().items(contactSchema).default([]),
    assigned_to:        Joi.string().hex().length(24).allow(null,'').default(null),
    territory:          Joi.string().trim().allow('').default(''),
    internal_remarks:   Joi.string().trim().allow('').default(''),
    source_lead_id:     Joi.string().hex().length(24).allow(null,'').default(null),
    source_lead_no:     Joi.string().trim().allow('').default(''),
  }),

  update: Joi.object({
    customer_name:      Joi.string().trim(),
    customer_type:      Joi.string().valid('OEM','Dealer','Distributor','Direct','Government','Export','Other'),
    industry_segment:   Joi.string().valid('Automotive','Electronics','Energy','Switchgear','EV','Defence','General',''),
    priority:           Joi.string().valid('Key Account','Regular','Prospect','Dormant',''),
    gstin:              Joi.string().trim().uppercase()
      .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
      .allow(null,'')
      .messages({ 'string.pattern.base': 'GSTIN format invalid — expected e.g. 27AAECS7112G1Z5' }),
    pan:                Joi.string().trim().uppercase()
      .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).allow('')
      .messages({ 'string.pattern.base': 'PAN format invalid — expected AAAAA9999A' }),
    tan:                Joi.string().trim().allow(''),
    msme_number:        Joi.string().trim().allow(''),
    is_sez:             Joi.boolean(),
    is_export:          Joi.boolean(),
    credit_limit:       Joi.number().min(0),
    credit_days:        Joi.number().integer().min(0),
    payment_terms:      Joi.string().valid('Advance','On Delivery','Net 15','Net 30','Net 45','Net 60','Net 90','LC','Custom'),
    currency:           Joi.string().valid('INR','USD','EUR','GBP','AED','JPY'),
    bank_details:       bankSchema,
    billing_address:    addressSchema,
    assigned_to:        Joi.string().hex().length(24).allow(null,''),
    territory:          Joi.string().trim().allow(''),
    internal_remarks:   Joi.string().trim().allow(''),
    is_credit_hold:     Joi.boolean(),
  }).min(1).messages({ 'object.min': 'Provide at least one field to update' }),

  manageShipping: Joi.object({
    action:     Joi.string().valid('add','update','remove').required(),
    address_id: Joi.when('action', {
      is:        Joi.valid('update','remove'),
      then:      Joi.string().hex().length(24).required()
        .messages({ 'any.required': 'address_id is required for update/remove' }),
      otherwise: Joi.string().hex().length(24).allow(null,'').optional(),
    }),
    address:    Joi.when('action', {
      is:        Joi.valid('add','update'),
      then:      shippingSchema.required()
        .messages({ 'any.required': 'address object is required for add/update' }),
      otherwise: Joi.any().optional(),
    }),
  }),

  manageContact: Joi.object({
    action:     Joi.string().valid('add','update','remove','set_primary').required(),
    contact_id: Joi.when('action', {
      is:        Joi.valid('update','remove','set_primary'),
      then:      Joi.string().hex().length(24).required()
        .messages({ 'any.required': 'contact_id is required for update/remove/set_primary' }),
      otherwise: Joi.string().hex().length(24).allow(null,'').optional(),
    }),
    contact:    Joi.when('action', {
      is:        Joi.valid('add','update'),
      then:      contactSchema.required()
        .messages({ 'any.required': 'contact object is required for add/update' }),
      otherwise: Joi.any().optional(),
    }),
  }),

  creditHold: Joi.object({
    is_credit_hold: Joi.boolean().required()
      .messages({ 'any.required': 'is_credit_hold (true/false) is required' }),
    reason: Joi.string().trim().allow('').default(''),
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Validate request body against a schema and respond 400 on failure
// Returns { valid: true, value } or sends 400 and returns { valid: false }
const validate = (res, schema, body) => {
  const { error, value } = schema.validate(body, {
    abortEarly:   false,   // collect ALL errors at once
    stripUnknown: true,    // silently remove fields not in schema
    convert:      true,
  });
  if (error) {
    const messages = error.details.map(d => d.message.replace(/['"]/g, ''));
    res.status(400).json({ success: false, message: 'Validation failed', errors: messages });
    return { valid: false };
  }
  return { valid: true, value };
};

// Parse MongoDB 11000 duplicate key error into a human message with FULL DEBUG
const parseDuplicateError = (err, context = {}) => {
  console.error('[MongoDB Duplicate Error] Full error details:', {
    code: err.code,
    keyPattern: err.keyPattern,
    keyValue: err.keyValue,
    message: err.message,
    stack: err.stack,
    ...context
  });
  
  const field = Object.keys(err.keyValue || {})[0];
  const value = err.keyValue?.[field];
  const labels = { 
    customer_code: 'Customer code', 
    gstin: 'GSTIN', 
    customer_id: 'Customer ID',
    'customer_code_1': 'Customer code',
    'gstin_1': 'GSTIN'
  };
  const label  = labels[field] || field || 'Field';
  
  // Special handling for GSTIN with null values
  if (field === 'gstin' && !value) {
    return 'GSTIN conflict: Another customer already exists with a GSTIN value (even if null). Please check the database.';
  }
  
  return value != null
    ? `${label} "${value}" already exists in the system`
    : `${label} already exists (value may be null or empty)`;
};

const err400 = (res, msg)          => res.status(400).json({ success: false, message: msg });
const err404 = (res)               => res.status(404).json({ success: false, message: 'Customer not found' });
const err409 = (res, msg)          => res.status(409).json({ success: false, message: msg });
const err500 = (res, err, ctx='') => {
  console.error(`[CustomerController]${ctx ? ' '+ctx : ''} → ERROR:`, {
    message: err.message,
    stack: err.stack || '',
    code: err.code,
    keyPattern: err.keyPattern,
    keyValue: err.keyValue
  });
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { debug: err.message }),
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/customers
// ═══════════════════════════════════════════════════════════════════════════════
exports.createCustomer = async (req, res) => {
  try {
    console.log('[createCustomer] Received request body:', JSON.stringify(req.body, null, 2));
    
    const { valid, value } = validate(res, SCHEMAS.create, req.body);
    if (!valid) return;
    // Auto-extract state_code from GSTIN first 2 digits
if (value.gstin && value.billing_address) {
  const gstStateCode = parseInt(value.gstin.substring(0, 2), 10);
  if (!value.billing_address.state_code) {
    value.billing_address.state_code = gstStateCode;
  }
}

    console.log('[createCustomer] Validated data:', JSON.stringify(value, null, 2));

    // Pre-flight GSTIN duplicate check with detailed logging
    if (value.gstin) {
      console.log(`[createCustomer] Checking GSTIN duplicate: "${value.gstin}"`);
      const dup = await Customer.findOne({ gstin: value.gstin }).lean();
      if (dup) {
        console.log(`[createCustomer] GSTIN conflict found: ${dup.customer_name} (${dup.customer_code})`);
        return err409(res,
          `GSTIN "${value.gstin}" is already registered under customer "${dup.customer_name}" (${dup.customer_code})`
        );
      }
      console.log('[createCustomer] GSTIN is unique ✓');
    } else {
      console.log('[createCustomer] No GSTIN provided, skipping duplicate check');
    }

    // Pre-flight customer_code check with detailed logging
    console.log(`[createCustomer] Checking customer_code duplicate: "${value.customer_code}"`);
    const dupCode = await Customer.findOne({ customer_code: value.customer_code }).lean();
    if (dupCode) {
      console.log(`[createCustomer] Customer code conflict found: ${dupCode.customer_name}`);
      return err409(res, `Customer code "${value.customer_code}" already exists in the system`);
    }
    console.log('[createCustomer] Customer code is unique ✓');

    const customer = await Customer.create({ ...value, created_by: req.user._id });

    console.log(`[createCustomer] ✓ Customer created successfully: ${customer.customer_id} | ${customer.customer_code} | ${customer.customer_name}`);
    return res.status(201).json({ success: true, data: customer });

  } catch (err) {
    console.error('[createCustomer] ❌ CATCH BLOCK ERROR:', {
      name: err.name,
      code: err.code,
      message: err.message,
      stack: err.stack,
      keyPattern: err.keyPattern,
      keyValue: err.keyValue
    });
    
    // Handle MongoDB duplicate key error (11000)
    if (err.code === 11000) {
      const errorMsg = parseDuplicateError(err, { 
        requestBody: req.body,
        userId: req.user?._id 
      });
      return err409(res, errorMsg);
    }
    
    if (err.name === 'ValidationError') {
      const validationErrors = Object.values(err.errors).map(e => e.message).join('; ');
      console.error('[createCustomer] Validation error:', validationErrors);
      return err400(res, validationErrors);
    }
    
    return err500(res, err, 'createCustomer');
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/customers
// ═══════════════════════════════════════════════════════════════════════════════
exports.getCustomers = async (req, res) => {
  try {
    const {
      search, customer_type, industry_segment, priority,
      territory, assigned_to, is_credit_hold, is_sez, is_export, currency,
      page = 1, limit = 20, sort = '-createdAt',
    } = req.query;

    console.log('[getCustomers] Query params:', { search, customer_type, industry_segment, priority, territory, assigned_to, page, limit, sort });

    const filter = { is_active: true };

    if (customer_type)    filter.customer_type    = customer_type;
    if (industry_segment) filter.industry_segment = industry_segment;
    if (priority)         filter.priority         = priority;
    if (currency)         filter.currency         = currency;
    if (territory)        filter.territory        = { $regex: territory, $options: 'i' };

    if (assigned_to) {
      if (!isValidId(assigned_to)) return err400(res, 'assigned_to must be a valid ObjectId');
      filter.assigned_to = assigned_to;
    }

    if (is_credit_hold !== undefined) filter.is_credit_hold = is_credit_hold === 'true';
    if (is_sez         !== undefined) filter.is_sez         = is_sez         === 'true';
    if (is_export      !== undefined) filter.is_export      = is_export      === 'true';

    if (search) {
      filter.$or = [
        { customer_name: { $regex: search, $options: 'i' } },
        { customer_code: { $regex: search, $options: 'i' } },
        { gstin:         { $regex: search, $options: 'i' } },
        { customer_id:   { $regex: search, $options: 'i' } },
      ];
    }

    const pg   = Math.max(parseInt(page)  || 1, 1);
    const lim  = Math.min(parseInt(limit) || 20, 100);
    const skip = (pg - 1) * lim;

    const SORTABLE = new Set(['createdAt','updatedAt','customer_name','customer_code','priority','credit_outstanding']);
    const sortField = sort.startsWith('-') ? sort.slice(1) : sort;
    const sortQuery = SORTABLE.has(sortField) ? sort : '-createdAt';

    console.log('[getCustomers] Filter:', JSON.stringify(filter, null, 2));
    console.log('[getCustomers] Sort:', sortQuery, 'Skip:', skip, 'Limit:', lim);

    const [data, total] = await Promise.all([
      Customer.find(filter)
        .populate('assigned_to', 'first_name last_name email')
        .sort(sortQuery)
        .skip(skip)
        .limit(lim)
        .lean({ virtuals: true }),
      Customer.countDocuments(filter),
    ]);

    console.log(`[getCustomers] Found ${total} customers, returning ${data.length}`);

    return res.json({
      success: true,
      data,
      pagination: { page: pg, limit: lim, total, pages: Math.ceil(total / lim) },
    });

  } catch (err) {
    return err500(res, err, 'getCustomers');
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/customers/:id
// ═══════════════════════════════════════════════════════════════════════════════
exports.getCustomerById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return err400(res, 'Invalid customer ID format');

    console.log(`[getCustomerById] Fetching customer: ${req.params.id}`);

    const customer = await Customer.findOne({ _id: req.params.id, is_active: true })
      .populate('assigned_to', 'first_name last_name email');

    if (!customer) {
      console.log(`[getCustomerById] Customer not found: ${req.params.id}`);
      return err404(res);
    }
    
    console.log(`[getCustomerById] Found: ${customer.customer_code} | ${customer.customer_name}`);
    return res.json({ success: true, data: customer });

  } catch (err) {
    return err500(res, err, 'getCustomerById');
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/customers/:id
// ═══════════════════════════════════════════════════════════════════════════════
exports.updateCustomer = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return err400(res, 'Invalid customer ID format');

    console.log(`[updateCustomer] Updating customer: ${req.params.id}`);
    console.log('[updateCustomer] Request body:', JSON.stringify(req.body, null, 2));

    // Strip immutable fields before validation
    const { customer_code, customer_id, created_by, ...body } = req.body;
    if (customer_code || customer_id) {
      console.warn('[updateCustomer] Attempt to mutate immutable field — stripped silently');
    }

    const { valid, value } = validate(res, SCHEMAS.update, body);
    if (!valid) return;

    console.log('[updateCustomer] Validated update data:', JSON.stringify(value, null, 2));

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, is_active: true },
      { ...value, updated_by: req.user._id },
      { new: true, runValidators: true }
    ).populate('assigned_to', 'first_name last_name email');

    if (!customer) {
      console.log(`[updateCustomer] Customer not found: ${req.params.id}`);
      return err404(res);
    }
    
    console.log(`[updateCustomer] ✓ Updated: ${customer.customer_code} | ${customer.customer_name}`);
    return res.json({ success: true, data: customer });

  } catch (err) {
    console.error('[updateCustomer] Error:', err);
    if (err.code === 11000) {
      const errorMsg = parseDuplicateError(err, { updateId: req.params.id });
      return err409(res, errorMsg);
    }
    if (err.name === 'ValidationError') return err400(res, Object.values(err.errors).map(e => e.message).join('; '));
    return err500(res, err, 'updateCustomer');
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/customers/:id  (soft-delete)
// ═══════════════════════════════════════════════════════════════════════════════
exports.deleteCustomer = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return err400(res, 'Invalid customer ID format');

    console.log(`[deleteCustomer] Soft-deleting customer: ${req.params.id}`);

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, is_active: true },
      { is_active: false, updated_by: req.user._id },
      { new: true }
    );

    if (!customer) {
      console.log(`[deleteCustomer] Customer not found: ${req.params.id}`);
      return err404(res);
    }
    
    console.log(`[deleteCustomer] ✓ Deactivated: ${customer.customer_name} (${customer.customer_code})`);
    return res.json({
      success: true,
      message: `Customer "${customer.customer_name}" (${customer.customer_code}) deactivated`,
    });

  } catch (err) {
    return err500(res, err, 'deleteCustomer');
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/customers/:id/shipping-addresses
// ═══════════════════════════════════════════════════════════════════════════════
exports.manageShipping = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return err400(res, 'Invalid customer ID format');

    console.log(`[manageShipping] Managing shipping for: ${req.params.id}`);
    console.log('[manageShipping] Body:', JSON.stringify(req.body, null, 2));

    const { valid, value } = validate(res, SCHEMAS.manageShipping, req.body);
    if (!valid) return;

    const { action, address_id, address } = value;

    const customer = await Customer.findOne({ _id: req.params.id, is_active: true });
    if (!customer) return err404(res);

    if (action === 'add') {
      console.log('[manageShipping] Adding new shipping address');
      customer.shipping_addresses.push(address);

    } else if (action === 'update') {
      console.log(`[manageShipping] Updating address: ${address_id}`);
      const addr = customer.shipping_addresses.id(address_id);
      if (!addr) return res.status(404).json({ success: false, message: 'Shipping address not found' });
      Object.assign(addr, address);

    } else if (action === 'remove') {
      console.log(`[manageShipping] Removing address: ${address_id}`);
      const addr = customer.shipping_addresses.id(address_id);
      if (!addr) return res.status(404).json({ success: false, message: 'Shipping address not found' });
      addr.deleteOne();
    }

    customer.updated_by = req.user._id;
    await customer.save();

    console.log(`[manageShipping] ✓ ${action} completed`);
    return res.json({ success: true, data: customer.shipping_addresses });

  } catch (err) {
    if (err.name === 'ValidationError') return err400(res, Object.values(err.errors).map(e => e.message).join('; '));
    return err500(res, err, 'manageShipping');
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/customers/:id/contacts
// ═══════════════════════════════════════════════════════════════════════════════
exports.manageContacts = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return err400(res, 'Invalid customer ID format');

    console.log(`[manageContacts] Managing contacts for: ${req.params.id}`);
    console.log('[manageContacts] Body:', JSON.stringify(req.body, null, 2));

    const { valid, value } = validate(res, SCHEMAS.manageContact, req.body);
    if (!valid) return;

    const { action, contact_id, contact } = value;

    const customer = await Customer.findOne({ _id: req.params.id, is_active: true });
    if (!customer) return err404(res);

    if (action === 'add') {
      console.log('[manageContacts] Adding new contact');
      if (contact?.is_primary) customer.contacts.forEach(c => { c.is_primary = false; });
      customer.contacts.push(contact);

    } else if (action === 'update') {
      console.log(`[manageContacts] Updating contact: ${contact_id}`);
      const c = customer.contacts.id(contact_id);
      if (!c) return res.status(404).json({ success: false, message: 'Contact not found' });
      if (contact?.is_primary) customer.contacts.forEach(x => { x.is_primary = false; });
      Object.assign(c, contact);

    } else if (action === 'remove') {
      console.log(`[manageContacts] Removing contact: ${contact_id}`);
      const c = customer.contacts.id(contact_id);
      if (!c) return res.status(404).json({ success: false, message: 'Contact not found' });
      c.deleteOne();

    } else if (action === 'set_primary') {
      console.log(`[manageContacts] Setting primary contact: ${contact_id}`);
      let found = false;
      customer.contacts.forEach(c => {
        c.is_primary = c._id.toString() === contact_id;
        if (c.is_primary) found = true;
      });
      if (!found) return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    customer.updated_by = req.user._id;
    await customer.save();

    console.log(`[manageContacts] ✓ ${action} completed`);
    return res.json({ success: true, data: customer.contacts });

  } catch (err) {
    if (err.name === 'ValidationError') return err400(res, Object.values(err.errors).map(e => e.message).join('; '));
    return err500(res, err, 'manageContacts');
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/customers/:id/credit-hold
// ═══════════════════════════════════════════════════════════════════════════════
exports.toggleCreditHold = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return err400(res, 'Invalid customer ID format');

    console.log(`[toggleCreditHold] Toggling credit hold for: ${req.params.id}`);
    console.log('[toggleCreditHold] Body:', JSON.stringify(req.body, null, 2));

    const { valid, value } = validate(res, SCHEMAS.creditHold, req.body);
    if (!valid) return;

    const { is_credit_hold, reason } = value;

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, is_active: true },
      { is_credit_hold, updated_by: req.user._id, ...(reason ? { internal_remarks: reason } : {}) },
      { new: true }
    );

    if (!customer) return err404(res);

    console.log(`[toggleCreditHold] ✓ Credit hold ${is_credit_hold ? 'applied' : 'released'} for ${customer.customer_name}`);
    return res.json({
      success: true,
      message: `Credit hold ${is_credit_hold ? 'applied' : 'released'} for "${customer.customer_name}"`,
      data:    customer,
    });

  } catch (err) {
    return err500(res, err, 'toggleCreditHold');
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/customers/:id/credit-outstanding
// ═══════════════════════════════════════════════════════════════════════════════
exports.getCreditOutstanding = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return err400(res, 'Invalid customer ID format');

    console.log(`[getCreditOutstanding] Fetching credit for: ${req.params.id}`);

    const c = await Customer.findOne({ _id: req.params.id, is_active: true })
      .select('customer_id customer_code customer_name credit_limit credit_days credit_outstanding is_credit_hold payment_terms currency')
      .lean();

    if (!c) return err404(res);

    const creditAvailable = c.credit_limit === 0 ? 'Unlimited' : Math.max(0, c.credit_limit - c.credit_outstanding);
    console.log(`[getCreditOutstanding] ${c.customer_code}: Limit=${c.credit_limit}, Outstanding=${c.credit_outstanding}, Available=${creditAvailable}`);

    return res.json({
      success: true,
      data: {
        customer_id:        c.customer_id,
        customer_code:      c.customer_code,
        customer_name:      c.customer_name,
        credit_limit:       c.credit_limit,
        credit_outstanding: c.credit_outstanding,
        credit_available:   creditAvailable,
        credit_days:        c.credit_days,
        payment_terms:      c.payment_terms,
        currency:           c.currency,
        is_credit_hold:     c.is_credit_hold,
      },
    });

  } catch (err) {
    return err500(res, err, 'getCreditOutstanding');
  }
};