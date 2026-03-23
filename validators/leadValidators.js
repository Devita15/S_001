'use strict';
const Joi = require('joi');
const { LEAD_STATUSES } = require('../models/CRM/Lead');

const oid = Joi.string().hex().length(24);

// ─────────────────────────────────────────────────────────────────────────────
// LEAD VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

const enquiredItemJoi = Joi.object({
  part_no:       Joi.string().allow('').uppercase().default(''),
  description:   Joi.string().trim().required(),
  quantity:      Joi.number().integer().min(1).required(),
  unit:          Joi.string().valid('Nos','Kg','Meter','Set','Piece').default('Nos'),
  target_price:  Joi.number().min(0).default(0),
  material_grade: Joi.string().allow('').default(''),
  drawing_ref_no: Joi.string().allow('').default(''),
  remarks:       Joi.string().allow('').default(''),
});

exports.createLeadSchema = Joi.object({
  // §1.2.1
  lead_source: Joi.string()
    .valid('Website','Email','WhatsApp','Phone','Exhibition',
           'Referral','Cold Outreach','Walk-In','LinkedIn','Other')
    .required(),
  lead_source_detail: Joi.string().allow('').default(''),
  subject:            Joi.string().trim().required(),
  description:        Joi.string().allow('').default(''),

  // §1.2.2
  company_name:    Joi.string().trim().required(),
  company_website: Joi.string().uri({ allowRelative: false }).allow('').default(''),
  industry:        Joi.string().allow('').default(''),
  company_size:    Joi.string()
    .valid('Startup','SME','Mid-Market','Enterprise','Unknown','').default(''),
  annual_turnover: Joi.number().min(0).default(0),

  // §1.2.3
  contact_name:   Joi.string().trim().required(),
  contact_email:  Joi.string().email().lowercase().allow('').default(''),
  contact_phone:  Joi.string().allow('').default(''),
  contact_mobile: Joi.string().allow('').default(''),
  designation:    Joi.string().allow('').default(''),

  // §1.2.4
  enquired_items:  Joi.array().items(enquiredItemJoi).default([]),
  estimated_value: Joi.number().min(0).default(0),

  // §1.2.5
  expected_close_date: Joi.date().iso().allow(null).default(null),
  priority:            Joi.string().valid('High','Medium','Low','').default('Medium'),
  tags:                Joi.array().items(Joi.string().trim()).default([]),

  // §1.2.7
  assigned_to:         oid.allow(null).default(null),
  next_follow_up_date: Joi.date().iso().allow(null).default(null),
});

exports.updateLeadSchema = Joi.object({
  subject:             Joi.string().trim(),
  description:         Joi.string().allow(''),
  company_name:        Joi.string().trim(),
  company_website:     Joi.string().uri({ allowRelative: false }).allow(''),
  industry:            Joi.string().allow(''),
  company_size:        Joi.string().valid('Startup','SME','Mid-Market','Enterprise','Unknown',''),
  annual_turnover:     Joi.number().min(0),
  contact_name:        Joi.string().trim(),
  contact_email:       Joi.string().email().lowercase().allow(''),
  contact_phone:       Joi.string().allow(''),
  contact_mobile:      Joi.string().allow(''),
  designation:         Joi.string().allow(''),
  enquired_items:      Joi.array().items(enquiredItemJoi).min(0),
  estimated_value:     Joi.number().min(0),
  expected_close_date: Joi.date().iso().allow(null),
  priority:            Joi.string().valid('High','Medium','Low',''),
  tags:                Joi.array().items(Joi.string()),
  assigned_to:         oid.allow(null),
  next_follow_up_date: Joi.date().iso().allow(null),
  lead_source_detail:  Joi.string().allow(''),
}).min(1);

