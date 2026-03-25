'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// routes/CRM/salesOrderRoutes.js
// Phase 03 — BE-009 + BE-010 + BE-011
//
// Mount in app.js:
//   const salesOrderRoutes = require('./routes/CRM/salesOrderRoutes');
//   app.use('/api/sales-orders', salesOrderRoutes);
//   app.use('/api/analytics',    salesOrderRoutes);   // for /otif endpoint
//
// ROUTE ORDER RULES (Express matches top-to-bottom):
//   1. Named static routes  → /order-book, /delivery-due, /reports/*
//   2. Collection routes    → GET /, POST /
//   3. Param routes         → /:id, /:id/confirm, etc.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { protect } = require('../../middleware/authMiddleware');

const {
  uploadPoFile,
  createSalesOrder,
  getSalesOrders,
  getSalesOrderById,
  updateSalesOrder,
  confirmSalesOrder,
  getDeliveryStatus,
  getOrderBook,
  getDeliveryDue,
  cancelSalesOrder,
  getOtifKpi,
  getSoHistory,
  reviseSalesOrder,
  getSoRevisions,
  acknowledgeSalesOrder,
  cancelSoLineItem,
  getReportSummary,
  getReportPendingDelivery,
} = require('../../controllers/CRM/salesOrderController');

// ─────────────────────────────────────────────────────────────────────────────
// Multer error handler wrapper
// Multer throws synchronously on file type / size errors.
// Without this wrapper, Express never reaches the controller.
// ─────────────────────────────────────────────────────────────────────────────
const handlePoUpload = (req, res, next) => {
  uploadPoFile(req, res, (multerErr) => {
    if (multerErr) {
      return res.status(400).json({
        success: false,
        message: multerErr.message || 'File upload failed',
      });
    }
    next();
  });
};

// All routes require a valid JWT
router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// ██  BLOCK 1 — NAMED / AGGREGATE routes
//     MUST come before /:id routes to avoid Express treating the path
//     segment as a dynamic param (e.g. "order-book" being read as id).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales-orders/order-book:
 *   get:
 *     summary: Open order book — confirmed SOs with pending lines
 *     tags: ["02 — SO Delivery"]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order book returned
 *       401:
 *         description: Unauthorized
 */
router.get('/order-book', getOrderBook);

/**
 * @swagger
 * /api/sales-orders/delivery-due:
 *   get:
 *     summary: SOs with committed delivery dates in the next N days
 *     tags: ["02 — SO Delivery"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *           minimum: 1
 *         description: Lookahead window in days
 *     responses:
 *       200:
 *         description: Delivery due list
 *       401:
 *         description: Unauthorized
 */
router.get('/delivery-due', getDeliveryDue);

/**
 * @swagger
 * /api/sales-orders/reports/summary:
 *   get:
 *     summary: SO value summary by customer, month, and status
 *     tags: ["05 — SO Reports"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         example: "2025-01-01"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         example: "2025-03-31"
 *     responses:
 *       200:
 *         description: Summary report
 *       401:
 *         description: Unauthorized
 */
router.get('/reports/summary', getReportSummary);

/**
 * @swagger
 * /api/sales-orders/reports/pending-delivery:
 *   get:
 *     summary: Pending delivery report grouped by customer
 *     tags: ["05 — SO Reports"]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending delivery report
 *       401:
 *         description: Unauthorized
 */
router.get('/reports/pending-delivery', getReportPendingDelivery);

/**
 * @swagger
 * /api/analytics/otif:
 *   get:
 *     summary: OTIF KPI — On-Time In-Full percentage
 *     tags: ["06 — Analytics"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: "2025-01-01"
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: "2025-03-31"
 *     responses:
 *       200:
 *         description: OTIF KPI computed
 *       400:
 *         description: Missing or invalid date parameters
 *       401:
 *         description: Unauthorized
 */
router.get('/otif', getOtifKpi);

