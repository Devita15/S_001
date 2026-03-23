// routes/Procurement/rfqRoutes.js
const express = require('express');
const router = express.Router();
const {
  // Basic CRUD Operations
  createRFQ,
  getAllRFQs,
  getRFQById,
  closeRFQ,
  
  // RFQ Workflow Actions
  sendRFQ,
  submitVendorQuote,
  selectVendor,
  remindVendors,
  
  // Analysis & Comparison
  getRFQComparison,
  

  
} = require('../../controllers/Procurement/rfqController');

const { protect, authorize } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: RFQ (Request for Quotation)
 *   description: RFQ management for vendor quotations and comparison
 */

// ======================================================
// COMMON COMPONENTS
// ======================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     # ========== RFQ ITEM SCHEMA ==========
 *     RFQItem:
 *       type: object
 *       required:
 *         - item_id
 *         - required_qty
 *       properties:
 *         item_id:
 *           type: string
 *           example: "69bcea4e94e5c414c62aed73"
 *           description: Item ID from Item master
 *         required_qty:
 *           type: number
 *           example: 500
 *           minimum: 1
 *         technical_specs:
 *           type: string
 *           example: "C11000 grade, thickness 2mm"
 *
 *     # ========== VENDOR RESPONSE ITEM SCHEMA ==========
 *     VendorResponseItem:
 *       type: object
 *       required:
 *         - item_id
 *         - quoted_rate
 *         - delivery_days
 *       properties:
 *         item_id:
 *           type: string
 *           example: "69bcea4e94e5c414c62aed73"
 *         quoted_rate:
 *           type: number
 *           example: 110
 *           description: Price per unit quoted by vendor
 *         delivery_days:
 *           type: number
 *           example: 7
 *           description: Delivery time in days
 *         moq:
 *           type: number
 *           example: 100
 *           description: Minimum Order Quantity
 *         payment_terms:
 *           type: string
 *           example: "Net 30"
 *         remarks:
 *           type: string
 *
 *     # ========== VENDOR RESPONSE SCHEMA ==========
 *     VendorResponse:
 *       type: object
 *       properties:
 *         vendor_id:
 *           type: string
 *         vendor_name:
 *           type: string
 *         sent_at:
 *           type: string
 *           format: date-time
 *         responded_at:
 *           type: string
 *           format: date-time
 *         response_items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/VendorResponseItem'
 *         overall_remarks:
 *           type: string
 *         is_complete:
 *           type: boolean
 *
 *     # ========== CREATE RFQ SCHEMA ==========
 *     RFQCreate:
 *       type: object
 *       required:
 *         - pr_id
 *         - valid_till
 *         - vendor_ids
 *       properties:
 *         pr_id:
 *           type: string
 *           example: "67f8e9b7a1b2c3d4e5f6a7d1"
 *           description: Purchase Requisition ID (must be Approved)
 *         valid_till:
 *           type: string
 *           format: date
 *           example: "2026-04-15"
 *           description: Date until which vendors can submit quotes
 *         vendor_ids:
 *           type: array
 *           items:
 *             type: string
 *           example: ["tata_steel_id", "jsw_steel_id"]
 *           description: List of AVL-approved vendor IDs
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RFQItem'
 *           description: Items to quote (optional, uses PR items if not provided)
 *
 *     # ========== SUBMIT QUOTE SCHEMA ==========
 *     SubmitQuote:
 *       type: object
 *       required:
 *         - vendor_id
 *         - response_items
 *       properties:
 *         vendor_id:
 *           type: string
 *           example: "tata_steel_id"
 *         response_items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/VendorResponseItem'
 *         overall_remarks:
 *           type: string
 *           example: "Special discount for bulk order"
 *
 *     # ========== SELECT VENDOR SCHEMA ==========
 *     SelectVendor:
 *       type: object
 *       required:
 *         - vendor_id
 *       properties:
 *         vendor_id:
 *           type: string
 *           example: "jsw_steel_id"
 *         recommendation_notes:
 *           type: string
 *           example: "Best price, acceptable delivery terms"
 *
 *     # ========== REMIND VENDORS SCHEMA ==========
 *     RemindVendors:
 *       type: object
 *       properties:
 *         vendor_ids:
 *           type: array
 *           items:
 *             type: string
 *           description: Specific vendor IDs to remind (empty = all pending)
 *
 *     # ========== RFQ FULL RESPONSE SCHEMA ==========
 *     RFQ:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         rfq_number:
 *           type: string
 *           example: "RFQ-202603-0001"
 *         rfq_date:
 *           type: string
 *           format: date-time
 *         pr_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             pr_number:
 *               type: string
 *         valid_till:
 *           type: string
 *           format: date
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               item_id:
 *                 type: object
 *               part_no:
 *                 type: string
 *               description:
 *                 type: string
 *               required_qty:
 *                 type: number
 *               unit:
 *                 type: string
 *         vendors:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/VendorResponse'
 *         status:
 *           type: string
 *           enum: ['Draft', 'Sent', 'Partially Responded', 'Fully Responded', 'Compared', 'Closed']
 *         recommended_vendor:
 *           type: object
 *         recommendation_notes:
 *           type: string
 *         comparison_matrix:
 *           type: object
 *         created_by:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     # ========== COMPARISON RESPONSE SCHEMA ==========
 *     RFQComparison:
 *       type: object
 *       properties:
 *         rfq_number:
 *           type: string
 *         summary:
 *           type: object
 *           properties:
 *             total_items:
 *               type: number
 *             vendors_invited:
 *               type: number
 *             vendors_responded:
 *               type: number
 *             lowest_total_value:
 *               type: number
 *             highest_total_value:
 *               type: number
 *             potential_savings:
 *               type: number
 *             best_overall_vendor:
 *               type: string
 *         item_wise_comparison:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               part_no:
 *                 type: string
 *               required_qty:
 *                 type: number
 *               quotes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     vendor_name:
 *                       type: string
 *                     quoted_rate:
 *                       type: number
 *                     total_value:
 *                       type: number
 *                     delivery_days:
 *                       type: number
 *         vendor_wise_summary:
 *           type: object
 *
 *   responses:
 *     RFQNotFound:
 *       description: RFQ not found
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "RFQ not found"
 *               error:
 *                 type: string
 *                 example: "RFQ_NOT_FOUND"
 *
 *     InvalidRFQStatus:
 *       description: RFQ is in invalid status for this operation
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "Cannot send RFQ with status: Draft. Only Draft RFQs can be sent"
 *               error:
 *                 type: string
 *                 example: "INVALID_RFQ_STATUS"
 *
 *     RFQExpired:
 *       description: RFQ validity period has expired
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               message:
 *                 type: string
 *                 example: "RFQ validity period has expired"
 *               error:
 *                 type: string
 *                 example: "RFQ_EXPIRED"
 *
 *   parameters:
 *     rfqIdParam:
 *       in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: string
 *       description: RFQ ID
 *
 *     rfqStatusQuery:
 *       in: query
 *       name: status
 *       schema:
 *         type: string
 *         enum: ['Draft', 'Sent', 'Partially Responded', 'Fully Responded', 'Compared', 'Closed']
 *       description: Filter by RFQ status
 *
 *     vendorIdQuery:
 *       in: query
 *       name: vendor_id
 *       schema:
 *         type: string
 *       description: Filter by vendor ID
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */


