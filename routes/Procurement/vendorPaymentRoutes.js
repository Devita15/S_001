// routes/Procurement/vendorPaymentRoutes.js
const express = require('express');
const router = express.Router();
const {
  createVendorPayment,
  approveVendorPayment,
  getAllVendorPayments,
  getVendorPaymentById
} = require('../../controllers/Procurement/vendorPaymentController');

const { protect, authorize } = require('../../middleware/authMiddleware');

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Vendor Payments
 *   description: Vendor payment management with TDS and GL posting
 */

// ======================================================
// COMMON COMPONENTS
// ======================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     # ========== PAYMENT ALLOCATION SCHEMA ==========
 *     PaymentAllocation:
 *       type: object
 *       required:
 *         - purchase_invoice_id
 *         - allocated_amount
 *       properties:
 *         purchase_invoice_id:
 *           type: string
 *           example: "69be2a0aa21c9da181ec02bd"
 *         allocated_amount:
 *           type: number
 *           example: 59682
 *           description: Amount to allocate to this invoice
 *
 *     # ========== CREATE VENDOR PAYMENT SCHEMA ==========
 *     VendorPaymentCreate:
 *       type: object
 *       required:
 *         - vendor_id
 *         - amount
 *         - payment_mode
 *         - reference_no
 *         - purchase_invoice_ids
 *         - allocations
 *       properties:
 *         vendor_id:
 *           type: string
 *           example: "69bcf55c54002008f1ebb0f9"
 *           description: Vendor ID
 *         payment_date:
 *           type: string
 *           format: date
 *           example: "2026-04-20"
 *         amount:
 *           type: number
 *           example: 59682
 *           description: Total payment amount
 *         payment_mode:
 *           type: string
 *           enum: ['NEFT', 'RTGS', 'IMPS', 'Cheque', 'DD', 'Cash', 'UPI', 'MSME Portal', 'LC', 'Bank Transfer']
 *           example: "NEFT"
 *         reference_no:
 *           type: string
 *           example: "NEFT123456789"
 *           description: UTR number for NEFT/RTGS, Cheque number, etc.
 *         reference_date:
 *           type: string
 *           format: date
 *           example: "2026-04-20"
 *         from_bank_account:
 *           type: object
 *           properties:
 *             bank_name:
 *               type: string
 *             account_no:
 *               type: string
 *             ifsc:
 *               type: string
 *         bank_charges:
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
 *         purchase_invoice_ids:
 *           type: array
 *           items:
 *             type: string
 *           example: ["69be2a0aa21c9da181ec02bd"]
 *         allocations:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PaymentAllocation'
 *         remarks:
 *           type: string
 *           example: "Payment for March 2026 invoices"
 *         internal_notes:
 *           type: string
 *           example: "Approved by finance team"
 *
 *     # ========== VENDOR PAYMENT FULL SCHEMA ==========
 *     VendorPayment:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "69be2a0aa21c9da181ec02be"
 *         vendor_payment_number:
 *           type: string
 *           example: "VP-202603-0001"
 *         payment_date:
 *           type: string
 *           format: date
 *           example: "2026-04-20"
 *         vendor_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             vendor_name:
 *               type: string
 *         amount:
 *           type: number
 *           example: 59682
 *         payment_mode:
 *           type: string
 *           example: "NEFT"
 *         reference_no:
 *           type: string
 *           example: "NEFT123456789"
 *         tds_applicable:
 *           type: boolean
 *           example: true
 *         tds_section:
 *           type: string
 *           example: "194Q"
 *         tds_rate:
 *           type: number
 *           example: 2
 *         tds_amount:
 *           type: number
 *           example: 1029
 *         bank_charges:
 *           type: number
 *           example: 0
 *         net_paid:
 *           type: number
 *           example: 58653
 *         purchase_invoice_ids:
 *           type: array
 *           items:
 *             type: object
 *         allocations:
 *           type: array
 *         requires_approval:
 *           type: boolean
 *           example: true
 *         status:
 *           type: string
 *           enum: ['Pending', 'Initiated', 'Paid', 'Bounced', 'Cancelled', 'Failed']
 *           example: "Paid"
 *         gl_posting_done:
 *           type: boolean
 *           example: true
 *         gl_journal_entry_id:
 *           type: string
 *
 *   responses:
 *     PaymentNotFound:
 *       description: Vendor Payment not found
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
 *                 example: "Vendor payment not found"
 *               error:
 *                 type: string
 *                 example: "PAYMENT_NOT_FOUND"
 *
 *   parameters:
 *     paymentIdParam:
 *       in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: string
 *       description: Vendor Payment ID
 */