// ─────────────────────────────────────────────────────────────────────────────
// ██  BLOCK 2 — COLLECTION routes  (GET /, POST /)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales-orders:
 *   post:
 *     summary: Create a new Sales Order (Draft)
 *     tags: ["01 — SO CRUD"]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSalesOrderRequest'
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               customer_po_file:
 *                 type: string
 *                 format: binary
 *                 description: "PDF/JPEG/PNG/TIFF, max 10 MB"
 *     responses:
 *       201:
 *         description: SO created (status = Draft)
 *       400:
 *         description: Validation error or credit limit exceeded
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Customer or Company not found
 */
router.post('/', handlePoUpload, createSalesOrder);

/**
 * @swagger
 * /api/sales-orders:
 *   get:
 *     summary: List Sales Orders with filters and pagination
 *     tags: ["01 — SO CRUD"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Comma-separated statuses e.g. "Confirmed,In Production"
 *       - in: query
 *         name: customer_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: customer_po_number
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
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
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: "-so_date"
 *     responses:
 *       200:
 *         description: Paginated SO list
 *       401:
 *         description: Unauthorized
 */
router.get('/', getSalesOrders);

// ─────────────────────────────────────────────────────────────────────────────
// ██  BLOCK 3 — DOCUMENT routes  /:id  and  /:id/sub-resource
//
//     Sub-resource POST routes (/:id/confirm, /:id/cancel, etc.) are grouped
//     here. Express will try each in order — no conflict since the second
//     path segment differs for each.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/sales-orders/{id}:
 *   get:
 *     summary: Get a single Sales Order by ID
 *     tags: ["01 — SO CRUD"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/soId'
 *     responses:
 *       200:
 *         description: Full SO document
 *       400:
 *         description: Invalid ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Sales Order not found
 */
router.get('/:id', getSalesOrderById);

/**
 * @swagger
 * /api/sales-orders/{id}:
 *   put:
 *     summary: Update SO header fields only
 *     description: |
 *       Updatable fields: expected_delivery_date, payment_terms, delivery_terms,
 *       delivery_mode, transporter, internal_remarks, shipping_address,
 *       billing_address, customer_po_number, customer_po_date, terms_conditions.
 *       For qty/price changes use POST /:id/revise.
 *       Cannot update Cancelled or Closed SOs.
 *     tags: ["01 — SO CRUD"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/soId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateSORequest'
 *     responses:
 *       200:
 *         description: SO updated
 *       400:
 *         description: Terminal status or no valid fields provided
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Sales Order not found
 */
router.put('/:id', updateSalesOrder);

/**
 * @swagger
 * /api/sales-orders/{id}/confirm:
 *   post:
 *     summary: Confirm a Draft SO (Draft → Confirmed)
 *     tags: ["01 — SO CRUD"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/soId'
 *     responses:
 *       200:
 *         description: SO confirmed
 *       400:
 *         description: Not a Draft SO, or credit limit exceeded
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Sales Order not found
 */
router.post('/:id/confirm', confirmSalesOrder);

/**
 * @swagger
 * /api/sales-orders/{id}/cancel:
 *   post:
 *     summary: Cancel a Sales Order with cascade to WO / PR / StockReservation
 *     tags: ["04 — SO Cancellation"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/soId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cancellation_reason]
 *             properties:
 *               cancellation_reason:
 *                 type: string
 *                 minLength: 5
 *                 example: "Customer cancelled project due to budget freeze"
 *     responses:
 *       200:
 *         description: SO cancelled with cascade summary
 *       400:
 *         description: Missing reason or SO already terminal
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Sales Order not found
 */
router.post('/:id/cancel', cancelSalesOrder);

/**
 * @swagger
 * /api/sales-orders/{id}/revise:
 *   post:
 *     summary: Create an SO revision (amendment)
 *     description: |
 *       Snapshots current items, increments current_revision, applies changes.
 *       Allowed item fields: ordered_qty, unit_price, committed_date,
 *       required_date, discount_percent, remarks.
 *       Allowed header fields: expected_delivery_date, payment_terms,
 *       delivery_terms, internal_remarks.
 *       ordered_qty cannot go below delivered_qty.
 *       Cannot revise Cancelled or Closed SOs.
 *     tags: ["03 — SO Revision & Acknowledgement"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/soId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReviseSORequest'
 *     responses:
 *       200:
 *         description: SO revised
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Sales Order not found
 */
router.post('/:id/revise', reviseSalesOrder);

/**
 * @swagger
 * /api/sales-orders/{id}/acknowledge:
 *   post:
 *     summary: Generate Order Acknowledgement PDF (optionally email it)
 *     description: |
 *       Always returns the PDF as a binary download.
 *       Also emails it if SMTP is configured and a recipient email is found.
 *       Allowed SO statuses: Confirmed, In Production, Ready for Dispatch,
 *       Partially Delivered, Fully Delivered.
 *     tags: ["03 — SO Revision & Acknowledgement"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/soId'
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Override recipient email (optional)
 *                 example: "purchase@siemens.in"
 *     responses:
 *       200:
 *         description: PDF binary download
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: SO not in an acknowledgeable status
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Sales Order or Company not found
 */
router.post('/:id/acknowledge', acknowledgeSalesOrder);

/**
 * @swagger
 * /api/sales-orders/{id}/cancel-line/{lineItemId}:
 *   post:
 *     summary: Soft-cancel a single SO line item
 *     description: |
 *       Marks one line item as cancelled without cancelling the entire SO.
 *       Cannot cancel a line that already has deliveries (delivered_qty > 0).
 *     tags: ["04 — SO Cancellation"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/soId'
 *       - in: path
 *         name: lineItemId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB _id of the SO line item subdocument
 *         example: "665abc123def456789012abc"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cancel_reason]
 *             properties:
 *               cancel_reason:
 *                 type: string
 *                 example: "Customer removed this part from their BOM"
 *     responses:
 *       200:
 *         description: Line item cancelled
 *       400:
 *         description: Already cancelled or has deliveries
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: SO or line item not found
 */
router.post('/:id/cancel-line/:lineItemId', cancelSoLineItem);

/**
 * @swagger
 * /api/sales-orders/{id}/delivery-status:
 *   get:
 *     summary: Real-time delivery status per line item with OTIF flag
 *     tags: ["02 — SO Delivery"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/soId'
 *     responses:
 *       200:
 *         description: Per-line delivery status with summary
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Sales Order not found
 */
router.get('/:id/delivery-status', getDeliveryStatus);

/**
 * @swagger
 * /api/sales-orders/{id}/revisions:
 *   get:
 *     summary: Full revision history with item snapshots and change diffs
 *     tags: ["03 — SO Revision & Acknowledgement"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/soId'
 *     responses:
 *       200:
 *         description: Revision history
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Sales Order not found
 */
router.get('/:id/revisions', getSoRevisions);

/**
 * @swagger
 * /api/sales-orders/{id}/history:
 *   get:
 *     summary: Full audit log of all actions on this SO
 *     tags: ["01 — SO CRUD"]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/soId'
 *     responses:
 *       200:
 *         description: Audit log returned
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Sales Order not found
 */
router.get('/:id/history', getSoHistory);

module.exports = router;

// ─────────────────────────────────────────────────────────────────────────────
// SWAGGER COMPONENT DEFINITIONS (referenced by the full swagger.yaml file)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * components:
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *
 *   parameters:
 *     soId:
 *       in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: string
 *         pattern: "^[a-f0-9]{24}$"
 *       description: MongoDB _id of the Sales Order
 *       example: "665abc123def456789012345"
 *
 *   schemas:
 *
 *     CreateSalesOrderRequest:
 *       type: object
 *       required:
 *         - customer_id
 *         - items
 *       properties:
 *         customer_id:
 *           type: string
 *           example: "6650a1b2c3d4e5f678901234"
 *         quotation_id:
 *           type: string
 *           nullable: true
 *         quotation_no:
 *           type: string
 *           nullable: true
 *         customer_po_number:
 *           type: string
 *         customer_po_date:
 *           type: string
 *           format: date
 *         payment_terms:
 *           type: string
 *         delivery_terms:
 *           type: string
 *           enum: [Ex-Works, "FOR Destination", CIF, FOB, ""]
 *         delivery_mode:
 *           type: string
 *           enum: [Road, Rail, Air, Sea, "Hand Delivery", ""]
 *         expected_delivery_date:
 *           type: string
 *           format: date
 *         internal_remarks:
 *           type: string
 *         currency:
 *           type: string
 *           enum: [INR, USD, EUR, GBP, AED]
 *           default: INR
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/SOLineItemRequest'
 *
 *     SOLineItemRequest:
 *       type: object
 *       required:
 *         - item_id
 *         - ordered_qty
 *         - unit_price
 *       properties:
 *         item_id:
 *           type: string
 *           description: MongoDB ObjectId from Item Master
 *           example: "69c3b3d383de267dde1d683e"
 *         ordered_qty:
 *           type: number
 *           minimum: 0.001
 *           example: 500
 *         unit_price:
 *           type: number
 *           minimum: 0
 *           example: 285.50
 *         discount_percent:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *           default: 0
 *         required_date:
 *           type: string
 *           format: date
 *         committed_date:
 *           type: string
 *           format: date
 *         remarks:
 *           type: string
 *
 *     UpdateSORequest:
 *       type: object
 *       description: At least one field required. Header fields only.
 *       properties:
 *         expected_delivery_date:
 *           type: string
 *           format: date
 *         payment_terms:
 *           type: string
 *         delivery_terms:
 *           type: string
 *           enum: [Ex-Works, "FOR Destination", CIF, FOB, ""]
 *         delivery_mode:
 *           type: string
 *           enum: [Road, Rail, Air, Sea, "Hand Delivery", ""]
 *         transporter:
 *           type: string
 *         internal_remarks:
 *           type: string
 *         customer_po_number:
 *           type: string
 *         customer_po_date:
 *           type: string
 *           format: date
 *         shipping_address:
 *           $ref: '#/components/schemas/AddressSnapshot'
 *         billing_address:
 *           $ref: '#/components/schemas/AddressSnapshot'
 *         terms_conditions:
 *           type: array
 *           items:
 *             type: object
 *
 *     ReviseSORequest:
 *       type: object
 *       required: [reason]
 *       properties:
 *         reason:
 *           type: string
 *           minLength: 5
 *           example: "Customer reduced order qty from 500 to 400 due to project delay"
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             required: [_id]
 *             properties:
 *               _id:
 *                 type: string
 *                 example: "665abc123def456789012abc"
 *               ordered_qty:
 *                 type: number
 *                 minimum: 0.001
 *               unit_price:
 *                 type: number
 *                 minimum: 0
 *               committed_date:
 *                 type: string
 *                 format: date
 *               required_date:
 *                 type: string
 *                 format: date
 *               discount_percent:
 *                 type: number
 *               remarks:
 *                 type: string
 *         expected_delivery_date:
 *           type: string
 *           format: date
 *         payment_terms:
 *           type: string
 *         delivery_terms:
 *           type: string
 *         internal_remarks:
 *           type: string
 *
 *     AddressSnapshot:
 *       type: object
 *       properties:
 *         line1:
 *           type: string
 *         line2:
 *           type: string
 *         city:
 *           type: string
 *         district:
 *           type: string
 *         state:
 *           type: string
 *         state_code:
 *           type: integer
 *         pincode:
 *           type: string
 *         country:
 *           type: string
 *           default: India
 */