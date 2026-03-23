// routes/Procurement/purchaseOrderRoutes.js
const express = require('express');
const router = express.Router();
const {
  createPurchaseOrder,
  approvePurchaseOrder,
  sendPurchaseOrder,
  acknowledgePurchaseOrder,
  remindUnacknowledgedPO,
  getAllPurchaseOrders,
  getPurchaseOrderById
} = require('../../controllers/Procurement/purchaseOrderController');

const { protect } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Purchase Orders
 *   description: Purchase Order (PO) management with approval workflow and vendor acknowledgment
 */

// ======================================================
// COMMON COMPONENTS
// ======================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     # ========== PO ITEM SCHEMA ==========
 *     POItem:
 *       type: object
 *       properties:
 *         item_id:
 *           type: string
 *           example: "69bcea4e94e5c414c62aed73"
 *         part_no:
 *           type: string
 *           example: "BR-001"
 *         description:
 *           type: string
 *           example: "Copper Busbar 10x50x100"
 *         hsn_code:
 *           type: string
 *           example: "740710"
 *         ordered_qty:
 *           type: number
 *           example: 500
 *         received_qty:
 *           type: number
 *           example: 0
 *         pending_qty:
 *           type: number
 *           example: 500
 *         unit:
 *           type: string
 *           enum: ['Nos', 'Kg', 'Meter', 'Set', 'Piece', 'Sheet', 'Roll']
 *           example: "Nos"
 *         unit_price:
 *           type: number
 *           example: 105
 *         discount_percent:
 *           type: number
 *           example: 0
 *         discount_amount:
 *           type: number
 *           example: 0
 *         taxable_amount:
 *           type: number
 *           example: 52500
 *         gst_percent:
 *           type: number
 *           example: 18
 *         gst_amount:
 *           type: number
 *           example: 9450
 *         total_amount:
 *           type: number
 *           example: 61950
 *         required_date:
 *           type: string
 *           format: date
 *         item_status:
 *           type: string
 *           enum: ['Pending', 'Partially Received', 'Fully Received', 'Cancelled']
 *           example: "Pending"
 *
 *     # ========== CREATE PO SCHEMA ==========
 *     POCreate:
 *       type: object
 *       required:
 *         - rfq_id
 *         - delivery_date
 *       properties:
 *         rfq_id:
 *           type: string
 *           example: "69bd1c88182711ea7a2dd605"
 *           description: "RFQ ID with selected vendor (must be in Compared status)"
 *         delivery_date:
 *           type: string
 *           format: date
 *           example: "2026-04-15"
 *           description: "Expected delivery date"
 *         delivery_address:
 *           type: object
 *           properties:
 *             line1:
 *               type: string
 *             line2:
 *               type: string
 *             city:
 *               type: string
 *             district:
 *               type: string
 *             state:
 *               type: string
 *             state_code:
 *               type: number
 *             pincode:
 *               type: string
 *             country:
 *               type: string
 *               default: "India"
 *         payment_terms:
 *           type: string
 *           example: "Net 45"
 *         internal_remarks:
 *           type: string
 *           example: "Urgent requirement for production"
 *
 *     # ========== APPROVE PO SCHEMA ==========
 *     POApprove:
 *       type: object
 *       properties:
 *         approval_notes:
 *           type: string
 *           example: "Approved as per budget. Urgent requirement."
 *
 *     # ========== SEND PO SCHEMA ==========
 *     POSend:
 *       type: object
 *       properties:
 *         send_email:
 *           type: boolean
 *           default: true
 *           description: "Whether to send actual email"
 *
 *     # ========== REMIND PO SCHEMA ==========
 *     PORemind:
 *       type: object
 *       properties:
 *         vendor_ids:
 *           type: array
 *           items:
 *             type: string
 *           description: "Specific vendor IDs to remind (empty = all pending)"
 *
 *     # ========== PURCHASE ORDER FULL SCHEMA ==========
 *     PurchaseOrder:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "69bd1c88182711ea7a2dd605"
 *         po_number:
 *           type: string
 *           example: "PO-202603-0001"
 *         po_date:
 *           type: string
 *           format: date-time
 *           example: "2026-03-20T10:30:00.000Z"
 *         po_type:
 *           type: string
 *           enum: ['Regular', 'Subcontract', 'Import', 'Capital', 'Service', 'Blanket']
 *           example: "Regular"
 *         pr_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             pr_number:
 *               type: string
 *         rfq_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             rfq_number:
 *               type: string
 *         vendor_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             vendor_name:
 *               type: string
 *             vendor_code:
 *               type: string
 *         vendor_name:
 *           type: string
 *           example: "Vedanta Ltd"
 *         vendor_gstin:
 *           type: string
 *           example: "27AAACV1234B1Z6"
 *         vendor_state:
 *           type: string
 *           example: "Maharashtra"
 *         vendor_state_code:
 *           type: number
 *           example: 27
 *         company_id:
 *           type: object
 *         company_name:
 *           type: string
 *           example: "Suyash Enterprises"
 *         company_gstin:
 *           type: string
 *         company_state_code:
 *           type: number
 *         delivery_address:
 *           type: object
 *         delivery_date:
 *           type: string
 *           format: date
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/POItem'
 *         subtotal:
 *           type: number
 *           example: 52500
 *         discount_total:
 *           type: number
 *           example: 0
 *         taxable_total:
 *           type: number
 *           example: 52500
 *         cgst_total:
 *           type: number
 *           example: 4725
 *         sgst_total:
 *           type: number
 *           example: 4725
 *         igst_total:
 *           type: number
 *           example: 0
 *         gst_total:
 *           type: number
 *           example: 9450
 *         grand_total:
 *           type: number
 *           example: 61950
 *         gst_type:
 *           type: string
 *           enum: ['CGST/SGST', 'IGST']
 *         vendor_acknowledgement:
 *           type: boolean
 *           example: false
 *         ack_date:
 *           type: string
 *           format: date-time
 *         grn_ids:
 *           type: array
 *           items:
 *             type: string
 *         invoiced_amount:
 *           type: number
 *           example: 0
 *         paid_amount:
 *           type: number
 *           example: 0
 *         status:
 *           type: string
 *           enum: ['Draft', 'Approved', 'Sent', 'Acknowledged', 'Partially Received', 'Fully Received', 'Invoiced', 'Closed', 'Cancelled']
 *           example: "Draft"
 *         approved_by:
 *           type: object
 *         approved_at:
 *           type: string
 *           format: date-time
 *         payment_terms:
 *           type: string
 *           example: "Net 45"
 *         internal_remarks:
 *           type: string
 *         created_by:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *   responses:
 *     PONotFound:
 *       description: Purchase Order not found
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
 *                 example: "Purchase Order not found"
 *               error:
 *                 type: string
 *                 example: "PO_NOT_FOUND"
 *
 *     InvalidPOStatus:
 *       description: PO is in invalid status for this operation
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
 *                 example: "Cannot approve PO with status: Draft. PO must be in 'Approved' state"
 *               error:
 *                 type: string
 *                 example: "INVALID_PO_STATUS"
 *
 *     InsufficientApprovalLevel:
 *       description: User doesn't have sufficient approval level for PO amount
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
 *                 example: "Insufficient权限. PO amount ₹52,500 requires Manager approval"
 *               error:
 *                 type: string
 *                 example: "INSUFFICIENT_APPROVAL_LEVEL"
 *               required_level:
 *                 type: string
 *                 example: "Manager"
 *               po_amount:
 *                 type: number
 *                 example: 52500
 *
 *   parameters:
 *     poIdParam:
 *       in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: string
 *       description: Purchase Order ID
 *
 *     poStatusQuery:
 *       in: query
 *       name: status
 *       schema:
 *         type: string
 *         enum: ['Draft', 'Approved', 'Sent', 'Acknowledged', 'Partially Received', 'Fully Received', 'Invoiced', 'Closed', 'Cancelled']
 *       description: Filter by PO status
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

