// routes/Procurement/purchaseInvoiceRoutes.js
const express = require('express');
const router = express.Router();
const {
  createPurchaseInvoice,
  performThreeWayMatch,
  approvePurchaseInvoice,
  getAllPurchaseInvoices,
  getPurchaseInvoiceById
} = require('../../controllers/Procurement/purchaseInvoiceController');

const { protect, authorize } = require('../../middleware/authMiddleware');

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Purchase Invoices
 *   description: Purchase Invoice management with three-way match and approval workflow
 */

// ======================================================
// COMMON COMPONENTS
// ======================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     # ========== PURCHASE INVOICE ITEM SCHEMA ==========
 *     PurchaseInvoiceItem:
 *       type: object
 *       required:
 *         - po_item_id
 *         - quantity
 *         - unit_price
 *         - taxable_amount
 *         - gst_percent
 *       properties:
 *         po_item_id:
 *           type: string
 *           example: "69bd37db4cd10180302640ca"
 *           description: PO Item ID from Purchase Order
 *         quantity:
 *           type: number
 *           example: 490
 *           description: Quantity billed (should match GRN accepted quantity)
 *         unit_price:
 *           type: number
 *           example: 105
 *           description: Price per unit as per invoice
 *         discount_percent:
 *           type: number
 *           example: 0
 *           description: Discount percentage if any
 *         discount_amount:
 *           type: number
 *           example: 0
 *         taxable_amount:
 *           type: number
 *           example: 51450
 *           description: Amount after discount, before tax
 *         gst_percent:
 *           type: number
 *           example: 18
 *           description: GST percentage applicable
 *
 *     # ========== CREATE PURCHASE INVOICE SCHEMA ==========
 *     PurchaseInvoiceCreate:
 *       type: object
 *       required:
 *         - po_id
 *         - grn_ids
 *         - vendor_invoice_no
 *         - vendor_invoice_date
 *         - items
 *       properties:
 *         po_id:
 *           type: string
 *           example: "69bd37db4cd10180302640c9"
 *           description: Purchase Order ID
 *         grn_ids:
 *           type: array
 *           items:
 *             type: string
 *           example: ["69be27f9cc0fb7db0fc65583"]
 *           description: GRN IDs for which invoice is received
 *         vendor_invoice_no:
 *           type: string
 *           example: "INV-VED-2026-001"
 *           description: Vendor's invoice number
 *         vendor_invoice_date:
 *           type: string
 *           format: date
 *           example: "2026-03-21"
 *           description: Vendor's invoice date
 *         invoice_date:
 *           type: string
 *           format: date
 *           example: "2026-03-21"
 *           description: Invoice entry date (defaults to current date)
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/PurchaseInvoiceItem'
 *         discount_total:
 *           type: number
 *           example: 0
 *         tds_applicable:
 *           type: boolean
 *           example: true
 *         tds_section:
 *           type: string
 *           enum: ['194C', '194Q', '194J', '194I', '194H']
 *           example: "194Q"
 *         tds_rate:
 *           type: number
 *           example: 2
 *         due_date:
 *           type: string
 *           format: date
 *           example: "2026-04-20"
 *         internal_remarks:
 *           type: string
 *           example: "Invoice for PO-202603-0003 - Copper Busbars"
 *
 *     # ========== THREE-WAY MATCH SCHEMA ==========
 *     ThreeWayMatchResult:
 *       type: object
 *       properties:
 *         part_no:
 *           type: string
 *           example: "BR-001"
 *         po_price:
 *           type: number
 *           example: 105
 *         po_ordered_qty:
 *           type: number
 *           example: 500
 *         grn_accepted_qty:
 *           type: number
 *           example: 490
 *         expected_amount:
 *           type: number
 *           example: 51450
 *         invoice_qty:
 *           type: number
 *           example: 490
 *         invoice_price:
 *           type: number
 *           example: 105
 *         invoice_amount:
 *           type: number
 *           example: 51450
 *         difference:
 *           type: number
 *           example: 0
 *         difference_percent:
 *           type: string
 *           example: "0.00%"
 *         match_status:
 *           type: string
 *           enum: ['Matched', 'Exception']
 *
 *     # ========== PURCHASE INVOICE FULL SCHEMA ==========
 *     PurchaseInvoice:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "69be2a0aa21c9da181ec02bd"
 *         purchase_invoice_number:
 *           type: string
 *           example: "PI-202603-0001"
 *         vendor_invoice_no:
 *           type: string
 *           example: "INV-VED-2026-001"
 *         vendor_invoice_date:
 *           type: string
 *           format: date
 *           example: "2026-03-21"
 *         vendor_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             vendor_name:
 *               type: string
 *         po_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             po_number:
 *               type: string
 *         grn_ids:
 *           type: array
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PurchaseInvoiceItem'
 *         taxable_total:
 *           type: number
 *           example: 51450
 *         cgst_total:
 *           type: number
 *           example: 4630.5
 *         sgst_total:
 *           type: number
 *           example: 4630.5
 *         igst_total:
 *           type: number
 *           example: 0
 *         total_tax:
 *           type: number
 *           example: 9261
 *         grand_total:
 *           type: number
 *           example: 60711
 *         tds_applicable:
 *           type: boolean
 *           example: true
 *         tds_rate:
 *           type: number
 *           example: 2
 *         tds_amount:
 *           type: number
 *           example: 1029
 *         net_payable:
 *           type: number
 *           example: 59682
 *         due_date:
 *           type: string
 *           format: date
 *         payment_status:
 *           type: string
 *           enum: ['Unpaid', 'Partially Paid', 'Fully Paid', 'Overdue', 'On Hold']
 *           example: "Unpaid"
 *         itc_amount:
 *           type: number
 *           example: 9261
 *         matching_status:
 *           type: string
 *           enum: ['Not Started', '2-way Matched', '3-way Matched', 'Exception', 'Hold']
 *           example: "3-way Matched"
 *         status:
 *           type: string
 *           enum: ['Pending', 'Under Verification', 'Approved', 'Rejected', 'Posted', 'Cancelled']
 *           example: "Approved"
 *
 *   responses:
 *     InvoiceNotFound:
 *       description: Purchase Invoice not found
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
 *                 example: "Purchase Invoice not found"
 *               error:
 *                 type: string
 *                 example: "INVOICE_NOT_FOUND"
 *
 *   parameters:
 *     invoiceIdParam:
 *       in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: string
 *       description: Purchase Invoice ID
 */

