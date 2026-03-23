// routes/CRM/customerRoutes.js
'use strict';

const express     = require('express');
const router      = express.Router();
const cc          = require('../../controllers/CRM/customerController');
const { protect } = require('../../middleware/authMiddleware');

// Validation is handled inside the controller — no separate validate middleware needed
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Customers
 *   description: Customer master — create, list, update, manage contacts/addresses, credit
 */

/**
 * @swagger
 * components:
 *   schemas:
 *
 *     Address:
 *       type: object
 *       required: [line1, city, state, state_code, pincode]
 *       properties:
 *         line1:      { type: string,  example: "Kalwa Works, Thane" }
 *         line2:      { type: string,  example: "" }
 *         city:       { type: string,  example: "Thane" }
 *         district:   { type: string,  example: "Thane" }
 *         state:      { type: string,  example: "Maharashtra" }
 *         state_code: { type: integer, minimum: 1, maximum: 37, example: 27 }
 *         pincode:    { type: string,  example: "400605" }
 *         country:    { type: string,  default: "India" }
 *
 *     ShippingAddress:
 *       allOf:
 *         - $ref: '#/components/schemas/Address'
 *         - type: object
 *           required: [label]
 *           properties:
 *             _id:        { type: string,  example: "64f8e9b7a1b2c3d4e5f6a7b8" }
 *             label:      { type: string,  example: "Pune Plant" }
 *             is_default: { type: boolean, example: false }
 *
 *     ContactPerson:
 *       type: object
 *       required: [name]
 *       properties:
 *         _id:         { type: string,  example: "64f8e9b7a1b2c3d4e5f6a7b9" }
 *         name:        { type: string,  example: "Rajesh Sharma" }
 *         designation: { type: string,  example: "Purchase Manager" }
 *         department:  { type: string,  example: "Procurement" }
 *         phone:       { type: string,  example: "02012345678" }
 *         mobile:      { type: string,  example: "9876543210" }
 *         email:       { type: string,  format: email, example: "rajesh@siemens.com" }
 *         is_primary:  { type: boolean, example: true }
 *
 *     BankDetails:
 *       type: object
 *       properties:
 *         bank_name:    { type: string, example: "HDFC Bank" }
 *         account_no:   { type: string, example: "12345678901234" }
 *         ifsc:         { type: string, example: "HDFC0001234" }
 *         branch:       { type: string, example: "Thane West" }
 *         account_name: { type: string, example: "Siemens India Ltd" }
 *
 *     Customer:
 *       type: object
 *       properties:
 *         _id:                { type: string,  example: "64f8e9b7a1b2c3d4e5f6a7b8" }
 *         customer_id:        { type: string,  example: "CUST-202503-0001", description: "Auto-generated, immutable" }
 *         customer_code:      { type: string,  example: "SIEMENS-001", description: "Immutable after creation" }
 *         customer_name:      { type: string,  example: "Siemens India Ltd" }
 *         customer_type:      { type: string,  enum: [OEM, Dealer, Distributor, Direct, Government, Export, Other] }
 *         industry_segment:   { type: string,  enum: [Automotive, Electronics, Energy, Switchgear, EV, Defence, General, ""] }
 *         priority:           { type: string,  enum: ["Key Account", Regular, Prospect, Dormant, ""] }
 *         gstin:              { type: string,  example: "27AAECS7112G1Z5", nullable: true }
 *         pan:                { type: string,  example: "AAECS7112G" }
 *         tan:                { type: string }
 *         msme_number:        { type: string }
 *         is_sez:             { type: boolean, example: false }
 *         is_export:          { type: boolean, example: false }
 *         credit_limit:       { type: number,  example: 500000, description: "0 = unlimited credit" }
 *         credit_days:        { type: integer, example: 45 }
 *         payment_terms:      { type: string,  enum: [Advance, "On Delivery", "Net 15", "Net 30", "Net 45", "Net 60", "Net 90", LC, Custom] }
 *         currency:           { type: string,  enum: [INR, USD, EUR, GBP, AED, JPY] }
 *         credit_outstanding: { type: number,  example: 125000 }
 *         is_credit_hold:     { type: boolean, example: false }
 *         bank_details:       { $ref: '#/components/schemas/BankDetails' }
 *         billing_address:    { $ref: '#/components/schemas/Address' }
 *         shipping_addresses:
 *           type: array
 *           items: { $ref: '#/components/schemas/ShippingAddress' }
 *         contacts:
 *           type: array
 *           items: { $ref: '#/components/schemas/ContactPerson' }
 *         assigned_to:
 *           type: object
 *           nullable: true
 *           properties:
 *             _id:        { type: string }
 *             first_name: { type: string }
 *             last_name:  { type: string }
 *             email:      { type: string }
 *         territory:        { type: string,  example: "West India" }
 *         source_lead_no:   { type: string,  example: "LEAD-202503-0001" }
 *         is_active:        { type: boolean, example: true }
 *         is_blacklisted:   { type: boolean, example: false }
 *         primary_contact:  { type: object,  description: "Virtual — first is_primary contact or contacts[0]" }
 *         credit_available:
 *           oneOf:
 *             - { type: number,  example: 375000 }
 *             - { type: string,  example: "Unlimited" }
 *           description: "Virtual — Unlimited if credit_limit=0, else limit minus outstanding"
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     CustomerCreate:
 *       type: object
 *       required: [customer_code, customer_name, customer_type, billing_address]
 *       properties:
 *         customer_code:
 *           type: string
 *           example: "SIEMENS-001"
 *           description: "Stored uppercase. Immutable after creation."
 *         customer_name:      { type: string, example: "Siemens India Ltd" }
 *         customer_type:      { type: string, enum: [OEM, Dealer, Distributor, Direct, Government, Export, Other] }
 *         industry_segment:   { type: string, enum: [Automotive, Electronics, Energy, Switchgear, EV, Defence, General, ""] }
 *         priority:           { type: string, enum: ["Key Account", Regular, Prospect, Dormant, ""], default: Regular }
 *         gstin:
 *           type: string
 *           example: "27AAECS7112G1Z5"
 *           description: "Sparse unique — null/empty OK for unregistered dealers. If provided, must be valid and unique."
 *           nullable: true
 *         pan:                { type: string, example: "AAECS7112G" }
 *         tan:                { type: string }
 *         msme_number:        { type: string }
 *         is_sez:             { type: boolean, default: false }
 *         is_export:          { type: boolean, default: false }
 *         credit_limit:       { type: number,  default: 0, description: "0 = unlimited" }
 *         credit_days:        { type: integer, default: 30 }
 *         payment_terms:      { type: string,  enum: [Advance, "On Delivery", "Net 15", "Net 30", "Net 45", "Net 60", "Net 90", LC, Custom], default: "Net 30" }
 *         currency:           { type: string,  enum: [INR, USD, EUR, GBP, AED, JPY], default: INR }
 *         bank_details:       { $ref: '#/components/schemas/BankDetails' }
 *         billing_address:    { $ref: '#/components/schemas/Address' }
 *         shipping_addresses:
 *           type: array
 *           items: { $ref: '#/components/schemas/ShippingAddress' }
 *         contacts:
 *           type: array
 *           items: { $ref: '#/components/schemas/ContactPerson' }
 *         assigned_to:        { type: string, description: "Employee ObjectId" }
 *         territory:          { type: string }
 *         internal_remarks:   { type: string }
 *
 *     CustomerUpdate:
 *       type: object
 *       minProperties: 1
 *       description: "All fields optional. customer_code and customer_id are immutable and will be ignored."
 *       properties:
 *         customer_name:    { type: string }
 *         customer_type:    { type: string, enum: [OEM, Dealer, Distributor, Direct, Government, Export, Other] }
 *         industry_segment: { type: string }
 *         priority:         { type: string, enum: ["Key Account", Regular, Prospect, Dormant, ""] }
 *         gstin:            { type: string, nullable: true }
 *         pan:              { type: string }
 *         tan:              { type: string }
 *         msme_number:      { type: string }
 *         is_sez:           { type: boolean }
 *         is_export:        { type: boolean }
 *         credit_limit:     { type: number,  minimum: 0 }
 *         credit_days:      { type: integer, minimum: 0 }
 *         payment_terms:    { type: string }
 *         currency:         { type: string }
 *         bank_details:     { $ref: '#/components/schemas/BankDetails' }
 *         billing_address:  { $ref: '#/components/schemas/Address' }
 *         assigned_to:      { type: string, description: "Employee ObjectId" }
 *         territory:        { type: string }
 *         internal_remarks: { type: string }
 *         is_credit_hold:   { type: boolean }
 *
 *     ManageShipping:
 *       type: object
 *       required: [action]
 *       properties:
 *         action:
 *           type: string
 *           enum: [add, update, remove]
 *         address_id:
 *           type: string
 *           description: "Required for action=update and action=remove (subdoc _id)"
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         address:
 *           $ref: '#/components/schemas/ShippingAddress'
 *           description: "Required for action=add and action=update"
 *
 *     ManageContact:
 *       type: object
 *       required: [action]
 *       properties:
 *         action:
 *           type: string
 *           enum: [add, update, remove, set_primary]
 *         contact_id:
 *           type: string
 *           description: "Required for action=update, remove, set_primary (subdoc _id)"
 *           example: "64f8e9b7a1b2c3d4e5f6a7b9"
 *         contact:
 *           $ref: '#/components/schemas/ContactPerson'
 *           description: "Required for action=add and action=update"
 *
 *     CreditHold:
 *       type: object
 *       required: [is_credit_hold]
 *       properties:
 *         is_credit_hold: { type: boolean, example: true }
 *         reason:         { type: string,  example: "Outstanding overdue > 90 days" }
 *
 *   responses:
 *     CustomerNotFound:
 *       description: Customer not found or inactive
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               message: { type: string,  example: "Customer not found" }
 */

