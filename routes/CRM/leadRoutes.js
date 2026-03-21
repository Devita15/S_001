'use strict';
const express     = require('express');
const router      = express.Router();
const lc          = require('../../controllers/CRM/leadController');
const validate    = require('../../middleware/validate');
const { protect } = require('../../middleware/authMiddleware');
const v           = require('../../validators/leadValidators');
const { upload }  = require('../../utils/multer');

router.use(protect);

const multerErr = (err, req, res, next) => {
  if (err) return res.status(400).json({ success: false, message: err.message });
  next(err);
};

/**
 * @swagger
 * tags:
 *   name: Leads
 *   description: Lead / Enquiry capture, CRM pipeline, feasibility, follow-up, and conversion
 */

/**
 * @swagger
 * components:
 *   schemas:
 *
 *     EnquiredItem:
 *       type: object
 *       required: [description, quantity]
 *       properties:
 *         part_no:        { type: string, example: "BR-001" }
 *         description:    { type: string, example: "Copper Busbar 10x50x100" }
 *         quantity:       { type: integer, minimum: 1, example: 500 }
 *         unit:           { type: string, enum: [Nos, Kg, Meter, Set, Piece], example: "Nos" }
 *         target_price:   { type: number, example: 120.50 }
 *         material_grade: { type: string, example: "C11000" }
 *         drawing_ref_no: { type: string, example: "DWG-001" }
 *         remarks:        { type: string, example: "Tight tolerance required" }
 *
 *     FeasibilityCheckResult:
 *       type: object
 *       properties:
 *         status: { type: string, enum: [pass, fail, conditional, skip] }
 *         note:   { type: string }
 *         data:   { type: object }
 *
 *     FeasibilityItemResult:
 *       type: object
 *       properties:
 *         description:         { type: string }
 *         part_no:             { type: string }
 *         material_grade:      { type: string }
 *         quantity:            { type: number }
 *         unit:                { type: string }
 *         item_exists:         { $ref: '#/components/schemas/FeasibilityCheckResult' }
 *         material_check:      { $ref: '#/components/schemas/FeasibilityCheckResult' }
 *         dimension_check:     { $ref: '#/components/schemas/FeasibilityCheckResult' }
 *         process_check:       { $ref: '#/components/schemas/FeasibilityCheckResult' }
 *         stock_check:         { $ref: '#/components/schemas/FeasibilityCheckResult' }
 *         is_feasible:         { type: boolean }
 *         feasibility_verdict: { type: string, enum: [Feasible, "Conditionally Feasible", "Not Feasible"] }
 *
 *     Drawing:
 *       type: object
 *       properties:
 *         _id:          { type: string }
 *         drawing_no:   { type: string, example: "DWG-001" }
 *         file_name:    { type: string, example: "busbar_rev_A.pdf" }
 *         file_path:    { type: string }
 *         file_size_kb: { type: number }
 *         mime_type:    { type: string }
 *         revision_no:  { type: string, example: "A" }
 *         is_latest:    { type: boolean }
 *         uploaded_by:  { type: string }
 *         uploaded_at:  { type: string, format: date-time }
 *         remarks:      { type: string }
 *
 *     FollowUp:
 *       type: object
 *       properties:
 *         _id:              { type: string }
 *         date:             { type: string, format: date-time }
 *         channel:          { type: string, enum: [Call, Email, Visit, WhatsApp, Meeting] }
 *         summary:          { type: string }
 *         next_action:      { type: string }
 *         next_action_date: { type: string, format: date-time }
 *         outcome:          { type: string, enum: [Positive, Neutral, Negative, "No Response", ""] }
 *         done_by:
 *           type: object
 *           properties:
 *             _id:        { type: string }
 *             first_name: { type: string }
 *             last_name:  { type: string }
 *
 *     Lead:
 *       type: object
 *       properties:
 *         _id:                 { type: string }
 *         lead_id:             { type: string, example: "LEAD-202503-0001" }
 *         lead_source:         { type: string }
 *         subject:             { type: string }
 *         company_name:        { type: string }
 *         contact_name:        { type: string }
 *         enquired_items:      { type: array, items: { $ref: '#/components/schemas/EnquiredItem' } }
 *         drawings:            { type: array, items: { $ref: '#/components/schemas/Drawing' } }
 *         feasibility_status:  { type: string, enum: [Pending, Feasible, "Not Feasible", "Conditionally Feasible", ""] }
 *         feasibility_notes:   { type: string }
 *         feasibility_date:    { type: string, format: date-time }
 *         status:              { type: string, enum: [New, Contacted, Qualified, "Proposal Sent", Negotiation, Won, Lost, Junk] }
 *         is_converted:        { type: boolean }
 *         is_overdue:          { type: boolean }
 *         total_items:         { type: integer }
 *         drawing_count:       { type: integer }
 *         createdAt:           { type: string, format: date-time }
 *
 *     LeadCreate:
 *       type: object
 *       required: [lead_source, subject, company_name, contact_name]
 *       properties:
 *         lead_source:         { type: string, enum: [Website, Email, WhatsApp, Phone, Exhibition, Referral, "Cold Outreach", "Walk-In", LinkedIn, Other], example: "Exhibition" }
 *         lead_source_detail:  { type: string, example: "ELECRAMA 2025" }
 *         subject:             { type: string, example: "Copper Busbar 1000A for Transformer" }
 *         description:         { type: string }
 *         company_name:        { type: string, example: "Siemens India Ltd" }
 *         contact_name:        { type: string, example: "Rajesh Sharma" }
 *         contact_email:       { type: string, format: email, example: "rajesh@siemens.com" }
 *         contact_mobile:      { type: string, example: "9876543210" }
 *         contact_phone:       { type: string }
 *         designation:         { type: string, example: "Purchase Manager" }
 *         industry:            { type: string, example: "Switchgear" }
 *         company_size:        { type: string, enum: [Startup, SME, Mid-Market, Enterprise, Unknown, ""] }
 *         annual_turnover:     { type: number }
 *         priority:            { type: string, enum: [High, Medium, Low], default: "Medium" }
 *         estimated_value:     { type: number, example: 250000 }
 *         expected_close_date: { type: string, format: date }
 *         tags:                { type: array, items: { type: string }, example: ["Copper", "Urgent"] }
 *         assigned_to:         { type: string, description: "Employee ObjectId" }
 *         next_follow_up_date: { type: string, format: date-time }
 *         enquired_items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/EnquiredItem'
 *           example:
 *             - description: "Copper Busbar 10x50x1000mm"
 *               quantity: 500
 *               unit: "Nos"
 *               target_price: 120
 *               material_grade: "C11000"
 *               part_no: "BR-001"
 *
 *     LeadUpdate:
 *       type: object
 *       minProperties: 1
 *       properties:
 *         subject:             { type: string }
 *         company_name:        { type: string }
 *         contact_name:        { type: string }
 *         contact_email:       { type: string, format: email }
 *         contact_phone:       { type: string }
 *         contact_mobile:      { type: string }
 *         designation:         { type: string }
 *         industry:            { type: string }
 *         priority:            { type: string, enum: [High, Medium, Low, ""] }
 *         estimated_value:     { type: number }
 *         expected_close_date: { type: string, format: date }
 *         tags:                { type: array, items: { type: string } }
 *         assigned_to:         { type: string }
 *         next_follow_up_date: { type: string, format: date-time }
 *         lead_source_detail:  { type: string }
 *         enquired_items:      { type: array, items: { $ref: '#/components/schemas/EnquiredItem' } }
 *
 *     StatusTransition:
 *       type: object
 *       required: [status]
 *       properties:
 *         status:      { type: string, enum: [Contacted, Qualified, "Proposal Sent", Negotiation, Won, Lost, Junk], example: "Contacted" }
 *         lost_reason: { type: string, example: "Price too high vs competitor" }
 *         lost_to:     { type: string, example: "ABC Stampings Pvt Ltd" }
 *         win_remarks: { type: string, example: "Won on quality and delivery commitment" }
 *
 *     FollowUpCreate:
 *       type: object
 *       required: [channel, summary]
 *       properties:
 *         channel:          { type: string, enum: [Call, Email, Visit, WhatsApp, Meeting], example: "Call" }
 *         summary:          { type: string, example: "Discussed timeline. Customer wants 30-day delivery." }
 *         next_action:      { type: string, example: "Send revised quotation" }
 *         next_action_date: { type: string, format: date-time, description: "Must be a future date" }
 *         outcome:          { type: string, enum: [Positive, Neutral, Negative, "No Response", ""], example: "Positive" }
 *
 *     FeasibilitySubmit:
 *       type: object
 *       required: [feasibility_status]
 *       properties:
 *         feasibility_status: { type: string, enum: [Feasible, "Not Feasible", "Conditionally Feasible"], example: "Feasible" }
 *         feasibility_notes:  { type: string, example: "C11000 available. Existing tooling fits. 3-week lead time." }
 *
 *     ConvertLead:
 *       type: object
 *       description: "Provide EITHER existing_customer_id OR new_customer"
 *       properties:
 *         existing_customer_id: { type: string, description: "ObjectId of existing Customer to link" }
 *         new_customer:
 *           type: object
 *           required: [customer_code, customer_type, billing_address]
 *           properties:
 *             customer_code: { type: string, example: "SIEMENS-001" }
 *             customer_type: { type: string, enum: [OEM, Dealer, Distributor, Direct, Government, Export, Other], example: "OEM" }
 *             gstin:         { type: string, example: "27AAECS7112G1Z5" }
 *             credit_limit:  { type: number, example: 500000 }
 *             credit_days:   { type: integer, example: 45 }
 *             payment_terms: { type: string, enum: [Advance, "On Delivery", "Net 15", "Net 30", "Net 45", "Net 60", "Net 90", LC, Custom], example: "Net 30" }
 *             priority:      { type: string, enum: ["Key Account", Regular, Prospect, Dormant], example: "Regular" }
 *             billing_address:
 *               type: object
 *               required: [line1, city, state, state_code, pincode]
 *               properties:
 *                 line1:      { type: string, example: "Kalwa Works, Plot No 12" }
 *                 line2:      { type: string, example: "MIDC Industrial Area" }
 *                 city:       { type: string, example: "Thane" }
 *                 district:   { type: string, example: "Thane" }
 *                 state:      { type: string, example: "Maharashtra" }
 *                 state_code: { type: integer, minimum: 1, maximum: 37, example: 27 }
 *                 pincode:    { type: string, example: "400605" }
 *                 country:    { type: string, default: "India", example: "India" }
 *
 *     PipelineFunnelStage:
 *       type: object
 *       properties:
 *         status:      { type: string, example: "New" }
 *         count:       { type: integer, example: 12 }
 *         total_value: { type: number, example: 450000 }
 *         pct:         { type: number, example: 24.5, description: "Percentage of all leads at this stage" }
 *
 *     ConversionHistory:
 *       type: object
 *       properties:
 *         lead_id:      { type: string, example: "LEAD-202503-0001" }
 *         is_converted: { type: boolean, example: true }
 *         converted_at: { type: string, format: date-time }
 *         customer:
 *           type: object
 *           nullable: true
 *           properties:
 *             customer_id:   { type: string, example: "CUST-202503-0001" }
 *             customer_code: { type: string, example: "SIEMENS-001" }
 *             customer_name: { type: string, example: "Siemens India Ltd" }
 *             gstin:         { type: string, example: "27AAECS7112G1Z5" }
 *         audit_trail:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               changed_by:    { type: string }
 *               changed_at:    { type: string, format: date-time }
 *               field_changed: { type: string, example: "is_converted" }
 *               old_value:     { type: boolean, example: false }
 *               new_value:     { type: boolean, example: true }
 *
 *   responses:
 *     LeadNotFound:
 *       description: Lead not found
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               message: { type: string, example: "Lead not found" }
 *     Unauthorized:
 *       description: Not authenticated
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               message: { type: string, example: "Not authorized, token failed" }
 *     Forbidden:
 *       description: Insufficient role
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               message: { type: string, example: "Access denied" }
 *     ValidationError:
 *       description: Joi validation failed
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               message: { type: string, example: "Validation failed" }
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

// ─────────────────────────────────────────────────────────────────────────────
// AGGREGATES — must be before /:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/leads/dashboard:
 *   get:
 *     summary: Pipeline dashboard — funnel, conversion rate, salesperson stats
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/dashboard', lc.getDashboard);

/**
 * @swagger
 * /api/leads/overdue-followups:
 *   get:
 *     summary: Leads where next_follow_up_date has passed without action
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Overdue leads list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 count:   { type: integer, example: 5 }
 *                 data:    { type: array, items: { $ref: '#/components/schemas/Lead' } }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/overdue-followups', lc.getOverdueFollowups);

/**
 * @swagger
 * /api/leads/pipeline-funnel:
 *   get:
 *     summary: Pipeline funnel — lead count and value at each stage in order
 *     description: |
 *       Returns all 8 pipeline stages in order (New → Contacted → Qualified →
 *       Proposal Sent → Negotiation → Won → Lost → Junk) with count, total_value,
 *       and percentage of all leads at each stage.
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pipeline funnel data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:      { type: boolean, example: true }
 *                 total_leads:  { type: integer, example: 49 }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PipelineFunnelStage'
 *                   example:
 *                     - { status: "New",           count: 12, total_value: 450000,  pct: 24.5 }
 *                     - { status: "Contacted",     count: 9,  total_value: 320000,  pct: 18.4 }
 *                     - { status: "Qualified",     count: 8,  total_value: 280000,  pct: 16.3 }
 *                     - { status: "Proposal Sent", count: 7,  total_value: 210000,  pct: 14.3 }
 *                     - { status: "Negotiation",   count: 5,  total_value: 185000,  pct: 10.2 }
 *                     - { status: "Won",           count: 4,  total_value: 160000,  pct: 8.2  }
 *                     - { status: "Lost",          count: 3,  total_value: 90000,   pct: 6.1  }
 *                     - { status: "Junk",          count: 1,  total_value: 0,       pct: 2.0  }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Server error
 */