// ======================================================
// VENDOR PAYMENT APIs
// ======================================================

/**
 * @swagger
 * /api/vendor-payments:
 *   post:
 *     summary: Create vendor payment
 *     description: |
 *       Creates a payment against approved purchase invoices.
 *       - Validates invoices are approved and not fully paid
 *       - Calculates TDS deduction
 *       - For amounts > ₹50,000, sets requires_approval = true
 *       - GL Journal entries: DR Accounts Payable, CR Bank, DR TDS Payable
 *     tags: [Vendor Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VendorPaymentCreate'
 *           example:
 *             vendor_id: "69bcf55c54002008f1ebb0f9"
 *             payment_date: "2026-04-20"
 *             amount: 59682
 *             payment_mode: "NEFT"
 *             reference_no: "NEFT123456789"
 *             from_bank_account:
 *               bank_name: "State Bank of India"
 *               account_no: "123456789012"
 *               ifsc: "SBIN0001234"
 *             tds_applicable: true
 *             tds_section: "194Q"
 *             tds_rate: 2
 *             purchase_invoice_ids: ["69be2a0aa21c9da181ec02bd"]
 *             allocations:
 *               - purchase_invoice_id: "69be2a0aa21c9da181ec02bd"
 *                 allocated_amount: 59682
 *             remarks: "Payment for March 2026 invoices"
 *     responses:
 *       201:
 *         description: Vendor payment created successfully
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
 *                   example: "Vendor payment created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     vendor_payment_number:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     tds_amount:
 *                       type: number
 *                     net_paid:
 *                       type: number
 *                     status:
 *                       type: string
 *                     requires_approval:
 *                       type: boolean
 *       400:
 *         description: Bad request
 *       404:
 *         description: Vendor or invoice not found
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.post('/', authorize('admin', 'manager', 'finance'), createVendorPayment);

/**
 * @swagger
 * /api/vendor-payments:
 *   get:
 *     summary: Get all vendor payments with pagination and filtering
 *     tags: [Vendor Payments]
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
 *           enum: ['Pending', 'Initiated', 'Paid', 'Bounced', 'Cancelled', 'Failed']
 *       - in: query
 *         name: vendor_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: payment_mode
 *         schema:
 *           type: string
 *           enum: ['NEFT', 'RTGS', 'IMPS', 'Cheque', 'DD', 'Cash', 'UPI', 'MSME Portal', 'LC', 'Bank Transfer']
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
 *         description: Vendor payments retrieved successfully
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
 *                     $ref: '#/components/schemas/VendorPayment'
 *                 pagination:
 *                   type: object
 *                 statistics:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', getAllVendorPayments);

/**
 * @swagger
 * /api/vendor-payments/{id}:
 *   get:
 *     summary: Get vendor payment by ID
 *     tags: [Vendor Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/paymentIdParam'
 *     responses:
 *       200:
 *         description: Vendor payment retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/VendorPayment'
 *       404:
 *         $ref: '#/components/responses/PaymentNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', getVendorPaymentById);

/**
 * @swagger
 * /api/vendor-payments/{id}/approve:
 *   put:
 *     summary: Approve and process vendor payment
 *     description: |
 *       Approves a pending vendor payment.
 *       - For amounts > ₹50,000, requires manager/finance approval
 *       - Updates invoice payment statuses
 *       - Posts GL Journal Entries
 *     tags: [Vendor Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/paymentIdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               approval_remarks:
 *                 type: string
 *                 example: "Payment approved. TDS deducted as per section 194Q"
 *     responses:
 *       200:
 *         description: Vendor payment approved and processed
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
 *                   example: "Vendor payment approved and processed"
 *                 data:
 *                   type: object
 *                   properties:
 *                     payment_number:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     tds_amount:
 *                       type: number
 *                     net_paid:
 *                       type: number
 *                     status:
 *                       type: string
 *       400:
 *         description: Invalid payment status
 *       403:
 *         description: Approval required for large payments
 *       404:
 *         $ref: '#/components/responses/PaymentNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id/approve', authorize('admin', 'manager', 'finance'), approveVendorPayment);

module.exports = router;