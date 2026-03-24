'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// quotationRoutes.js
// Mount at: app.use('/api/quotations', require('./routes/quotationRoutes'))
// ─────────────────────────────────────────────────────────────────────────────
const router = require('express').Router();
const {
  getQuotations, getQuotationTemplates, getQuotation,
  createQuotation, duplicateQuotation, downloadQuotationAsTemplate,
  reviseQuotation, sendQuotation, approveQuotation, rejectQuotation,
  calculateItemCost,
} = require('../../controllers/CRM/quotationController');

const { protect, authorize } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Quotations
 *   description: Quotation management — create, cost, approve, send, and download quotations across all 7 costing templates
 */

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT SCHEMAS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * components:
 *   schemas:
 *
 *     # ── Enumerations ──────────────────────────────────────────────────────
 *
 *     QuotationStatus:
 *       type: string
 *       enum: [Draft, Sent, Approved, Rejected, Cancelled]
 *       example: Draft
 *
 *     FormulaEngine:
 *       type: string
 *       enum: [busbar, landed_cost, cost_breakup, part_wise, nomex_sheet, revised_conversion, laser_fabrication]
 *       description: |
 *         Controls which costing formula is applied to every item:
 *         - **busbar** — Copper/Aluminium busbars (T × W × L × density, dynamic process columns)
 *         - **landed_cost** — Stampings/CT parts with ICC financing, GST set-off, plating
 *         - **cost_breakup** — Simple RM + operations + overhead% (proto / steering parts)
 *         - **part_wise** — Customer quotation: RM cost + conversion + margin + P&F
 *         - **nomex_sheet** — Sheet-cut insulation parts: weight-based RM + wastage + fabrication
 *         - **revised_conversion** — Assembly busbar sets with sub-parts, plating per kg
 *         - **laser_fabrication** — Full sheet metal: laser + special ops + bending + overheads
 *
 *     # ── Sub-schemas ───────────────────────────────────────────────────────
 *
 *     ProcessInput:
 *       type: object
 *       required: [process_id]
 *       properties:
 *         process_id:
 *           type: string
 *           description: MongoDB _id of the Process master record
 *           example: "664abc123def456789000001"
 *         rate_per_hour:
 *           type: number
 *           description: Rate to use. Meaning depends on Process.rate_type (Per Nos / Per Kg / Per Hour).
 *           example: 120
 *         hours:
 *           type: number
 *           default: 1
 *           description: Only used when rate_type = Per Hour
 *           example: 0.5
 *         machine:
 *           type: string
 *           example: "CNC Press 200T"
 *         outsourced_vendor_id:
 *           type: string
 *           description: Vendor _id if this operation is outsourced
 *           example: null
 *
 *     CostingParameters:
 *       type: object
 *       description: Optional per-item overrides for ICC / overhead settings. Falls back to template defaults when omitted.
 *       properties:
 *         margin_percent:                { type: number, example: 15 }
 *         ohp_percent_on_material:       { type: number, example: 10, description: "%" }
 *         ohp_percent_on_labour:         { type: number, example: 15, description: "%" }
 *         icc_credit_on_input_days:      { type: number, example: -30 }
 *         icc_wip_fg_days:               { type: number, example: 30 }
 *         icc_credit_given_days:         { type: number, example: 45 }
 *         icc_cost_of_capital:           { type: number, example: 0.10 }
 *         packing_cost_per_nos:          { type: number, example: 5 }
 *         inspection_cost_per_nos:       { type: number, example: 0.2 }
 *         tool_maintenance_cost_per_nos: { type: number, example: 0.2 }
 *         plating_cost_per_kg:           { type: number, example: 70 }
 *
 *     QuotationItemInput:
 *       type: object
 *       required: [PartNo, Quantity]
 *       description: One line item. The controller auto-loads Item master, DimensionWeight, and RawMaterial by PartNo.
 *       properties:
 *         PartNo:
 *           type: string
 *           description: Part number — must exist in Item master (case-insensitive)
 *           example: "CP-001-BUS"
 *         Quantity:
 *           type: number
 *           example: 500
 *         processes:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProcessInput'
 *         costing_parameters:
 *           $ref: '#/components/schemas/CostingParameters'
 *         # ── laser_fabrication-only fields ──
 *         path_length_sq_mm:    { type: number, example: 1200 }
 *         laser_rate_per_sq_mm: { type: number, example: 0.02 }
 *         start_points:         { type: number, example: 8 }
 *         start_point_rate:     { type: number, example: 2.5 }
 *         flatning_cost:        { type: number, example: 5 }
 *         drilling_cost:        { type: number, example: 3 }
 *         tapping_cost:         { type: number, example: 2 }
 *         csk_cost:             { type: number, example: 1.5 }
 *         bending_cost:         { type: number, example: 10 }
 *         fabrication_cost:     { type: number, example: 20 }
 *         # ── part_wise / nomex-only fields ──
 *         conversion_cost:      { type: number, example: 40 }
 *         wastage_pct:          { type: number, example: 5 }
 *         dev_cost_per_pc:      { type: number, example: 0 }
 *         pf_pct:               { type: number, example: 5 }
 *         sheet_no:             { type: integer, example: 1 }
 *
 *     QuotationItemResult:
 *       type: object
 *       description: Fully costed item as stored. All auto-computed fields are populated.
 *       properties:
 *         PartNo:                  { type: string }
 *         PartName:                { type: string }
 *         HSNCode:                 { type: string }
 *         Unit:                    { type: string }
 *         Quantity:                { type: number }
 *         Thickness:               { type: number }
 *         Width:                   { type: number }
 *         Length:                  { type: number }
 *         density:                 { type: number }
 *         rm_rate:                 { type: number }
 *         profile_conversion_rate: { type: number }
 *         total_rm_rate:           { type: number }
 *         gross_weight_kg:         { type: number }
 *         net_weight_kg:           { type: number }
 *         scrap_kgs:               { type: number }
 *         scrap_rate_per_kg:       { type: number }
 *         scrap_cost:              { type: number }
 *         gross_rm_cost:           { type: number }
 *         net_rm_cost:             { type: number }
 *         ProcessCost:             { type: number }
 *         OverheadPercent:         { type: number }
 *         OverheadAmount:          { type: number }
 *         MarginPercent:           { type: number }
 *         MarginAmount:            { type: number }
 *         SubTotal:                { type: number }
 *         FinalRate:               { type: number }
 *         Amount:                  { type: number }
 *         process_breakdown:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               process_name:    { type: string }
 *               calculated_cost: { type: number }
 *
 *     QuotationCustomerNew:
 *       type: object
 *       required: [customer_name, billing_address]
 *       description: Only required when customer.type = "New". Creates a Customer record on the fly.
 *       properties:
 *         customer_name:  { type: string, example: "Acme Industries Pvt Ltd" }
 *         customer_type:  { type: string, enum: [Direct, Dealer, OEM], example: "Direct" }
 *         gstin:          { type: string, example: "27AABCU9603R1ZX" }
 *         contact_person: { type: string, example: "Rahul Mehta" }
 *         email:          { type: string, example: "rahul@acme.com" }
 *         billing_address:
 *           type: object
 *           required: [line1, city, state, state_code, pincode]
 *           properties:
 *             line1:      { type: string, example: "Plot 12, Bhosari MIDC" }
 *             line2:      { type: string, example: "" }
 *             city:       { type: string, example: "Pune" }
 *             state:      { type: string, example: "Maharashtra" }
 *             state_code: { type: integer, example: 27 }
 *             pincode:    { type: string, example: "411026" }
 *
 *     ICCSettings:
 *       type: object
 *       description: Quotation-level ICC financing defaults. Override at item level via costing_parameters.
 *       properties:
 *         credit_on_input_days:    { type: number, default: -30,  example: -30 }
 *         wip_fg_days:             { type: number, default: 30,   example: 30 }
 *         credit_to_customer_days: { type: number, default: 45,   example: 45 }
 *         cost_of_capital:         { type: number, default: 0.10, example: 0.10 }
 *         ohp_percent_on_matl:     { type: number, default: 0.10, example: 0.10 }
 *         ohp_on_labour_pct:       { type: number, default: 0.15, example: 0.15 }
 *         inspection_cost:         { type: number, default: 0.2,  example: 0.2 }
 *         tool_maintenance_cost:   { type: number, default: 0.2,  example: 0.2 }
 *         packing_cost_per_nos:    { type: number, default: 5,    example: 5 }
 *         plating_cost_per_kg:     { type: number, default: 70,   example: 70 }
 *
 *     QuotationCreate:
 *       type: object
 *       required: [template_id, customer, items]
 *       properties:
 *         template_id:
 *           type: string
 *           description: MongoDB _id of the Template master
 *           example: "664abc123def456789000010"
 *         customer:
 *           type: object
 *           required: [type]
 *           properties:
 *             type:
 *               type: string
 *               enum: [Existing, New]
 *               example: "Existing"
 *             id:
 *               type: string
 *               description: Required when type = Existing
 *               example: "664abc123def456789000020"
 *             new:
 *               $ref: '#/components/schemas/QuotationCustomerNew'
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/QuotationItemInput'
 *         financials:
 *           type: object
 *           properties:
 *             gst_percentage:
 *               type: number
 *               default: 18
 *               example: 18
 *         icc:
 *           $ref: '#/components/schemas/ICCSettings'
 *         valid_till:
 *           type: string
 *           format: date
 *           description: Defaults to QuotationDate + 30 days
 *           example: "2025-04-20"
 *         remarks:
 *           type: object
 *           properties:
 *             internal: { type: string, example: "Check Cu rate before sending" }
 *             customer: { type: string, example: "Rate valid for 30 days from date of quotation" }
 *
 *     Quotation:
 *       type: object
 *       properties:
 *         _id:               { type: string }
 *         QuotationNo:       { type: string, example: "QT-202503-4521" }
 *         QuotationDate:     { type: string, format: date-time }
 *         ValidTill:         { type: string, format: date-time }
 *         Status:            { $ref: '#/components/schemas/QuotationStatus' }
 *         TemplateID:        { type: string }
 *         TemplateName:      { type: string }
 *         CompanyName:       { type: string }
 *         CompanyGSTIN:      { type: string }
 *         CustomerName:      { type: string }
 *         CustomerGSTIN:     { type: string }
 *         CustomerState:     { type: string }
 *         CustomerStateCode: { type: number }
 *         GSTType:           { type: string, enum: [CGST/SGST, IGST] }
 *         GSTPercentage:     { type: number }
 *         SubTotal:          { type: number }
 *         GSTAmount:         { type: number }
 *         GrandTotal:        { type: number }
 *         AmountInWords:     { type: string }
 *         Items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/QuotationItemResult'
 *         CreatedBy:
 *           type: object
 *           properties:
 *             _id:      { type: string }
 *             Username: { type: string }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     QuotationTemplate:
 *       type: object
 *       properties:
 *         _id:                    { type: string }
 *         template_code:          { type: string, example: "BUSBAR" }
 *         template_name:          { type: string, example: "Copper / Aluminium Busbar (Horizontal Table)" }
 *         formula_engine:         { $ref: '#/components/schemas/FormulaEngine' }
 *         excel_layout:           { type: string, enum: [horizontal_table, vertical_per_item] }
 *         default_margin_percent: { type: number, example: 15 }
 *         description:            { type: string }
 *
 *     QuotationListItem:
 *       type: object
 *       description: Lightweight record returned by GET /quotations (no Items array)
 *       properties:
 *         _id:           { type: string }
 *         QuotationNo:   { type: string }
 *         QuotationDate: { type: string, format: date-time }
 *         ValidTill:     { type: string, format: date-time }
 *         Status:        { $ref: '#/components/schemas/QuotationStatus' }
 *         CustomerName:  { type: string }
 *         TemplateName:  { type: string }
 *         GrandTotal:    { type: number }
 *
 *   responses:
 *     QuotationNotFound:
 *       description: Quotation not found
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               message: { type: string,  example: "Quotation not found" }
 *
 *     QuotationExcel:
 *       description: Excel workbook (.xlsx) streamed as a file download
 *       content:
 *         application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *           schema:
 *             type: string
 *             format: binary
 */