router.get('/pipeline-funnel', lc.getPipelineFunnel);


// ─────────────────────────────────────────────────────────────────────────────
// CORE CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/leads:
 *   post:
 *     summary: Create a new lead / enquiry
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LeadCreate'
 *           examples:
 *             full_lead:
 *               summary: Exhibition lead with enquired items
 *               value:
 *                 lead_source: "Exhibition"
 *                 lead_source_detail: "ELECRAMA 2025"
 *                 subject: "Copper Busbar 1000A for Transformer"
 *                 company_name: "Siemens India Ltd"
 *                 contact_name: "Rajesh Sharma"
 *                 contact_email: "rajesh@siemens.com"
 *                 contact_mobile: "9876543210"
 *                 designation: "Purchase Manager"
 *                 industry: "Switchgear"
 *                 priority: "High"
 *                 estimated_value: 250000
 *                 tags: ["Copper", "Urgent"]
 *                 enquired_items:
 *                   - description: "Copper Busbar 10x50x1000mm"
 *                     quantity: 500
 *                     unit: "Nos"
 *                     target_price: 120
 *                     material_grade: "C11000"
 *                     part_no: "BR-001"
 *             minimal:
 *               summary: Minimal required fields only
 *               value:
 *                 lead_source: "Phone"
 *                 subject: "AL Busbar enquiry"
 *                 company_name: "ABC Electricals"
 *                 contact_name: "Suresh Patel"
 *     responses:
 *       201:
 *         description: Lead created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Lead' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/', validate(v.createLeadSchema), lc.createLead);