exports.statusTransitionSchema = Joi.object({
  status:      Joi.string().valid(...LEAD_STATUSES).required(),
  lost_reason: Joi.when('status', {
    is:        Joi.valid('Lost'),
    then:      Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  lost_to:     Joi.string().allow('').default(''),
  win_remarks: Joi.string().allow('').default(''),
});

exports.followUpSchema = Joi.object({
  date:             Joi.date().iso().default(() => new Date()),
  channel:          Joi.string().valid('Call','Email','Visit','WhatsApp','Meeting').required(),
  summary:          Joi.string().required(),
  next_action:      Joi.string().allow('').default(''),
  next_action_date: Joi.date().iso().min('now').allow(null).default(null),
  outcome:          Joi.string()
    .valid('Positive','Neutral','Negative','No Response','').default(''),
});

exports.feasibilitySchema = Joi.object({
  feasibility_status: Joi.string()
    .valid('Feasible','Not Feasible','Conditionally Feasible')
    .required(),
  feasibility_notes: Joi.string().allow('').default(''),
});

exports.convertLeadSchema = Joi.object({
  existing_customer_id: oid.optional(),
  new_customer: Joi.object({
    customer_code:    Joi.string().trim().uppercase().required(),
    customer_name:    Joi.string().trim().required(),
    customer_type:    Joi.string()
      .valid('OEM','Dealer','Distributor','Direct','Government','Export','Other')
      .required(),
    gstin: Joi.string()
      .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
      .allow(null, '').optional(),
    pan: Joi.string().pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).allow('').optional(),
    billing_address: Joi.object({
      line1:      Joi.string().required(),
      line2:      Joi.string().allow('').default(''),
      city:       Joi.string().required(),
      district:   Joi.string().allow('').default(''),
      state:      Joi.string().required(),
      state_code: Joi.number().integer().min(1).max(37).required(),
      pincode:    Joi.string().required(),
      country:    Joi.string().default('India'),
    }).required(),
    credit_limit:  Joi.number().min(0).default(0),
    credit_days:   Joi.number().integer().min(0).default(30),
    payment_terms: Joi.string()
      .valid('Advance','On Delivery','Net 15','Net 30','Net 45','Net 60','Net 90','LC','Custom')
      .default('Net 30'),
    currency:    Joi.string().valid('INR','USD','EUR','GBP','AED','JPY').default('INR'),
    territory:   Joi.string().allow('').default(''),
    assigned_to: oid.allow(null).default(null),
  }).optional(),
}).xor('existing_customer_id', 'new_customer');


// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

const addressJoi = Joi.object({
  line1:      Joi.string().required(),
  line2:      Joi.string().allow('').default(''),
  city:       Joi.string().required(),
  district:   Joi.string().allow('').default(''),
  state:      Joi.string().required(),
  state_code: Joi.number().integer().min(1).max(37).required(),
  pincode:    Joi.string().required(),
  country:    Joi.string().default('India'),
});

const shippingAddressJoi = addressJoi.keys({
  label:      Joi.string().required(),
  is_default: Joi.boolean().default(false),
});

const contactJoi = Joi.object({
  name:        Joi.string().required(),
  designation: Joi.string().allow('').default(''),
  department:  Joi.string().allow('').default(''),
  phone:       Joi.string().allow('').default(''),
  mobile:      Joi.string().allow('').default(''),
  email:       Joi.string().email().allow('').lowercase().default(''),
  is_primary:  Joi.boolean().default(false),
});

exports.createCustomerSchema = Joi.object({
  customer_code:    Joi.string().trim().uppercase().required(),
  customer_name:    Joi.string().trim().required(),
  customer_type:    Joi.string()
    .valid('OEM','Dealer','Distributor','Direct','Government','Export','Other')
    .required(),
  industry_segment: Joi.string()
    .valid('Automotive','Electronics','Energy','Switchgear','EV','Defence','General','')
    .default(''),
  priority:         Joi.string()
    .valid('Key Account','Regular','Prospect','Dormant','').default('Regular'),

  gstin: Joi.string()
    .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .allow(null, '').optional(),
  pan:  Joi.string().pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).allow('').optional(),
  tan:  Joi.string().allow('').default(''),
  msme_number: Joi.string().allow('').default(''),
  is_sez:    Joi.boolean().default(false),
  is_export: Joi.boolean().default(false),

  credit_limit:  Joi.number().min(0).default(0),
  credit_days:   Joi.number().integer().min(0).default(30),
  payment_terms: Joi.string()
    .valid('Advance','On Delivery','Net 15','Net 30','Net 45','Net 60','Net 90','LC','Custom')
    .default('Net 30'),
  currency: Joi.string().valid('INR','USD','EUR','GBP','AED','JPY').default('INR'),
  bank_details: Joi.object({
    bank_name:    Joi.string().allow('').default(''),
    account_no:   Joi.string().allow('').default(''),
    ifsc:         Joi.string().allow('').default(''),
    branch:       Joi.string().allow('').default(''),
    account_name: Joi.string().allow('').default(''),
  }).default({}),

  billing_address:    addressJoi.required(),
  shipping_addresses: Joi.array().items(shippingAddressJoi).default([]),
  contacts:           Joi.array().items(contactJoi).default([]),

  assigned_to:      oid.allow(null).default(null),
  territory:        Joi.string().allow('').default(''),
  internal_remarks: Joi.string().allow('').default(''),
});