/**
 * @swagger
 * /api/rfqs:
 *   post:
 *     summary: Create a new RFQ from an approved PR
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RFQCreate'
 *           example:
 *             pr_id: "67f8e9b7a1b2c3d4e5f6a7d1"
 *             valid_till: "2026-04-15"
 *             vendor_ids: ["tata_steel_id", "jsw_steel_id", "local_metals_id"]
 *     responses:
 *       201:
 *         description: RFQ created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "RFQ created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     rfq_number:
 *                       type: string
 *                       example: "RFQ-202603-0001"
 *                     items_count:
 *                       type: integer
 *                     vendors_count:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       example: "Draft"
 *       400:
 *         description: Bad request
 *       404:
 *         description: PR or Vendor not found
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/', protect, authorize('admin', 'manager', 'purchase'), createRFQ);

/**
 * @swagger
 * /api/rfqs:
 *   get:
 *     summary: Get all RFQs with pagination and filtering
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - $ref: '#/components/parameters/rfqStatusQuery'
 *       - in: query
 *         name: pr_id
 *         schema:
 *           type: string
 *         description: Filter by PR ID
 *       - $ref: '#/components/parameters/vendorIdQuery'
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by RFQ date from
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by RFQ date to
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: ['createdAt', 'rfq_number', 'valid_till']
 *           default: createdAt
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: ['asc', 'desc']
 *           default: desc
 *     responses:
 *       200:
 *         description: RFQs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RFQ'
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', protect, getAllRFQs);

/**
 * @swagger
 * /api/rfqs/{id}:
 *   get:
 *     summary: Get RFQ by ID with full details
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/rfqIdParam'
 *     responses:
 *       200:
 *         description: RFQ retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/RFQ'
 *       404:
 *         $ref: '#/components/responses/RFQNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', protect, getRFQById);

// ======================================================
// RFQ WORKFLOW ACTIONS
// ======================================================

/**
 * @swagger
 * /api/rfqs/{id}/send:
 *   put:
 *     summary: Send RFQ to vendors (updates status to Sent and sends emails)
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/rfqIdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               send_email:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to send actual emails
 *     responses:
 *       200:
 *         description: RFQ sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "RFQ sent successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     rfq_number:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "Sent"
 *                     email_results:
 *                       type: array
 *       400:
 *         description: Bad request
 *       404:
 *         $ref: '#/components/responses/RFQNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id/send', protect, authorize('admin', 'manager', 'purchase'), sendRFQ);

/**
 * @swagger
 * /api/rfqs/{id}/submit-quote:
 *   post:
 *     summary: Vendor submits quotation for RFQ
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/rfqIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubmitQuote'
 *           example:
 *             vendor_id: "jsw_steel_id"
 *             response_items:
 *               - item_id: "69bcea4e94e5c414c62aed73"
 *                 quoted_rate: 105
 *                 delivery_days: 7
 *                 payment_terms: "Net 45"
 *             overall_remarks: "Special discount for bulk order"
 *     responses:
 *       200:
 *         description: Quotation submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Quotation submitted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     rfq_number:
 *                       type: string
 *                     vendor_name:
 *                       type: string
 *                     is_complete:
 *                       type: boolean
 *                     status:
 *                       type: string
 *       400:
 *         description: Bad request
 *       404:
 *         $ref: '#/components/responses/RFQNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/:id/submit-quote', protect, submitVendorQuote);

/**
 * @swagger
 * /api/rfqs/{id}/remind:
 *   post:
 *     summary: Send reminder emails to pending vendors
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/rfqIdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RemindVendors'
 *           example:
 *             vendor_ids: ["tata_steel_id", "local_metals_id"]
 *     responses:
 *       200:
 *         description: Reminders sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Reminders sent successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     reminders_sent:
 *                       type: integer
 *                     reminder_results:
 *                       type: array
 *       400:
 *         description: No pending vendors to remind
 *       404:
 *         $ref: '#/components/responses/RFQNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/:id/remind', protect, authorize('admin', 'manager', 'purchase'), remindVendors);

// ======================================================
// COMPARISON & SELECTION
// ======================================================

/**
 * @swagger
 * /api/rfqs/{id}/comparison:
 *   get:
 *     summary: Get detailed comparison of all vendor quotes
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/rfqIdParam'
 *     responses:
 *       200:
 *         description: Comparison matrix retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/RFQComparison'
 *       404:
 *         $ref: '#/components/responses/RFQNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id/comparison', protect, getRFQComparison);

/**
 * @swagger
 * /api/rfqs/{id}/select-vendor:
 *   put:
 *     summary: Select winning vendor and close comparison
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/rfqIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SelectVendor'
 *           example:
 *             vendor_id: "jsw_steel_id"
 *             recommendation_notes: "Best price at ₹105/kg, delivery within 7 days"
 *     responses:
 *       200:
 *         description: Vendor selected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Vendor selected successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     rfq_number:
 *                       type: string
 *                     selected_vendor:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "Compared"
 *                     next_step:
 *                       type: string
 *                       example: "You can now create Purchase Order from this RFQ"
 *       400:
 *         description: No vendor responses or incomplete quote
 *       404:
 *         $ref: '#/components/responses/RFQNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id/select-vendor', protect, authorize('admin', 'manager', 'purchase'), selectVendor);

/**
 * @swagger
 * /api/rfqs/{id}/close:
 *   put:
 *     summary: Close RFQ (no further quotes accepted)
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/rfqIdParam'
 *     responses:
 *       200:
 *         description: RFQ closed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "RFQ closed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     rfq_number:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "Closed"
 *       400:
 *         description: RFQ already closed
 *       404:
 *         $ref: '#/components/responses/RFQNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id/close', protect, authorize('admin', 'manager', 'purchase'), closeRFQ);

module.exports = router;