// ======================================================
// PURCHASE INVOICE APIs
// ======================================================

/**
 * @swagger
 * /api/purchase-invoices:
 *   post:
 *     summary: Create Purchase Invoice from vendor
 *     description: |
 *       Creates a purchase invoice from vendor bill.
 *       - Validates PO and GRN
 *       - Checks for duplicate vendor invoice
 *       - Performs initial two-way match (PO vs Invoice)
 *       - Sets status to 'Pending'
 *     tags: [Purchase Invoices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PurchaseInvoiceCreate'
 *           example:
 *             po_id: "69bd37db4cd10180302640c9"
 *             grn_ids: ["69be27f9cc0fb7db0fc65583"]
 *             vendor_invoice_no: "INV-VED-2026-001"
 *             vendor_invoice_date: "2026-03-21"
 *             invoice_date: "2026-03-21"
 *             items:
 *               - po_item_id: "69bd37db4cd10180302640ca"
 *                 quantity: 490
 *                 unit_price: 105
 *                 taxable_amount: 51450
 *                 gst_percent: 18
 *             tds_applicable: true
 *             tds_section: "194Q"
 *             tds_rate: 2
 *             due_date: "2026-04-20"
 *             internal_remarks: "Invoice for PO-202603-0003 - Copper Busbars"
 *     responses:
 *       201:
 *         description: Purchase Invoice created successfully
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
 *                   example: "Purchase Invoice created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     purchase_invoice_number:
 *                       type: string
 *                     vendor_invoice_no:
 *                       type: string
 *                     grand_total:
 *                       type: number
 *                     net_payable:
 *                       type: number
 *                     matching_status:
 *                       type: string
 *                     status:
 *                       type: string
 *       400:
 *         description: Bad request
 *       404:
 *         description: PO or GRN not found
 *       409:
 *         description: Duplicate invoice
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.post('/', authorize('admin', 'manager', 'purchase'), createPurchaseInvoice);

/**
 * @swagger
 * /api/purchase-invoices:
 *   get:
 *     summary: Get all purchase invoices with pagination and filtering
 *     tags: [Purchase Invoices]
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ['Pending', 'Under Verification', 'Approved', 'Rejected', 'Posted', 'Cancelled']
 *       - in: query
 *         name: matching_status
 *         schema:
 *           type: string
 *           enum: ['Not Started', '2-way Matched', '3-way Matched', 'Exception', 'Hold']
 *       - in: query
 *         name: payment_status
 *         schema:
 *           type: string
 *           enum: ['Unpaid', 'Partially Paid', 'Fully Paid', 'Overdue', 'On Hold']
 *       - in: query
 *         name: vendor_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: po_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Purchase invoices retrieved successfully
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
 *                     $ref: '#/components/schemas/PurchaseInvoice'
 *                 pagination:
 *                   type: object
 *                 statistics:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', getAllPurchaseInvoices);

/**
 * @swagger
 * /api/purchase-invoices/{id}:
 *   get:
 *     summary: Get purchase invoice by ID
 *     tags: [Purchase Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/invoiceIdParam'
 *     responses:
 *       200:
 *         description: Purchase invoice retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/PurchaseInvoice'
 *       404:
 *         $ref: '#/components/responses/InvoiceNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', getPurchaseInvoiceById);

/**
 * @swagger
 * /api/purchase-invoices/{id}/three-way-match:
 *   put:
 *     summary: Perform three-way match (PO × GRN × Invoice)
 *     description: |
 *       Compares PO unit price × GRN accepted quantity vs invoice line amount.
 *       - If difference > 0.5%, sets matching_status = Exception
 *       - If difference ≤ 0.5%, sets matching_status = 3-way Matched
 *       - Updates match_status for each item
 *     tags: [Purchase Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/invoiceIdParam'
 *     responses:
 *       200:
 *         description: Three-way match completed
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
 *                   example: "Three-way match completed - All items matched"
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoice_number:
 *                       type: string
 *                     matching_status:
 *                       type: string
 *                     matches:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ThreeWayMatchResult'
 *                     summary:
 *                       type: object
 *       400:
 *         description: Invalid invoice status
 *       404:
 *         $ref: '#/components/responses/InvoiceNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id/three-way-match', authorize('admin', 'manager', 'purchase'), performThreeWayMatch);

/**
 * @swagger
 * /api/purchase-invoices/{id}/approve:
 *   put:
 *     summary: Approve purchase invoice
 *     description: |
 *       Approves invoice after three-way match.
 *       - For 3-way matched invoices: Can be approved by Purchase Manager
 *       - For Exception invoices: Requires Finance team approval
 *       - Computes ITC (Input Tax Credit) amount
 *     tags: [Purchase Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/invoiceIdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               approval_remarks:
 *                 type: string
 *                 example: "Invoice verified. ITC claimed for March 2026"
 *     responses:
 *       200:
 *         description: Purchase invoice approved successfully
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
 *                   example: "Purchase Invoice approved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoice_number:
 *                       type: string
 *                     vendor_invoice_no:
 *                       type: string
 *                     status:
 *                       type: string
 *                     matching_status:
 *                       type: string
 *                     itc_amount:
 *                       type: number
 *       400:
 *         description: Three-way match required or invalid status
 *       403:
 *         description: Exception invoices require finance team approval
 *       404:
 *         $ref: '#/components/responses/InvoiceNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id/approve', authorize('admin', 'manager', 'finance'), approvePurchaseInvoice);

module.exports = router;