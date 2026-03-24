'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// routes/CRM/salesOrderRoutes.js
// Phase 03 — All Sales Order endpoints (BE-009 + BE-010 + BE-011)
//
// Mount in app.js:
//   const salesOrderRoutes = require('./routes/CRM/salesOrderRoutes');
//   app.use('/api/sales-orders', salesOrderRoutes);
//   app.use('/api/analytics',    salesOrderRoutes);   // for OTIF endpoint
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { protect } = require('../../middleware/authMiddleware');

const {
  // Multer middleware for PO file upload
  uploadPoFile,

  // BE-009 — CRUD & Credit Check
  createSalesOrder,
  getSalesOrders,
  getSalesOrderById,
  updateSalesOrder,
  confirmSalesOrder,

  // BE-010 — Delivery Tracking & Status Cascade
  getDeliveryStatus,
  getOrderBook,
  getDeliveryDue,
  cancelSalesOrder,
  getOtifKpi,
  getSoHistory,

  // BE-011 — Revision, Acknowledgement & Reports
  reviseSalesOrder,
  getSoRevisions,
  acknowledgeSalesOrder,
  cancelSoLineItem,
  getReportSummary,
  getReportPendingDelivery,
} = require('../../controllers/CRM/salesOrderController');

// All routes require authentication
router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// NAMED / AGGREGATE routes — MUST come before /:id to avoid route conflicts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/sales-orders/order-book
 * Open order book: all confirmed SOs with pending qty + delay flags
 * BE-010 §6
 */
router.get('/order-book',getOrderBook);

/**
 * GET /api/sales-orders/delivery-due?days=7
 * SOs with committed_date in next 7/14/30 days — production priority list
 * BE-010 §7
 */
router.get('/delivery-due',  getDeliveryDue);

/**
 * GET /api/sales-orders/reports/summary?from=&to=
 * Aggregate SO value by customer, by month
 * BE-011 §6
 */
router.get('/reports/summary',  getReportSummary);

/**
 * GET /api/sales-orders/reports/pending-delivery?customer_id=
 * All SOs with pending_qty > 0, grouped by customer
 * BE-011 §7
 */
router.get('/reports/pending-delivery', getReportPendingDelivery);

/**
 * GET /api/analytics/otif?from=&to=
 * OTIF KPI — On-Time In-Full % computation
 * BE-010 §9
 * NOTE: This route also needs to be mounted on /api/analytics in app.js
 */
router.get('/otif', getOtifKpi);

// ─────────────────────────────────────────────────────────────────────────────
// COLLECTION routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/sales-orders
 * Create new SO manually OR from approved quotation
 * Supports multipart/form-data for customer_po_file upload
 * BE-009 §1–4, §8
 */
router.post(
  '/',
  uploadPoFile,  // multer middleware — handles customer_po_file (PDF/JPG/PNG/TIFF, max 10MB)
  createSalesOrder
);

/**
 * GET /api/sales-orders?status=&customer_id=&customer_po_number=&from=&to=&part_no=&page=&limit=
 * Paginated list with filters
 * BE-009
 * Roles: All authenticated
 */
router.get('/', getSalesOrders);

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT routes  /:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/sales-orders/:id
 * Full SO with all items, revision history, populated customer
 * BE-009
 * Roles: All authenticated
 */
router.get('/:id', getSalesOrderById);

/**
 * PUT /api/sales-orders/:id
 * Update SO header fields (delivery info, remarks, addresses)
 * NOTE: prices cannot change without a revision; gst_type is immutable
 * BE-009
 */
router.put('/:id',  updateSalesOrder);

/**
 * POST /api/sales-orders/:id/confirm
 * Confirm SO: credit limit check → status = Confirmed → MRP + WO creation flags set
 * BE-009 §5, §8
 */
router.post('/:id/confirm',  confirmSalesOrder);

/**
 * POST /api/sales-orders/:id/cancel
 * Cancel SO with mandatory cancellation_reason
 * Cascades: cancels open WOs, cancels unapproved PRs, releases stock reservations
 * Wrapped in MongoDB transaction
 * BE-010 §8
 */
router.post('/:id/cancel',  cancelSalesOrder);

/**
 * POST /api/sales-orders/:id/revise
 * Create SO revision: snapshot current items → increment current_revision → allow qty/date changes
 * revision history is append-only
 * BE-011 §1
 *
 * Body:
 *   reason         String  (required)
 *   items[]        Array   (optional) — [{_id, ordered_qty, committed_date, required_date, discount_percent, remarks}]
 *   expected_delivery_date  Date
 *   payment_terms  String
 *   delivery_terms String
 *   internal_remarks String
 */
router.post('/:id/revise',  reviseSalesOrder);

/**
 * POST /api/sales-orders/:id/acknowledge
 * Generate Order Acknowledgement PDF and email to customer
 * Returns PDF binary as attachment download
 * BE-011 §4
 *
 * Body (optional):
 *   email  String  — override recipient email
 */
router.post('/:id/acknowledge', acknowledgeSalesOrder);

/**
 * POST /api/sales-orders/:id/cancel-line/:lineItemId
 * Soft-cancel a single SO line item (partial cancellation)
 * Cannot cancel if delivered_qty > 0
 * BE-011 §10
 *
 * Body:
 *   cancel_reason  String  (required)
 */
router.post('/:id/cancel-line/:lineItemId', cancelSoLineItem);

// ─────────────────────────────────────────────────────────────────────────────
// SUB-RESOURCE routes  /:id/sub-resource
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/sales-orders/:id/delivery-status
 * Real-time ordered_qty / delivered_qty / pending_qty per line + OTIF flag per line
 * BE-010 §4
 * Roles: All authenticated
 */
router.get('/:id/delivery-status', getDeliveryStatus);

/**
 * GET /api/sales-orders/:id/revisions
 * All revision history with item snapshots and change diffs
 * BE-011 §3
 */
router.get('/:id/revisions', getSoRevisions);

/**
 * GET /api/sales-orders/:id/history
 * Full audit log of all status changes for this SO
 * BE-010 §10
 * Roles: All authenticated
 */
router.get('/:id/history', getSoHistory);

module.exports = router;