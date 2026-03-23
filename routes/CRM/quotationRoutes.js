'use strict';

const express = require('express');
const router  = express.Router();
const { protect } = require('../../middleware/authMiddleware');

const {
  getQuotations,
  getQuotationTemplates,
  getQuotationsByTemplate,
  getQuotation,
  createQuotation,
  duplicateQuotation,
  downloadQuotationAsTemplate,
} = require('../../controllers/CRM/quotationController');


// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT — route order matters in Express.
// Static paths (/templates, /by-template) MUST be registered BEFORE /:id
// otherwise Express will treat "templates" as an :id parameter value.
// ─────────────────────────────────────────────────────────────────────────────


/**
 * @swagger
 * components:
 *   schemas:
 *
 *     CustomerInfo:
 *       type: object
 *       required:
 *         - type
 *       properties:
 *         type:
 *           type: string
 *           enum: [Existing, New]
 *           example: "Existing"
 *         id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7c1"
 *           description: "Required when type is Existing"
 *         new:
 *           $ref: '#/components/schemas/NewCustomerDetails'
 *           description: "Required when type is New"
 *
 *     NewCustomerDetails:
 *       type: object
 *       required:
 *         - customer_name
 *         - billing_address
 *       properties:
 *         customer_name:
 *           type: string
 *           example: "ABC Engineering Works"
 *         customer_type:
 *           type: string
 *           enum: [OEM, Dealer, Distributor, Direct, Government, Export, Other]
 *           example: "Direct"
 *         gstin:
 *           type: string
 *           example: "27ABCDE1234F1Z5"
 *         pan:
 *           type: string
 *           example: "ABCDE1234F"
 *         billing_address:
 *           type: object
 *           required: [line1, city, state, state_code, pincode]
 *           properties:
 *             line1:       { type: string, example: "Plot 123, MIDC" }
 *             line2:       { type: string, example: "" }
 *             city:        { type: string, example: "Pune" }
 *             state:       { type: string, example: "Maharashtra" }
 *             state_code:  { type: number, example: 27 }
 *             pincode:     { type: string, example: "411001" }
 *         contact_person:
 *           type: string
 *           example: "Rajesh Kumar"
 *         phone:
 *           type: string
 *           example: "9876543210"
 *         email:
 *           type: string
 *           example: "rajesh@abcengineering.com"
 *
 *     RemarksInfo:
 *       type: object
 *       properties:
 *         internal:
 *           type: string
 *           example: "Urgent delivery required within 2 weeks"
 *         customer:
 *           type: string
 *           example: "Please provide test certificates with each lot"
 *
 *     FinancialsInfo:
 *       type: object
 *       properties:
 *         gst_percentage:
 *           type: number
 *           example: 18
 *           default: 18
 *
 *     ICCInfo:
 *       type: object
 *       properties:
 *         credit_on_input_days:
 *           type: number
 *           example: -30
 *           default: -30
 *         wip_fg_days:
 *           type: number
 *           example: 30
 *           default: 30
 *         credit_to_customer_days:
 *           type: number
 *           example: 45
 *           default: 45
 *         cost_of_capital:
 *           type: number
 *           example: 0.10
 *           default: 0.10
 *
 *     CostingParameters:
 *       type: object
 *       properties:
 *         ohp_percent_on_material:
 *           type: number
 *           example: 0.10
 *         ohp_percent_on_labour:
 *           type: number
 *           example: 0.15
 *         inspection_cost_per_nos:
 *           type: number
 *           example: 0.20
 *         tool_maintenance_cost_per_nos:
 *           type: number
 *           example: 0.20
 *         packing_cost_per_nos:
 *           type: number
 *           example: 5.00
 *         plating_cost_per_kg:
 *           type: number
 *           example: 70.00
 *         margin_percent:
 *           type: number
 *           example: 15
 *
 *     ItemProcess:
 *       type: object
 *       required:
 *         - process_id
 *         - rate_per_hour
 *       properties:
 *         process_id:
 *           type: string
 *           example: "69a720ecfde48ece6e502ab3"
 *         rate_per_hour:
 *           type: number
 *           example: 252.50
 *         hours:
 *           type: number
 *           example: 1.5
 *           default: 1
 *         outsourced_vendor_id:
 *           type: string
 *           nullable: true
 *           example: null
 *         machine:
 *           type: string
 *           example: "CNC Laser"
 *
 *     QuotationItem:
 *       type: object
 *       required:
 *         - part_no
 *         - quantity
 *         - processes
 *       properties:
 *         part_no:
 *           type: string
 *           example: "BR-009"
 *         quantity:
 *           type: number
 *           example: 100
 *         costing_parameters:
 *           $ref: '#/components/schemas/CostingParameters'
 *         processes:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ItemProcess'
 *
 *     QuotationCreateRequest:
 *       type: object
 *       required:
 *         - customer
 *         - template_id
 *         - items
 *       properties:
 *         customer:
 *           $ref: '#/components/schemas/CustomerInfo'
 *         template_id:
 *           type: string
 *           example: "69a81713603b3e061ae69284"
 *         valid_till:
 *           type: string
 *           format: date
 *           example: "2026-06-30"
 *         remarks:
 *           $ref: '#/components/schemas/RemarksInfo'
 *         financials:
 *           $ref: '#/components/schemas/FinancialsInfo'
 *         icc:
 *           $ref: '#/components/schemas/ICCInfo'
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/QuotationItem'
 *
 *     DuplicateRequest:
 *       type: object
 *       properties:
 *         customer:
 *           $ref: '#/components/schemas/CustomerInfo'
 *           description: "Omit to keep the same customer as the source quotation"
 *         valid_till:
 *           type: string
 *           format: date
 *           example: "2026-06-30"
 *         remarks:
 *           $ref: '#/components/schemas/RemarksInfo'
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * tags:
 *   name: Quotations
 *   description: Quotation management — costing, Excel generation, template filtering
 */


