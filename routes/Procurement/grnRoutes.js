// routes/Procurement/grnRoutes.js
const express = require('express');
const router = express.Router();
const {
  createGRN,
  recordQCResult,
  getAllGRNs,
  getGRNById
} = require('../../controllers/Procurement/grnController');

const { protect, authorize } = require('../../middleware/authMiddleware');

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: GRN (Goods Receipt Note)
 *   description: GRN management for material receipt and QC
 */

// ======================================================
// COMMON COMPONENTS
// ======================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     # ========== GRN ITEM SCHEMA ==========
 *     GRNItem:
 *       type: object
 *       required:
 *         - po_item_id
 *         - received_qty
 *       properties:
 *         po_item_id:
 *           type: string
 *           example: "69bd37db4cd10180302640ca"
 *           description: PO Item ID from Purchase Order
 *         received_qty:
 *           type: number
 *           example: 500
 *           description: Quantity received
 *         batch_no:
 *           type: string
 *           example: "BATCH-2026-001"
 *           description: Batch/Lot number from vendor
 *         heat_no:
 *           type: string
 *           example: "HEAT-45678"
 *           description: Heat number (for metals/steel)
 *         mill_cert_path:
 *           type: string
 *           example: "/uploads/mill_certs/VEDANTA_BR001_CERT_2026.pdf"
 *           description: Path to uploaded mill certificate
 *         expiry_date:
 *           type: string
 *           format: date
 *           example: "2027-12-31"
 *           description: Expiry date (for consumables/chemicals)
 *         storage_location:
 *           type: string
 *           example: "Rack-A, Row-3, Bin-07"
 *           description: Bin/Rack location assigned in the store
 *
 *     # ========== CREATE GRN SCHEMA ==========
 *     GRNCreate:
 *       type: object
 *       required:
 *         - po_id
 *         - receiving_store
 *         - items
 *       properties:
 *         po_id:
 *           type: string
 *           example: "69bd37db4cd10180302640c9"
 *           description: Purchase Order ID
 *         vehicle_no:
 *           type: string
 *           example: "MH-01-AB-1234"
 *           description: Truck/Vehicle number
 *         lr_number:
 *           type: string
 *           example: "LR-7890-2026"
 *           description: Lorry Receipt number
 *         lr_date:
 *           type: string
 *           format: date
 *           example: "2026-03-19"
 *           description: Lorry Receipt date
 *         transporter_name:
 *           type: string
 *           example: "ABC Transport Services Pvt Ltd"
 *           description: Transport company name
 *         vendor_invoice_no:
 *           type: string
 *           example: "INV-VED-2026-001"
 *           description: Vendor's invoice/challan number
 *         vendor_invoice_date:
 *           type: string
 *           format: date
 *           example: "2026-03-19"
 *           description: Vendor's invoice date
 *         receiving_store:
 *           type: string
 *           example: "Raw Material Store - Warehouse A"
 *           description: Store where goods are received
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/GRNItem'
 *         remarks:
 *           type: string
 *           example: "Goods received as per vendor challan. All documents verified. 10 pallets received."
 *
 *     # ========== QC RESULT ITEM SCHEMA ==========
 *     QCResultItem:
 *       type: object
 *       required:
 *         - item_id
 *         - accepted_qty
 *         - rejected_qty
 *       properties:
 *         item_id:
 *           type: string
 *           example: "69bd37db4cd10180302640ca"
 *           description: GRN Item ID
 *         accepted_qty:
 *           type: number
 *           example: 490
 *           description: Quantity accepted after QC
 *         rejected_qty:
 *           type: number
 *           example: 10
 *           description: Quantity rejected after QC
 *         rejection_reason:
 *           type: string
 *           example: "Surface scratches, dents, and dimensional deviation beyond tolerance"
 *           description: Reason for rejection
 *
 *     # ========== QC RESULT SCHEMA ==========
 *     QCResult:
 *       type: object
 *       required:
 *         - items
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/QCResultItem'
 *         qc_remarks:
 *           type: string
 *           example: "Partial acceptance due to surface defects. 10 pieces failed visual inspection. Rejected items segregated and kept in quarantine area."
 *
 *     # ========== GRN FULL SCHEMA ==========
 *     GRN:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "69bd37db4cd10180302640cb"
 *         grn_number:
 *           type: string
 *           example: "GRN-202603-0001"
 *         grn_date:
 *           type: string
 *           format: date-time
 *           example: "2026-03-20T10:30:00.000Z"
 *         po_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             po_number:
 *               type: string
 *         po_number:
 *           type: string
 *           example: "PO-202603-0003"
 *         vendor_id:
 *           type: object
 *         vendor_name:
 *           type: string
 *           example: "Vedanta Ltd"
 *         vendor_invoice_no:
 *           type: string
 *           example: "INV-VED-2026-001"
 *         vendor_invoice_date:
 *           type: string
 *           format: date
 *           example: "2026-03-19"
 *         vehicle_no:
 *           type: string
 *           example: "MH-01-AB-1234"
 *         lr_number:
 *           type: string
 *           example: "LR-7890-2026"
 *         lr_date:
 *           type: string
 *           format: date
 *           example: "2026-03-19"
 *         transporter_name:
 *           type: string
 *           example: "ABC Transport Services Pvt Ltd"
 *         receiving_store:
 *           type: string
 *           example: "Raw Material Store - Warehouse A"
 *         received_by:
 *           type: object
 *         receipt_time:
 *           type: string
 *           format: date-time
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/GRNItem'
 *         qc_required:
 *           type: boolean
 *           example: true
 *         qc_status:
 *           type: string
 *           enum: ['Not Required', 'Pending', 'In Progress', 'Passed', 'Failed', 'Partially Passed']
 *           example: "Partially Passed"
 *         qc_id:
 *           type: string
 *         qc_completed_at:
 *           type: string
 *           format: date-time
 *         total_received_qty:
 *           type: number
 *           example: 500
 *         total_accepted_qty:
 *           type: number
 *           example: 490
 *         total_rejected_qty:
 *           type: number
 *           example: 10
 *         status:
 *           type: string
 *           enum: ['Created', 'Under Inspection', 'Accepted', 'Rejected', 'Partially Accepted', 'Stock Updated']
 *           example: "Partially Accepted"
 *         ncr_id:
 *           type: string
 *         stock_transaction_ids:
 *           type: array
 *         remarks:
 *           type: string
 *
 *   responses:
 *     GRNNotFound:
 *       description: GRN not found
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
 *                 example: "GRN not found"
 *               error:
 *                 type: string
 *                 example: "GRN_NOT_FOUND"
 *
 *   parameters:
 *     grnIdParam:
 *       in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: string
 *       description: GRN ID
 */