/**
 * @swagger
 * /api/leads:
 *   get:
 *     summary: List leads with pagination and 15 filters
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page,               schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,              schema: { type: integer, default: 20 } }
 *       - { in: query, name: sort,               schema: { type: string, default: "-createdAt" } }
 *       - { in: query, name: status,             schema: { type: string, enum: [New, Contacted, Qualified, "Proposal Sent", Negotiation, Won, Lost, Junk] } }
 *       - { in: query, name: assigned_to,        schema: { type: string },  description: "Employee ObjectId" }
 *       - { in: query, name: lead_source,        schema: { type: string } }
 *       - { in: query, name: priority,           schema: { type: string, enum: [High, Medium, Low] } }
 *       - { in: query, name: company_name,       schema: { type: string },  description: "Searches company_name, contact_name, subject" }
 *       - { in: query, name: contact_email,      schema: { type: string } }
 *       - { in: query, name: contact_mobile,     schema: { type: string } }
 *       - { in: query, name: tags,               schema: { type: string },  description: "Comma-separated e.g. Copper,Urgent" }
 *       - { in: query, name: feasibility_status, schema: { type: string, enum: [Pending, Feasible, "Not Feasible", "Conditionally Feasible"] } }
 *       - { in: query, name: from_date,          schema: { type: string, format: date } }
 *       - { in: query, name: to_date,            schema: { type: string, format: date } }
 *       - { in: query, name: is_overdue,         schema: { type: boolean }, description: "true = overdue follow-up date" }
 *       - { in: query, name: is_converted,       schema: { type: boolean } }
 *     responses:
 *       200:
 *         description: Paginated leads list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:    { type: boolean, example: true }
 *                 data:       { type: array, items: { $ref: '#/components/schemas/Lead' } }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:  { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     total: { type: integer, example: 85 }
 *                     pages: { type: integer, example: 5 }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', lc.getLeads);

/**
 * @swagger
 * /api/leads/{id}:
 *   get:
 *     summary: Get full lead detail including follow_ups, drawings, feasibility
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Full lead document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Lead' }
 *       404:
 *         $ref: '#/components/responses/LeadNotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/:id', lc.getLeadById);

/**
 * @swagger
 * /api/leads/{id}:
 *   put:
 *     summary: Partial update lead — all fields optional
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LeadUpdate'
 *           example:
 *             priority: "High"
 *             estimated_value: 350000
 *             next_follow_up_date: "2025-03-28T00:00:00Z"
 *     responses:
 *       200:
 *         description: Lead updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Lead' }
 *       404:
 *         $ref: '#/components/responses/LeadNotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.put('/:id', validate(v.updateLeadSchema), lc.updateLead);

/**
 * @swagger
 * /api/leads/{id}:
 *   delete:
 *     summary: Soft-delete lead — sets is_active=false, never hard deleted
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Lead deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Lead deactivated" }
 *       404:
 *         $ref: '#/components/responses/LeadNotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.delete('/:id', lc.deleteLead);


// ─────────────────────────────────────────────────────────────────────────────
// STATUS MACHINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/leads/{id}/status:
 *   put:
 *     summary: Transition pipeline status (state-machine enforced)
 *     description: |
 *       **Valid transitions:**
 *       - New → Contacted | Junk
 *       - Contacted → Qualified | Junk
 *       - Qualified → Proposal Sent
 *       - Proposal Sent → Negotiation | Won | Lost
 *       - Negotiation → Won | Lost
 *       - Won / Lost / Junk → terminal
 *
 *       Invalid → 400 with `valid_next[]`. `lost_reason` required when status=Lost.
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StatusTransition'
 *           examples:
 *             to_contacted:
 *               summary: Move to Contacted
 *               value: { status: "Contacted" }
 *             to_won:
 *               summary: Mark as Won
 *               value: { status: "Won", win_remarks: "Won on quality and delivery" }
 *             to_lost:
 *               summary: Mark as Lost
 *               value: { status: "Lost", lost_reason: "Price too high vs competitor", lost_to: "ABC Stampings" }
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/Lead' }
 *       400:
 *         description: Invalid transition
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:    { type: boolean, example: false }
 *                 message:    { type: string, example: "Invalid transition: New → Won" }
 *                 valid_next: { type: array, items: { type: string }, example: ["Contacted", "Junk"] }
 *       404:
 *         $ref: '#/components/responses/LeadNotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.put('/:id/status', validate(v.statusTransitionSchema), lc.updateStatus);


// ─────────────────────────────────────────────────────────────────────────────
// FOLLOW-UP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/leads/{id}/followup:
 *   post:
 *     summary: Log a follow-up activity — appended, never deleted
 *     description: Updates lead.next_follow_up_date if next_action_date is provided. next_action_date must be future.
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FollowUpCreate'
 *           examples:
 *             call:
 *               summary: Phone call
 *               value:
 *                 channel: "Call"
 *                 summary: "Spoke with Rajesh. Interested but needs revised pricing."
 *                 outcome: "Positive"
 *                 next_action: "Send revised quotation with 5% discount"
 *                 next_action_date: "2025-03-27T10:00:00Z"
 *     responses:
 *       200:
 *         description: Follow-up logged
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { type: array, items: { $ref: '#/components/schemas/FollowUp' } }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/LeadNotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/:id/followup', validate(v.followUpSchema), lc.addFollowUp);


// ─────────────────────────────────────────────────────────────────────────────
// DRAWING UPLOAD & LIST
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/leads/{id}/drawing:
 *   post:
 *     summary: Upload customer drawing — full revision history kept
 *     description: |
 *       Content-Type must be multipart/form-data. File field name is `drawing`. Max 10MB.
 *       If drawing_no matches existing revision, old gets is_latest=false. Nothing deleted.
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [drawing]
 *             properties:
 *               drawing:     { type: string, format: binary, description: "PDF/DWG/DXF/PNG file" }
 *               drawing_no:  { type: string, example: "DWG-CUST-001" }
 *               revision_no: { type: string, default: "A", example: "B" }
 *               remarks:     { type: string, example: "Updated hole diameter to D3.5" }
 *     responses:
 *       201:
 *         description: Drawing uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:       { type: boolean, example: true }
 *                 data:          { type: array, description: "Latest drawings", items: { $ref: '#/components/schemas/Drawing' } }
 *                 all_revisions: { type: array, description: "All revisions for this drawing_no", items: { $ref: '#/components/schemas/Drawing' } }
 *       400:
 *         description: No file uploaded
 *       404:
 *         $ref: '#/components/responses/LeadNotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/:id/drawing', upload.single('drawing'), multerErr, lc.uploadDrawing);

/**
 * @swagger
 * /api/leads/{id}/drawings:
 *   get:
 *     summary: List all drawing revisions for a lead
 *     description: |
 *       Returns all drawings split into `latest` (is_latest=true) and
 *       `revisions` (is_latest=false), plus the full `all` array.
 *       Use this to render the drawing revision history table in the UI.
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string }, description: "Lead MongoDB ObjectId" }
 *     responses:
 *       200:
 *         description: Drawing list with revision history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:   { type: boolean, example: true }
 *                 lead_id:   { type: string, example: "LEAD-202503-0001" }
 *                 count:     { type: integer, example: 3, description: "Total drawings including all revisions" }
 *                 latest:
 *                   type: array
 *                   description: "Only is_latest=true drawings — one per drawing_no"
 *                   items: { $ref: '#/components/schemas/Drawing' }
 *                 revisions:
 *                   type: array
 *                   description: "Older revisions — is_latest=false"
 *                   items: { $ref: '#/components/schemas/Drawing' }
 *                 all:
 *                   type: array
 *                   description: "Complete list — latest + revisions combined"
 *                   items: { $ref: '#/components/schemas/Drawing' }
 *       404:
 *         $ref: '#/components/responses/LeadNotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Server error
 */