// ─────────────────────────────────────────────────────────────────────────────
// GET /quotations
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/quotations:
 *   get:
 *     summary: Get all quotations with pagination, filtering and stats
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Draft, Sent, Approved, Rejected, Cancelled] }
 *       - in: query
 *         name: customerId
 *         schema: { type: string }
 *         description: Filter by Customer ObjectId
 *       - in: query
 *         name: templateId
 *         schema: { type: string }
 *         description: Filter by Template ObjectId
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search in QuotationNo or CustomerName
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Quotations list with pagination and statistics
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', protect, getQuotations);


// ─────────────────────────────────────────────────────────────────────────────
// GET /quotations/templates   ← MUST be before /:id
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/quotations/templates:
 *   get:
 *     summary: List all active templates (for dropdown)
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: |
 *           {
 *             success: true,
 *             count: 3,
 *             data: [
 *               { _id, template_code, template_name, formula_engine,
 *                 excel_layout, default_margin_percent, description }
 *             ]
 *           }
 *       401:
 *         description: Not authenticated
 */
router.get('/templates', protect, getQuotationTemplates);


// ─────────────────────────────────────────────────────────────────────────────
// GET /quotations/by-template   ← MUST be before /:id
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/quotations/by-template:
 *   get:
 *     summary: Get paginated quotations filtered by template_id
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: template_id
 *         required: true
 *         schema: { type: string }
 *         description: Template ObjectId
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search in QuotationNo or CustomerName
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Draft, Sent, Approved, Rejected, Cancelled] }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: |
 *           {
 *             success: true,
 *             template: { _id, template_code, template_name, formula_engine },
 *             data: Quotation[],
 *             pagination: { currentPage, totalPages, totalItems, itemsPerPage },
 *             statistics: { totalQuotations, totalAmount, avgAmount,
 *                           draftCount, sentCount, approvedCount }
 *           }
 *       400:
 *         description: template_id query parameter is required
 *       404:
 *         description: Template not found or inactive
 *       401:
 *         description: Not authenticated
 */
router.get('/by-template', protect, getQuotationsByTemplate);