// ─────────────────────────────────────────────────────────────────────────────
// CORE CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/customers:
 *   post:
 *     summary: Create a new customer
 *     description: |
 *       **Auto-generates** `customer_id` as `CUST-YYYYMM-XXXX` using an atomic counter.
 *
 *       `customer_code` is **immutable** after creation — choose carefully.
 *
 *       `gstin` is sparse-unique: null/empty is allowed (unregistered dealers), but if
 *       provided it must be unique across all customers and match the 15-char GST format.
 *
 *       **Validation is run inline** — all errors are returned at once in `errors[]`.
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerCreate'
 *           examples:
 *             full_oem:
 *               summary: Full OEM customer with contacts
 *               value:
 *                 customer_code: "SIEMENS-001"
 *                 customer_name: "Siemens India Ltd"
 *                 customer_type: "OEM"
 *                 industry_segment: "Switchgear"
 *                 priority: "Key Account"
 *                 gstin: "27AAECS7112G1Z5"
 *                 pan: "AAECS7112G"
 *                 credit_limit: 500000
 *                 credit_days: 45
 *                 payment_terms: "Net 45"
 *                 billing_address:
 *                   line1: "Kalwa Works, Thane"
 *                   city: "Thane"
 *                   state: "Maharashtra"
 *                   state_code: 27
 *                   pincode: "400605"
 *                 contacts:
 *                   - name: "Rajesh Sharma"
 *                     designation: "Purchase Manager"
 *                     mobile: "9876543210"
 *                     email: "rajesh@siemens.com"
 *                     is_primary: true
 *             minimal:
 *               summary: Minimal required fields only
 *               value:
 *                 customer_code: "BASIC-001"
 *                 customer_name: "Basic Customer Pvt Ltd"
 *                 customer_type: "Direct"
 *                 billing_address:
 *                   line1: "123 MG Road"
 *                   city: "Pune"
 *                   state: "Maharashtra"
 *                   state_code: 27
 *                   pincode: "411001"
 *             export_usd:
 *               summary: Export customer with USD currency
 *               value:
 *                 customer_code: "ACME-US-001"
 *                 customer_name: "ACME Corporation"
 *                 customer_type: "Export"
 *                 is_export: true
 *                 currency: "USD"
 *                 billing_address:
 *                   line1: "123 Industrial Ave"
 *                   city: "Detroit"
 *                   state: "Michigan"
 *                   state_code: 1
 *                   pincode: "48201"
 *                   country: "USA"
 *     responses:
 *       201:
 *         description: Customer created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Customer' }
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string,  example: "Validation failed" }
 *                 errors:
 *                   type: array
 *                   items: { type: string }
 *                   example: ["customer_code is required", "billing_address.state_code must be 1-37"]
 *       401:
 *         description: Not authenticated
 *       409:
 *         description: customer_code or GSTIN already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string,  example: "GSTIN \"27AAECS7112G1Z5\" is already registered under \"Siemens India Ltd\" (SIEMENS-001)" }
 *       500:
 *         description: Server error
 */