// ======================================================
// GRN APIs
// ======================================================

/**
 * @swagger
 * /api/grns:
 *   post:
 *     summary: Create Goods Receipt Note (GRN)
 *     description: |
 *       Creates a Goods Receipt Note when material is received from vendor.
 *       - Automatically links to Purchase Order
 *       - Records all transport and receiving details
 *       - Auto-creates Inspection Record for QC
 *       - Updates PO received quantities and status
 *     tags: [GRN]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GRNCreate'
 *           examples:
 *             single_item:
 *               summary: Single Item Receipt
 *               value:
 *                 po_id: "69bd37db4cd10180302640c9"
 *                 vehicle_no: "MH-01-AB-1234"
 *                 lr_number: "LR-7890-2026"
 *                 lr_date: "2026-03-19"
 *                 transporter_name: "ABC Transport Services Pvt Ltd"
 *                 vendor_invoice_no: "INV-VED-2026-001"
 *                 vendor_invoice_date: "2026-03-19"
 *                 receiving_store: "Raw Material Store - Warehouse A"
 *                 items:
 *                   - po_item_id: "69bd37db4cd10180302640ca"
 *                     received_qty: 500
 *                     batch_no: "BATCH-2026-001"
 *                     heat_no: "HEAT-45678"
 *                     mill_cert_path: "/uploads/mill_certs/VEDANTA_BR001_CERT_2026.pdf"
 *                     storage_location: "Rack-A, Row-3, Bin-07"
 *                 remarks: "Goods received as per vendor challan. All documents verified. 10 pallets received."
 *             multiple_items:
 *               summary: Multiple Items Receipt
 *               value:
 *                 po_id: "69bd37db4cd10180302640c9"
 *                 vehicle_no: "MH-01-AB-1234"
 *                 lr_number: "LR-7890-2026"
 *                 lr_date: "2026-03-19"
 *                 transporter_name: "ABC Transport Services Pvt Ltd"
 *                 vendor_invoice_no: "INV-VED-2026-001"
 *                 vendor_invoice_date: "2026-03-19"
 *                 receiving_store: "Raw Material Store - Warehouse A"
 *                 items:
 *                   - po_item_id: "69bd37db4cd10180302640ca"
 *                     received_qty: 300
 *                     batch_no: "BATCH-2026-001"
 *                     heat_no: "HEAT-45678"
 *                     storage_location: "Rack-A, Row-3, Bin-07"
 *                   - po_item_id: "69bd37db4cd10180302640cb"
 *                     received_qty: 200
 *                     batch_no: "BATCH-2026-002"
 *                     heat_no: "HEAT-45679"
 *                     storage_location: "Rack-B, Row-2, Bin-12"
 *                 remarks: "Partial receipt. Remaining 200 pieces expected next week."
 *     responses:
 *       201:
 *         description: GRN created successfully
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
 *                   example: "GRN created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "69bd37db4cd10180302640cb"
 *                     grn_number:
 *                       type: string
 *                       example: "GRN-202603-0001"
 *                     po_number:
 *                       type: string
 *                       example: "PO-202603-0003"
 *                     status:
 *                       type: string
 *                       example: "Created"
 *                     qc_status:
 *                       type: string
 *                       example: "Pending"
 *                     total_received_qty:
 *                       type: number
 *                       example: 500
 *                     inspection_record_id:
 *                       type: string
 *                     next_step:
 *                       type: string
 *                       example: "QC inspection required"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Received quantity 500 exceeds pending quantity 300 for item BR-001"
 *                 error:
 *                   type: string
 *                   example: "EXCESS_PENDING_QUANTITY"
 *       404:
 *         description: PO not found
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden - insufficient permissions
 *       500:
 *         description: Server error
 */