// ======================================================
// BASIC CRUD OPERATIONS
// ======================================================

/**
 * @swagger
 * /api/purchase-orders:
 *   post:
 *     summary: Create Purchase Order from RFQ
 *     tags: [Purchase Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/POCreate'
 *           example:
 *             rfq_id: "69bd1c88182711ea7a2dd605"
 *             delivery_date: "2026-04-15"
 *             payment_terms: "Net 45"
 *             internal_remarks: "Urgent requirement for production"
 *     responses:
 *       201:
 *         description: Purchase Order created successfully
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
 *                   example: "Purchase Order created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     po_number:
 *                       type: string
 *                       example: "PO-202603-0001"
 *                     po_date:
 *                       type: string
 *                       format: date-time
 *                     vendor_name:
 *                       type: string
 *                     grand_total:
 *                       type: number
 *                     status:
 *                       type: string
 *                       example: "Draft"
 *                     next_step:
 *                       type: string
 *                       example: "PO requires approval before sending to vendor"
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
 *                   example: "Cannot create PO from RFQ with status: Draft. RFQ must be Compared"
 *                 error:
 *                   type: string
 *                   example: "INVALID_RFQ_STATUS"
 *       404:
 *         description: RFQ not found
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.post('/', createPurchaseOrder);

/**
 * @swagger
 * /api/purchase-orders:
 *   get:
 *     summary: Get all purchase orders with pagination and filtering
 *     tags: [Purchase Orders]
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
 *       - $ref: '#/components/parameters/poStatusQuery'
 *       - $ref: '#/components/parameters/vendorIdQuery'
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by PO date from
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by PO date to
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: ['createdAt', 'po_number', 'po_date', 'grand_total']
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
 *         description: Purchase orders retrieved successfully
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
 *                     $ref: '#/components/schemas/PurchaseOrder'
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
router.get('/', getAllPurchaseOrders);

/**
 * @swagger
 * /api/purchase-orders/{id}:
 *   get:
 *     summary: Get purchase order by ID
 *     tags: [Purchase Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/poIdParam'
 *     responses:
 *       200:
 *         description: Purchase order retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/PurchaseOrder'
 *       404:
 *         $ref: '#/components/responses/PONotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', getPurchaseOrderById);

// ======================================================
// PO WORKFLOW ACTIONS
// ======================================================

/**
 * @swagger
 * /api/purchase-orders/{id}/approve:
 *   put:
 *     summary: Approve purchase order (value-based approval)
 *     tags: [Purchase Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/poIdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/POApprove'
 *     responses:
 *       200:
 *         description: Purchase order approved successfully
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
 *                   example: "Purchase Order approved by Manager"
 *                 data:
 *                   type: object
 *                   properties:
 *                     po_number:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "Approved"
 *                     approved_by:
 *                       type: string
 *                     approved_at:
 *                       type: string
 *                       format: date-time
 *                     approval_level:
 *                       type: string
 *                       example: "Manager"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/InvalidPOStatus'
 *               - $ref: '#/components/responses/InsufficientApprovalLevel'
 *       404:
 *         $ref: '#/components/responses/PONotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden - insufficient approval level
 *       500:
 *         description: Server error
 */