// ─────────────────────────────────────────────────────────────────────────────
// GET /quotations/:id/download?template_id=<id>   ← MUST be before /:id
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/quotations/{id}/download:
 *   get:
 *     summary: Download an existing quotation as ANY template format
 *     description: |
 *       Re-renders the stored quotation data through whichever template you
 *       choose — without changing the DB record or recalculating any numbers.
 *
 *       Example use cases:
 *         - Same quotation → busbar layout for internal review
 *         - Same quotation → landed_cost layout for customer presentation
 *         - Same quotation → cost_breakup layout for costing audit
 *
 *       Pass the target template's ObjectId as ?template_id= in the query string.
 *       The downloaded filename will be <TEMPLATE_CODE>_<QUOTATION_NO>.xlsx
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Quotation ObjectId
 *       - in: query
 *         name: template_id
 *         required: true
 *         schema: { type: string }
 *         description: Target Template ObjectId (can differ from the quotation's own template)
 *     responses:
 *       200:
 *         description: Excel file (.xlsx) rendered in the requested template format
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             schema:
 *               type: string
 *               example: "attachment; filename=BUSBAR_QT-202503-0042.xlsx"
 *       400:
 *         description: template_id query parameter missing or invalid ID format
 *       404:
 *         description: Quotation or target template not found
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id/download', protect, downloadQuotationAsTemplate);


// ─────────────────────────────────────────────────────────────────────────────
// GET /quotations/:id
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/quotations/{id}:
 *   get:
 *     summary: Get a single quotation with all items and processes
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Quotation ObjectId
 *     responses:
 *       200:
 *         description: Quotation with Items[] (each item includes processes[])
 *       404:
 *         description: Quotation not found
 *       401:
 *         description: Not authenticated
 */
router.get('/:id', protect, getQuotation);


// ─────────────────────────────────────────────────────────────────────────────
// POST /quotations
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/quotations:
 *   post:
 *     summary: Create a new quotation — runs full costing and returns Excel download
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QuotationCreateRequest'
 *           example:
 *             customer:
 *               type: "Existing"
 *               id: "699edad52668ad28b8854111"
 *             template_id: "69a81713603b3e061ae69284"
 *             valid_till: "2026-06-30"
 *             remarks:
 *               internal: "Urgent — deliver within 2 weeks"
 *               customer: "Provide test certificates with each lot"
 *             financials:
 *               gst_percentage: 18
 *             icc:
 *               credit_on_input_days: -30
 *               wip_fg_days: 30
 *               credit_to_customer_days: 45
 *               cost_of_capital: 0.10
 *             items:
 *               - part_no: "BR-009"
 *                 quantity: 100
 *                 costing_parameters:
 *                   ohp_percent_on_material: 0.10
 *                   ohp_percent_on_labour: 0.15
 *                   inspection_cost_per_nos: 0.20
 *                   tool_maintenance_cost_per_nos: 0.20
 *                   packing_cost_per_nos: 5.00
 *                   plating_cost_per_kg: 70.00
 *                   margin_percent: 15
 *                 processes:
 *                   - process_id: "69a720ecfde48ece6e502ab3"
 *                     rate_per_hour: 252.50
 *                     hours: 1.5
 *                     outsourced_vendor_id: null
 *                     machine: "CNC Laser"
 *     responses:
 *       200:
 *         description: Excel file download (.xlsx)
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             schema:
 *               type: string
 *               example: "attachment; filename=TMPL_QT-202503-0042.xlsx"
 *       400:
 *         description: Validation error or master record not found
 *       404:
 *         description: Company / Customer / Template not found
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/', protect, createQuotation);


// ─────────────────────────────────────────────────────────────────────────────
// POST /quotations/:id/duplicate
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/quotations/{id}/duplicate:
 *   post:
 *     summary: Clone an existing quotation, optionally swapping the customer
 *     description: |
 *       Copies all costing fields verbatim — no recalculation.
 *       A new QuotationNo is auto-generated and Status is set to Draft.
 *       Pass body.customer to use a different customer; omit it to keep the same one.
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Source quotation ObjectId
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DuplicateRequest'
 *           example:
 *             customer:
 *               type: "Existing"
 *               id: "64f8e9b7a1b2c3d4e5f6a7c1"
 *             valid_till: "2026-09-30"
 *             remarks:
 *               internal: "Duplicate of QT-202503-0042 for new customer"
 *               customer: ""
 *     responses:
 *       200:
 *         description: New quotation saved + Excel file downloaded
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Source quotation or template not found
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
router.post('/:id/duplicate', protect, duplicateQuotation);


module.exports = router;