router.post('/', createGRN);

/**
 * @swagger
 * /api/grns:
 *   get:
 *     summary: Get all GRNs with pagination and filtering
 *     tags: [GRN]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ['Created', 'Under Inspection', 'Accepted', 'Rejected', 'Partially Accepted', 'Stock Updated']
 *         description: Filter by GRN status
 *       - in: query
 *         name: qc_status
 *         schema:
 *           type: string
 *           enum: ['Not Required', 'Pending', 'In Progress', 'Passed', 'Failed', 'Partially Passed']
 *         description: Filter by QC status
 *       - in: query
 *         name: po_id
 *         schema:
 *           type: string
 *           example: "69bd37db4cd10180302640c9"
 *         description: Filter by Purchase Order ID
 *       - in: query
 *         name: vendor_id
 *         schema:
 *           type: string
 *           example: "69bcf55c54002008f1ebb0f9"
 *         description: Filter by Vendor ID
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date
 *           example: "2026-03-01"
 *         description: Filter GRN date from
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date
 *           example: "2026-03-31"
 *         description: Filter GRN date to
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: ['grn_date', 'createdAt', 'grn_number']
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: ['asc', 'desc']
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: GRNs retrieved successfully
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
 *                     $ref: '#/components/schemas/GRN'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', getAllGRNs);

/**
 * @swagger
 * /api/grns/{id}:
 *   get:
 *     summary: Get GRN by ID with full details
 *     tags: [GRN]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: "69bd37db4cd10180302640cb"
 *         description: GRN ID
 *     responses:
 *       200:
 *         description: GRN retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/GRN'
 *       404:
 *         $ref: '#/components/responses/GRNNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', getGRNById);

/**
 * @swagger
 * /api/grns/{id}/qc-result:
 *   put:
 *     summary: Record QC inspection results
 *     description: |
 *       Records quality control inspection results for received material.
 *       - Updates accepted and rejected quantities per item
 *       - Creates StockTransaction for accepted items
 *       - Creates NCR (Non-Conformance Report) for rejected items
 *       - Updates GRN and InspectionRecord status
 *       - Triggers inventory update
 *     tags: [GRN]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: "69bd37db4cd10180302640cb"
 *         description: GRN ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QCResult'
 *           examples:
 *             full_acceptance:
 *               summary: Full Acceptance - All Items Passed
 *               value:
 *                 items:
 *                   - item_id: "69bd37db4cd10180302640ca"
 *                     accepted_qty: 500
 *                     rejected_qty: 0
 *                     rejection_reason: null
 *                 qc_remarks: "All 500 pieces passed visual and dimensional inspection. Quality meets specifications."
 *             partial_acceptance:
 *               summary: Partial Acceptance - Some Items Rejected
 *               value:
 *                 items:
 *                   - item_id: "69bd37db4cd10180302640ca"
 *                     accepted_qty: 490
 *                     rejected_qty: 10
 *                     rejection_reason: "Surface scratches, dents, and dimensional deviation beyond tolerance (10mm ± 0.5mm, measured 9.2mm)"
 *                 qc_remarks: "Partial acceptance due to surface defects. 10 pieces failed visual inspection. Rejected items segregated and kept in quarantine area. NCR raised for vendor replacement."
 *             full_rejection:
 *               summary: Full Rejection - All Items Failed
 *               value:
 *                 items:
 *                   - item_id: "69bd37db4cd10180302640ca"
 *                     accepted_qty: 0
 *                     rejected_qty: 500
 *                     rejection_reason: "Wrong material grade received. Ordered C11000 Copper, received C10100. Not suitable for production."
 *                 qc_remarks: "Complete rejection. Material does not match specification. NCR raised. Return to vendor initiated."
 *             multiple_items:
 *               summary: Multiple Items with Different Results
 *               value:
 *                 items:
 *                   - item_id: "item_1_id"
 *                     accepted_qty: 300
 *                     rejected_qty: 0
 *                     rejection_reason: null
 *                   - item_id: "item_2_id"
 *                     accepted_qty: 180
 *                     rejected_qty: 20
 *                     rejection_reason: "Surface rust on 20 pieces"
 *                 qc_remarks: "Item 1 passed all tests. Item 2 partially accepted due to rust. NCR raised for 20 rejected pieces."
 *     responses:
 *       200:
 *         description: QC results recorded successfully
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
 *                   example: "QC results recorded successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     grn_number:
 *                       type: string
 *                       example: "GRN-202603-0001"
 *                     status:
 *                       type: string
 *                       example: "Partially Accepted"
 *                     qc_status:
 *                       type: string
 *                       example: "Partially Passed"
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_received:
 *                           type: number
 *                           example: 500
 *                         total_accepted:
 *                           type: number
 *                           example: 490
 *                         total_rejected:
 *                           type: number
 *                           example: 10
 *                         acceptance_rate:
 *                           type: string
 *                           example: "98.00%"
 *                         stock_updated:
 *                           type: boolean
 *                           example: true
 *                         ncr_created:
 *                           type: boolean
 *                           example: true
 *                     stock_transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           transaction_number:
 *                             type: string
 *                           quantity:
 *                             type: number
 *                     ncr:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         ncr_number:
 *                           type: string
 *                         rejected_qty:
 *                           type: number
 *                     inspection_record:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         inspection_number:
 *                           type: string
 *                         status:
 *                           type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Accepted + Rejected quantity exceeds received quantity for item BR-001"
 *                 error:
 *                   type: string
 *                   example: "INVALID_QUANTITY"
 *       404:
 *         $ref: '#/components/responses/GRNNotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden - insufficient permissions
 *       500:
 *         description: Server error
 */
router.put('/:id/qc-result', recordQCResult);

module.exports = router;