router.put('/:id/approve', approvePurchaseOrder);

/**
 * @swagger
 * /api/purchase-orders/{id}/send:
 *   put:
 *     summary: Send PO to vendor with PDF attachment
 *     tags: [Purchase Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/poIdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/POSend'
 *           example:
 *             send_email: true
 *     responses:
 *       200:
 *         description: Purchase order sent successfully
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
 *                   example: "Purchase Order sent successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     po_number:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "Sent"
 *                     email_status:
 *                       type: string
 *                       enum: ['sent', 'failed', 'not_sent']
 *                     pdf_generated:
 *                       type: boolean
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
 *                   example: "Cannot send PO with status: Draft. PO must be Approved"
 *                 error:
 *                   type: string
 *                   example: "INVALID_PO_STATUS"
 *       404:
 *         $ref: '#/components/responses/PONotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id/send', sendPurchaseOrder);

/**
 * @swagger
 * /api/purchase-orders/{id}/acknowledge:
 *   put:
 *     summary: Vendor acknowledges purchase order receipt
 *     tags: [Purchase Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/poIdParam'
 *     responses:
 *       200:
 *         description: Purchase order acknowledged successfully
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
 *                   example: "Purchase Order acknowledged successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     po_number:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "Acknowledged"
 *                     ack_date:
 *                       type: string
 *                       format: date-time
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
 *                   example: "Cannot acknowledge PO with status: Draft. PO must be Sent"
 *                 error:
 *                   type: string
 *                   example: "INVALID_PO_STATUS"
 *       404:
 *         $ref: '#/components/responses/PONotFound'
 *       500:
 *         description: Server error
 */
router.put('/:id/acknowledge', acknowledgePurchaseOrder);

/**
 * @swagger
 * /api/purchase-orders/{id}/remind:
 *   post:
 *     summary: Send reminder email for unacknowledged PO
 *     tags: [Purchase Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/poIdParam'
 *     responses:
 *       200:
 *         description: Reminder sent successfully
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
 *                   example: "Reminder sent successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     po_number:
 *                       type: string
 *                     vendor_email:
 *                       type: string
 *                     reminder_sent_at:
 *                         type: string
 *                         format: date-time
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
 *                   example: "PO already acknowledged"
 *                 error:
 *                   type: string
 *                   example: "ALREADY_ACKNOWLEDGED"
 *       404:
 *         $ref: '#/components/responses/PONotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.post('/:id/remind', remindUnacknowledgedPO);

module.exports = router;