// ─────────────────────────────────────────────────────────────────────────────
// READ ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/quotations/templates:
 *   get:
 *     summary: List all active costing templates
 *     description: Returns the 7 seeded templates (BUSBAR, LANDED_COST, COST_BREAKUP, PART_WISE, NOMEX_SHEET, REVISED_CONV, LASER_FAB). Use the returned _id as template_id when creating a quotation.
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Template list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 count:   { type: integer, example: 7 }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/QuotationTemplate'
 */
router.get('/templates', protect, getQuotationTemplates);

/**
 * @swagger
 * /api/quotations:
 *   get:
 *     summary: Get all quotations with pagination and filters
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page,       schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,      schema: { type: integer, default: 10 } }
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: '#/components/schemas/QuotationStatus'
 *       - { in: query, name: customerId,  schema: { type: string }, description: "Filter by Customer _id" }
 *       - { in: query, name: templateId,  schema: { type: string }, description: "Filter by Template _id" }
 *       - { in: query, name: search,      schema: { type: string }, description: "Regex search on QuotationNo or CustomerName" }
 *       - { in: query, name: startDate,   schema: { type: string, format: date }, description: "QuotationDate >= startDate" }
 *       - { in: query, name: endDate,     schema: { type: string, format: date }, description: "QuotationDate <= endDate" }
 *       - { in: query, name: sortBy,      schema: { type: string, default: createdAt } }
 *       - { in: query, name: sortOrder,   schema: { type: string, enum: [asc, desc], default: desc } }
 *     responses:
 *       200:
 *         description: Quotation list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/QuotationListItem'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:       { type: integer }
 *                     totalPages: { type: integer }
 *                     total:      { type: integer }
 *                     limit:      { type: integer }
 *                 statistics:
 *                   type: object
 *                   description: Aggregate counts and total value across all quotations
 *                   properties:
 *                     total:    { type: integer }
 *                     totalAmt: { type: number }
 *                     draft:    { type: integer }
 *                     sent:     { type: integer }
 *                     approved: { type: integer }
 */