exports.updateCustomerSchema = Joi.object({
  customer_name:    Joi.string().trim(),
  customer_type:    Joi.string()
    .valid('OEM','Dealer','Distributor','Direct','Government','Export','Other'),
  industry_segment: Joi.string()
    .valid('Automotive','Electronics','Energy','Switchgear','EV','Defence','General',''),
  priority:         Joi.string().valid('Key Account','Regular','Prospect','Dormant',''),
  gstin: Joi.string()
    .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .allow(null, ''),
  pan:  Joi.string().pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).allow(''),
  tan:  Joi.string().allow(''),
  msme_number: Joi.string().allow(''),
  is_sez:    Joi.boolean(),
  is_export: Joi.boolean(),
  credit_limit:    Joi.number().min(0),
  credit_days:     Joi.number().integer().min(0),
  payment_terms:   Joi.string()
    .valid('Advance','On Delivery','Net 15','Net 30','Net 45','Net 60','Net 90','LC','Custom'),
  currency:        Joi.string().valid('INR','USD','EUR','GBP','AED','JPY'),
  bank_details:    Joi.object({
    bank_name: Joi.string().allow(''), account_no: Joi.string().allow(''),
    ifsc: Joi.string().allow(''), branch: Joi.string().allow(''),
    account_name: Joi.string().allow(''),
  }),
  billing_address: addressJoi,
  assigned_to:     oid.allow(null),
  territory:       Joi.string().allow(''),
  internal_remarks: Joi.string().allow(''),
  is_credit_hold:  Joi.boolean(),
}).min(1);

exports.manageShippingSchema = Joi.object({
  action:     Joi.string().valid('add','update','remove').required(),
  address_id: Joi.when('action', {
    is: Joi.valid('update','remove'), then: oid.required(), otherwise: Joi.optional(),
  }),
  address: Joi.when('action', {
    is: Joi.valid('add','update'), then: shippingAddressJoi.required(), otherwise: Joi.optional(),
  }),
});

exports.manageContactSchema = Joi.object({
  action:     Joi.string().valid('add','update','remove','set_primary').required(),
  contact_id: Joi.when('action', {
    is: Joi.valid('update','remove','set_primary'), then: oid.required(), otherwise: Joi.optional(),
  }),
  contact: Joi.when('action', {
    is: Joi.valid('add','update'), then: contactJoi.required(), otherwise: Joi.optional(),
  }),
});

exports.creditHoldSchema = Joi.object({
  is_credit_hold: Joi.boolean().required(),
  reason:         Joi.string().allow('').default(''),
});