router.post('/', cc.createCustomer);

/**
 * @swagger
 * /api/customers:
 *   get:
 *     summary: List customers with pagination and filters
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page,             schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,            schema: { type: integer, default: 20, maximum: 100 } }
 *       - { in: query, name: sort,             schema: { type: string,  default: "-createdAt" }, description: "Prefix with - for descending. Sortable fields: createdAt, updatedAt, customer_name, customer_code, priority, credit_outstanding" }
 *       - { in: query, name: search,           schema: { type: string  }, description: "Searches customer_name, customer_code, gstin, customer_id" }
 *       - { in: query, name: customer_type,    schema: { type: string,  enum: [OEM, Dealer, Distributor, Direct, Government, Export, Other] } }
 *       - { in: query, name: industry_segment, schema: { type: string,  enum: [Automotive, Electronics, Energy, Switchgear, EV, Defence, General] } }
 *       - { in: query, name: priority,         schema: { type: string,  enum: ["Key Account", Regular, Prospect, Dormant] } }
 *       - { in: query, name: territory,        schema: { type: string  }, description: "Partial match" }
 *       - { in: query, name: assigned_to,      schema: { type: string  }, description: "Employee ObjectId" }
 *       - { in: query, name: currency,         schema: { type: string,  enum: [INR, USD, EUR, GBP, AED, JPY] } }
 *       - { in: query, name: is_credit_hold,   schema: { type: boolean } }
 *       - { in: query, name: is_sez,           schema: { type: boolean } }
 *       - { in: query, name: is_export,        schema: { type: boolean } }
 *     responses:
 *       200:
 *         description: Paginated customer list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:    { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Customer' }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:  { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     total: { type: integer, example: 42 }
 *                     pages: { type: integer, example: 3 }
 *       401: { description: Not authenticated }
 *       500: { description: Server error }
 */