router.get('/', protect, getQuotations);

/**
 * @swagger
 * /api/quotations/{id}:
 *   get:
 *     summary: Get a single quotation by MongoDB _id
 *     description: Returns the full quotation including all costed items and their process breakdowns.
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Quotation detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Quotation' }
 *       404:
 *         $ref: '#/components/responses/QuotationNotFound'
 */
router.get('/:id', protect, getQuotation);

/**
 * @swagger
 * /api/quotations/{id}/download:
 *   get:
 *     summary: Re-render a quotation as a different template and download as Excel
 *     description: |
 *       Fetches the saved quotation data and re-renders it using any active template you supply.
 *       Useful for sending the same quotation in multiple formats (e.g. internal Busbar format vs customer Part-Wise format).
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path,  name: id,          required: true, schema: { type: string } }
 *       - { in: query, name: template_id,  required: true, schema: { type: string }, description: "Target Template _id to render with" }
 *     responses:
 *       200:
 *         $ref: '#/components/responses/QuotationExcel'
 *       400:
 *         description: template_id query param missing
 *       404:
 *         $ref: '#/components/responses/QuotationNotFound'
 */
router.get('/:id/download', protect, downloadQuotationAsTemplate);

// ─────────────────────────────────────────────────────────────────────────────
// CREATE / UPDATE ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/quotations:
 *   post:
 *     summary: Create a new quotation and stream the Excel file
 *     description: |
 *       **Full end-to-end flow in one call:**
 *       1. Resolves Item master, DimensionWeight, RawMaterial, Process, and Tax records for each item.
 *       2. Runs the costing calculator for the chosen template (busbar, landed_cost, etc.).
 *       3. Saves the Quotation + QuotationItemProcess records to MongoDB.
 *       4. Streams back a pixel-perfect `.xlsx` workbook as a file download.
 *
 *       **Auto-populated fields (do not send):**
 *       - `QuotationNo` — auto-generated (`QT-YYYYMM-NNNN`)
 *       - All computed cost fields (`gross_rm_cost`, `net_rm_cost`, `FinalRate`, `Amount`, etc.)
 *       - `SubTotal`, `GSTAmount`, `GrandTotal`, `AmountInWords`
 *       - `GSTType` — `IGST` if company state ≠ customer state, else `CGST/SGST`
 *       - `ValidTill` — QuotationDate + 30 days if not supplied
 *
 *       **Roles allowed:** Admin, Manager, Sales
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QuotationCreate'
 *           examples:
 *             busbar_existing_customer:
 *               summary: Busbar template — existing customer, two items
 *               value:
 *                 template_id: "664abc123def456789000010"
 *                 customer:
 *                   type: Existing
 *                   id: "664abc123def456789000020"
 *                 financials:
 *                   gst_percentage: 18
 *                 valid_till: "2025-04-20"
 *                 remarks:
 *                   internal: "Confirm Cu rate before dispatch"
 *                   customer: "Rates valid for 30 days"
 *                 items:
 *                   - PartNo: "CP-001-BUS"
 *                     Quantity: 500
 *                     processes:
 *                       - process_id: "664abc000000000000000001"
 *                         rate_per_hour: 120
 *                         hours: 0.5
 *                         machine: "CNC Press 200T"
 *                     costing_parameters:
 *                       margin_percent: 15
 *                   - PartNo: "CP-002-BUS"
 *                     Quantity: 250
 *                     processes:
 *                       - process_id: "664abc000000000000000002"
 *                         rate_per_hour: 80
 *                         hours: 1
 *                     costing_parameters:
 *                       margin_percent: 15
 *             landed_cost_new_customer:
 *               summary: Landed cost template — new customer
 *               value:
 *                 template_id: "664abc123def456789000011"
 *                 customer:
 *                   type: New
 *                   new:
 *                     customer_name: "Acme Industries Pvt Ltd"
 *                     customer_type: "OEM"
 *                     gstin: "27AABCU9603R1ZX"
 *                     contact_person: "Rahul Mehta"
 *                     email: "rahul@acme.com"
 *                     billing_address:
 *                       line1: "Plot 12, Bhosari MIDC"
 *                       city: "Pune"
 *                       state: "Maharashtra"
 *                       state_code: 27
 *                       pincode: "411026"
 *                 icc:
 *                   credit_on_input_days: -30
 *                   wip_fg_days: 30
 *                   credit_to_customer_days: 45
 *                   cost_of_capital: 0.10
 *                   plating_cost_per_kg: 70
 *                 items:
 *                   - PartNo: "ST-001-STAMP"
 *                     Quantity: 1000
 *                     processes:
 *                       - process_id: "664abc000000000000000003"
 *                         rate_per_hour: 200
 *                         hours: 0.25
 *                     costing_parameters:
 *                       margin_percent: 15
 *                       ohp_percent_on_material: 10
 *             laser_fabrication:
 *               summary: Laser + fabrication sheet metal
 *               value:
 *                 template_id: "664abc123def456789000016"
 *                 customer:
 *                   type: Existing
 *                   id: "664abc123def456789000021"
 *                 items:
 *                   - PartNo: "MS-BRKT-001"
 *                     Quantity: 100
 *                     path_length_sq_mm: 1500
 *                     laser_rate_per_sq_mm: 0.02
 *                     start_points: 6
 *                     start_point_rate: 2.5
 *                     flatning_cost: 5
 *                     bending_cost: 12
 *                     fabrication_cost: 25
 *                     costing_parameters:
 *                       margin_percent: 15
 *     responses:
 *       200:
 *         $ref: '#/components/responses/QuotationExcel'
 *       400:
 *         description: Validation error or master record not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Item \"CP-999\" not found in Item master" }
 *       404:
 *         description: Template, Customer, or Company not found
 */