router.get('/:id/drawings', lc.getDrawings);


// ─────────────────────────────────────────────────────────────────────────────
// FEASIBILITY — TWO-LAYER DESIGN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/leads/{id}/feasibility-check:
 *   get:
 *     summary: Layer 1 — System auto-check (no human input needed)
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Auto-check result
 *       400:
 *         description: No enquired items on this lead
 *       404:
 *         $ref: '#/components/responses/LeadNotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/:id/feasibility-check', lc.getFeasibilityCheck);

/**
 * @swagger
 * /api/leads/{id}/feasibility:
 *   post:
 *     summary: Layer 2 — Production confirm or override
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FeasibilitySubmit'
 *     responses:
 *       200:
 *         description: Feasibility saved
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/LeadNotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/:id/feasibility', validate(v.feasibilitySchema), lc.submitFeasibility);


// ─────────────────────────────────────────────────────────────────────────────
// CONVERSION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/leads/{id}/convert:
 *   post:
 *     summary: Convert Won lead to Customer
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConvertLead'
 *     responses:
 *       201:
 *         description: Lead converted or linked
 *       400:
 *         description: Lead not Won or already converted
 *       409:
 *         description: customer_code or GSTIN conflict
 *       404:
 *         $ref: '#/components/responses/LeadNotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/:id/convert', lc.convertLead);

/**
 * @swagger
 * /api/leads/{id}/conversion-history:
 *   get:
 *     summary: Get conversion audit trail for a lead
 *     description: |
 *       Returns whether the lead was converted, when it was converted,
 *       which customer it was linked to, and the full audit log entries
 *       for the conversion event.
 *
 *       Useful for compliance, dispute resolution, and conversion timeline display.
 *     tags: [Leads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string }, description: "Lead MongoDB ObjectId" }
 *     responses:
 *       200:
 *         description: Conversion history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:    { $ref: '#/components/schemas/ConversionHistory' }
 *             examples:
 *               converted:
 *                 summary: Lead that has been converted
 *                 value:
 *                   success: true
 *                   data:
 *                     lead_id: "LEAD-202503-0001"
 *                     is_converted: true
 *                     converted_at: "2025-03-15T09:30:00.000Z"
 *                     customer:
 *                       customer_id: "CUST-202503-0001"
 *                       customer_code: "SIEMENS-001"
 *                       customer_name: "Siemens India Ltd"
 *                       gstin: "27AAECS7112G1Z5"
 *                     audit_trail:
 *                       - field_changed: "is_converted"
 *                         old_value: false
 *                         new_value: true
 *                         changed_at: "2025-03-15T09:30:00.000Z"
 *               not_converted:
 *                 summary: Lead not yet converted
 *                 value:
 *                   success: true
 *                   data:
 *                     lead_id: "LEAD-202503-0042"
 *                     is_converted: false
 *                     converted_at: null
 *                     customer: null
 *                     audit_trail: []
 *       404:
 *         $ref: '#/components/responses/LeadNotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Server error
 */
router.get('/:id/conversion-history', lc.getConversionHistory);

module.exports = router;