router.get('/', cc.getCustomers);

/**
 * @swagger
 * /api/customers/{id}:
 *   get:
 *     summary: Get full customer detail
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string }, description: "MongoDB ObjectId" }
 *     responses:
 *       200:
 *         description: Customer document with all embedded sub-docs and virtuals
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Customer' }
 *       400: { description: Invalid ID format }
 *       401: { description: Not authenticated }
 *       404: { $ref: '#/components/responses/CustomerNotFound' }
 *       500: { description: Server error }
 */
router.get('/:id', cc.getCustomerById);

/**
 * @swagger
 * /api/customers/{id}:
 *   put:
 *     summary: Partial update — customer_code and customer_id are immutable
 *     description: |
 *       Send only the fields you want to change. Unknown fields are stripped.
 *       `customer_code` and `customer_id` are **immutable** — they will be silently ignored if sent.
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CustomerUpdate'
 *           example:
 *             priority: "Key Account"
 *             credit_limit: 1000000
 *             credit_days: 60
 *             payment_terms: "Net 60"
 *     responses:
 *       200:
 *         description: Customer updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Customer' }
 *       400: { description: Validation failed or no fields provided }
 *       401: { description: Not authenticated }
 *       404: { $ref: '#/components/responses/CustomerNotFound' }
 *       409: { description: GSTIN conflict }
 *       500: { description: Server error }
 */
router.put('/:id', cc.updateCustomer);

/**
 * @swagger
 * /api/customers/{id}:
 *   delete:
 *     summary: Soft-delete — sets is_active=false, no hard delete ever
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Customer deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string,  example: "Customer \"Siemens India Ltd\" (SIEMENS-001) deactivated" }
 *       400: { description: Invalid ID format }
 *       401: { description: Not authenticated }
 *       404: { $ref: '#/components/responses/CustomerNotFound' }
 *       500: { description: Server error }
 */
router.delete('/:id', cc.deleteCustomer);

// ─────────────────────────────────────────────────────────────────────────────
// SHIPPING ADDRESSES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/customers/{id}/shipping-addresses:
 *   put:
 *     summary: Add / update / remove a shipping address
 *     description: |
 *       **action: add** — push a new address into shipping_addresses[].
 *       **action: update** — patch an existing address by its subdoc `_id` (`address_id`).
 *       **action: remove** — remove an address by `address_id`.
 *
 *       `address_id` is the MongoDB `_id` of the subdocument, visible in the customer detail response.
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ManageShipping'
 *           examples:
 *             add:
 *               summary: Add new plant address
 *               value:
 *                 action: "add"
 *                 address:
 *                   label: "Aurangabad Plant"
 *                   line1: "Plot 42, MIDC"
 *                   city: "Aurangabad"
 *                   state: "Maharashtra"
 *                   state_code: 27
 *                   pincode: "431001"
 *                   is_default: false
 *             update:
 *               summary: Update an existing address
 *               value:
 *                 action: "update"
 *                 address_id: "64f8e9b7a1b2c3d4e5f6a7b8"
 *                 address:
 *                   label: "Aurangabad Plant (Updated)"
 *                   pincode: "431002"
 *             remove:
 *               summary: Remove an address
 *               value:
 *                 action: "remove"
 *                 address_id: "64f8e9b7a1b2c3d4e5f6a7b8"
 *     responses:
 *       200:
 *         description: Updated shipping_addresses array
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/ShippingAddress' }
 *       400: { description: Validation failed }
 *       401: { description: Not authenticated }
 *       404: { $ref: '#/components/responses/CustomerNotFound' }
 *       500: { description: Server error }
 */