router.post('/', protect,  createQuotation);

/**
 * @swagger
 * /api/quotations/item-cost:
 *   post:
 *     summary: Live cost preview for a single item (no DB save)
 *     description: |
 *       Pass a PartNo, template_id, optional processes, and costing parameters.
 *       Returns the fully costed item object — same as what gets stored on POST /quotations.
 *       Use this to power real-time cost breakdown UIs before the user saves the quotation.
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/QuotationItemInput'
 *               - type: object
 *                 properties:
 *                   template_id:
 *                     type: string
 *                     description: Optional. Defaults to busbar engine if omitted.
 *                     example: "664abc123def456789000010"
 *           example:
 *             template_id: "664abc123def456789000010"
 *             PartNo: "CP-001-BUS"
 *             Quantity: 500
 *             processes:
 *               - process_id: "664abc000000000000000001"
 *                 rate_per_hour: 120
 *                 hours: 0.5
 *             costing_parameters:
 *               margin_percent: 15
 *     responses:
 *       200:
 *         description: Costed item preview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/QuotationItemResult' }
 *       400:
 *         description: Calculation error or invalid input
 *       404:
 *         description: Part, RawMaterial, or Process not found
 */
router.post('/item-cost', protect, calculateItemCost);

/**
 * @swagger
 * /api/quotations/{id}/duplicate:
 *   post:
 *     summary: Duplicate a quotation (optionally for a different customer)
 *     description: |
 *       Creates a new Draft quotation with the same items as the source.
 *       Optionally re-targets to a different existing customer.
 *       Streams back the new quotation as an Excel download.
 *       **Roles allowed:** Admin, Manager, Sales
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string }, description: "Source quotation _id" }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customer:
 *                 type: object
 *                 description: Omit to keep the same customer as the source
 *                 properties:
 *                   type: { type: string, enum: [Existing], example: "Existing" }
 *                   id:   { type: string, example: "664abc123def456789000022" }
 *               valid_till:
 *                 type: string
 *                 format: date
 *                 description: Defaults to today + 30 days
 *                 example: "2025-05-01"
 *           example:
 *             customer:
 *               type: Existing
 *               id: "664abc123def456789000022"
 *             valid_till: "2025-05-01"
 *     responses:
 *       200:
 *         $ref: '#/components/responses/QuotationExcel'
 *       404:
 *         $ref: '#/components/responses/QuotationNotFound'
 */
router.post('/:id/duplicate', protect,  duplicateQuotation);

/**
 * @swagger
 * /api/quotations/{id}/revise:
 *   post:
 *     summary: Create a new revision of a quotation
 *     description: |
 *       Increments `revision_no`, snapshots the current items into `revision_history`, and resets Status to Draft.
 *       **Note:** This does NOT re-cost the items — use POST /quotations to create a fresh quotation if rates have changed.
 *       **Roles allowed:** Admin, Manager, Sales
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Customer requested updated Cu rate @ 860/kg"
 *     responses:
 *       200:
 *         description: Revision created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Quotation' }
 *                 message: { type: string, example: "Revision 2 created" }
 *       400:
 *         description: Cannot revise a Cancelled quotation
 *       404:
 *         $ref: '#/components/responses/QuotationNotFound'
 */
router.post('/:id/revise', protect,  reviseQuotation);

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW ACTION ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/quotations/{id}/send:
 *   post:
 *     summary: Send quotation to customer via email and download as Excel
 *     description: |
 *       1. Regenerates the Excel workbook from the saved quotation.
 *       2. If `CustomerEmail` is present and `SMTP_HOST` env var is configured, emails the workbook as an attachment.
 *       3. Sets `Status → Sent` and records a timestamp in `email_log`.
 *       4. Streams the same workbook back to the caller as a file download.
 *
 *       **Roles allowed:** Admin, Manager, Sales
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         $ref: '#/components/responses/QuotationExcel'
 *       400:
 *         description: Cannot send a Cancelled quotation
 *       404:
 *         $ref: '#/components/responses/QuotationNotFound'
 */