router.put('/:id/shipping-addresses', cc.manageShipping);

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/customers/{id}/contacts:
 *   put:
 *     summary: Add / update / remove / set_primary a contact person
 *     description: |
 *       **action: add** — push a new contact. If `is_primary=true`, all other contacts are demoted.
 *       **action: update** — patch a contact by `contact_id`.
 *       **action: remove** — remove a contact by `contact_id`.
 *       **action: set_primary** — mark one contact as primary, all others are demoted.
 *
 *       A pre-save hook enforces max one `is_primary` contact across the array.
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ManageContact'
 *           examples:
 *             add:
 *               summary: Add new contact
 *               value:
 *                 action: "add"
 *                 contact:
 *                   name: "Priya Mehta"
 *                   designation: "Technical Manager"
 *                   mobile: "9123456780"
 *                   email: "priya@siemens.com"
 *                   is_primary: false
 *             set_primary:
 *               summary: Change primary contact
 *               value:
 *                 action: "set_primary"
 *                 contact_id: "64f8e9b7a1b2c3d4e5f6a7b9"
 *             remove:
 *               summary: Remove a contact
 *               value:
 *                 action: "remove"
 *                 contact_id: "64f8e9b7a1b2c3d4e5f6a7b9"
 *     responses:
 *       200:
 *         description: Updated contacts array
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/ContactPerson' }
 *       400: { description: Validation failed }
 *       401: { description: Not authenticated }
 *       404: { $ref: '#/components/responses/CustomerNotFound' }
 *       500: { description: Server error }
 */
router.put('/:id/contacts', cc.manageContacts);

// ─────────────────────────────────────────────────────────────────────────────
// CREDIT HOLD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/customers/{id}/credit-hold:
 *   put:
 *     summary: Apply or release credit hold
 *     description: |
 *       When `is_credit_hold=true`, new Sales Orders for this customer will be blocked
 *       at SO creation (enforced in Phase 03).
 *       The optional `reason` is saved to `internal_remarks`.
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreditHold'
 *           examples:
 *             apply:
 *               value: { is_credit_hold: true,  reason: "Outstanding overdue > 90 days" }
 *             release:
 *               value: { is_credit_hold: false, reason: "Payment received — cleared" }
 *     responses:
 *       200:
 *         description: Credit hold status changed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string,  example: "Credit hold applied for \"Siemens India Ltd\"" }
 *                 data:    { $ref: '#/components/schemas/Customer' }
 *       400: { description: Validation failed }
 *       401: { description: Not authenticated }
 *       404: { $ref: '#/components/responses/CustomerNotFound' }
 *       500: { description: Server error }
 */
router.put('/:id/credit-hold', cc.toggleCreditHold);

// ─────────────────────────────────────────────────────────────────────────────
// CREDIT OUTSTANDING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/customers/{id}/credit-outstanding:
 *   get:
 *     summary: Get credit limit vs outstanding summary
 *     description: |
 *       Returns `credit_available` = `credit_limit - credit_outstanding`.
 *       Returns `"Unlimited"` when `credit_limit = 0`.
 *
 *       `credit_outstanding` is maintained by the AR module (Phase 12).
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Credit summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     customer_id:        { type: string,  example: "CUST-202503-0001" }
 *                     customer_code:      { type: string,  example: "SIEMENS-001" }
 *                     customer_name:      { type: string,  example: "Siemens India Ltd" }
 *                     credit_limit:       { type: number,  example: 500000 }
 *                     credit_outstanding: { type: number,  example: 125000 }
 *                     credit_available:
 *                       oneOf:
 *                         - { type: number, example: 375000 }
 *                         - { type: string, example: "Unlimited" }
 *                     credit_days:        { type: integer, example: 45 }
 *                     payment_terms:      { type: string,  example: "Net 45" }
 *                     currency:           { type: string,  example: "INR" }
 *                     is_credit_hold:     { type: boolean, example: false }
 *       400: { description: Invalid ID format }
 *       401: { description: Not authenticated }
 *       404: { $ref: '#/components/responses/CustomerNotFound' }
 *       500: { description: Server error }
 */
router.get('/:id/credit-outstanding', cc.getCreditOutstanding);

module.exports = router;