router.post('/:id/send', protect,  sendQuotation);

/**
 * @swagger
 * /api/quotations/{id}/approve:
 *   post:
 *     summary: Approve a quotation (Manager / Admin only)
 *     description: |
 *       Sets `Status → Approved` and records `ApprovedAt` timestamp.
 *       Quotation must currently be in `Sent` or `Under Review` status.
 *       **Roles allowed:** Admin, Manager
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Quotation approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Quotation' }
 *                 message: { type: string, example: "Quotation approved — Sales Order creation triggered" }
 *       400:
 *         description: Invalid status transition
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Cannot approve from status Draft" }
 *       404:
 *         $ref: '#/components/responses/QuotationNotFound'
 */
router.post('/:id/approve', protect, approveQuotation);

/**
 * @swagger
 * /api/quotations/{id}/reject:
 *   post:
 *     summary: Reject a quotation (Manager / Admin only)
 *     description: Sets `Status → Rejected`. A rejection reason is mandatory. **Roles allowed:** Admin, Manager
 *     tags: [Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rejection_reason]
 *             properties:
 *               rejection_reason:
 *                 type: string
 *                 example: "Customer went with competitor pricing"
 *     responses:
 *       200:
 *         description: Quotation rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Quotation' }
 *       400:
 *         description: rejection_reason is required
 *       404:
 *         $ref: '#/components/responses/QuotationNotFound'
 */
router.post('/:id/reject', protect, rejectQuotation);

module.exports = router;