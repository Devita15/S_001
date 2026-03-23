// routes/CRM/purchaseRequisitionRoutes.js
const express = require('express');
const router = express.Router();
const {
  // Basic CRUD
  createPurchaseRequisition,
  getAllPurchaseRequisitions,
  getPurchaseRequisitionById,
  updatePurchaseRequisition,
  
  // Approval Actions
  approvePurchaseRequisition,
  rejectPurchaseRequisition,
  
  // Special Queries
  getPendingRFQRequisitions,
  getAgingRequisitions
} = require('../../controllers/Procurement/purchaseRequisitionController');

const { protect, authorize } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Purchase Requisitions
 *   description: Purchase Requisition (PR) management with approval workflow and RFQ integration
 */

// ======================================================
// COMMON COMPONENTS
// ======================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     # ========== PR ITEM SCHEMA ==========
 *     PRItem:
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
 *         estimated_price:
 *           type: number
 *           example: 740
 *           description: Estimated price per unit (optional)
 *         remarks:
 *           type: string
 *           example: "C11000 grade, urgent requirement"
 *         # unit field removed - auto-filled from Item master
 *
 *     # ========== PURCHASE REQUISITION FULL SCHEMA ==========
 *     PurchaseRequisition:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "67f8e9b7a1b2c3d4e5f6a7d1"
 *         pr_number:
 *           type: string
 *           example: "PR-202603-0001"
 *         pr_date:
 *           type: string
 *           format: date-time
 *           example: "2026-03-20T10:30:00.000Z"
 *         pr_type:
 *           type: string
 *           enum: ['Material', 'Service', 'Capital', 'Subcontract']
 *           example: "Material"
 *         source:
 *           type: string
 *           enum: ['MRP Auto', 'Manual', 'Reorder Alert', 'Indent']
 *           example: "Manual"
 *         mrp_run_id:
 *           type: string
 *           example: "MRP-20250315-001"
 *           nullable: true
 *         # wo_id removed - not in schema
 *         department:
 *           type: string
 *           enum: ['Production', 'Quality', 'Maintenance', 'Admin', 'Store', 'Sales']
 *           example: "Production"
 *         required_by:
 *           type: string
 *           format: date
 *           example: "2026-04-15"
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               _id:
 *                 type: string
 *               item_id:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   part_no:
 *                     type: string
 *                   part_description:
 *                     type: string
 *                   hsn_code:
 *                     type: string
 *                   unit:
 *                     type: string
 *               part_no:
 *                 type: string
 *                 example: "BR-001"
 *               description:
 *                 type: string
 *                 example: "Copper Busbar 10x50x100"
 *               required_qty:
 *                 type: number
 *                 example: 500
 *               unit:
 *                 type: string
 *                 example: "Nos"
 *               estimated_price:
 *                 type: number
 *                 example: 740
 *               required_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-15"
 *               remarks:
 *                 type: string
 *                 example: "C11000 grade, urgent requirement"
 *               status:
 *                 type: string
 *                 enum: ['Pending', 'Partially Ordered', 'Fully Ordered', 'Cancelled']
 *                 example: "Pending"
 *               po_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *         status:
 *           type: string
 *           enum: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Partially Ordered', 'Fully Ordered', 'Closed']
 *           example: "Submitted"
 *         requested_by:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             Username:
 *               type: string
 *             Email:
 *               type: string
 *         approved_by:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             Username:
 *               type: string
 *             Email:
 *               type: string
 *         approved_at:
 *           type: string
 *           format: date-time
 *         rejection_reason:
 *           type: string
 *           example: "Budget not approved"
 *         po_ids:
 *           type: array
 *           items:
 *             type: string
 *           example: []
 *         created_by:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             Username:
 *               type: string
 *             Email:
 *               type: string
 *         updated_by:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             Username:
 *               type: string
 *             Email:
 *               type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     # ========== CREATE PR SCHEMA (UPDATED) ==========
 *     PRCreate:
 *       type: object
 *       required:
 *         - pr_type
 *         - department
 *         - required_by
 *         - items
 *       properties:
 *         pr_type:
 *           type: string
 *           enum: ['Material', 'Service', 'Capital', 'Subcontract']
 *           example: "Material"
 *         source:
 *           type: string
 *           enum: ['MRP Auto', 'Manual', 'Reorder Alert', 'Indent']
 *           default: "Manual"
 *           example: "Manual"
 *         mrp_run_id:
 *           type: string
 *           example: "MRP-20250315-001"
 *           description: "MRP Run ID (optional for manual PRs)"
 *         # wo_id removed - not in controller
 *         department:
 *           type: string
 *           enum: ['Production', 'Quality', 'Maintenance', 'Admin', 'Store', 'Sales']
 *           example: "Production"
 *         required_by:
 *           type: string
 *           format: date
 *           example: "2026-04-15"
 *           description: "Must be a future date"
 *         items:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/PRItem'
 *
 *     # ========== UPDATE PR SCHEMA ==========
 *     PRUpdate:
 *       type: object
 *       properties:
 *         pr_type:
 *           type: string
 *           enum: ['Material', 'Service', 'Capital', 'Subcontract']
 *           example: "Service"
 *         source:
 *           type: string
 *           enum: ['MRP Auto', 'Manual', 'Reorder Alert', 'Indent']
 *         mrp_run_id:
 *           type: string
 *         # wo_id removed - not in schema
 *         department:
 *           type: string
 *           enum: ['Production', 'Quality', 'Maintenance', 'Admin', 'Store', 'Sales']
 *         required_by:
 *           type: string
 *           format: date
 *           description: "Must be a future date"
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PRItem'
 *         status:
 *           type: string
 *           enum: ['Draft', 'Submitted', 'Rejected']
 *           description: "Cannot set to Approved directly - use approve endpoint"
 *         rejection_reason:
 *           type: string
 *
 *     # ========== APPROVE PR SCHEMA ==========
 *     PRApprove:
 *       type: object
 *       properties:
 *         approval_notes:
 *           type: string
 *           example: "Approved as per budget. Urgent requirement."
 *
 *     # ========== REJECT PR SCHEMA ==========
 *     PRReject:
 *       type: object
 *       required:
 *         - rejection_reason
 *       properties:
 *         rejection_reason:
 *           type: string
 *           example: "Budget not approved for this quarter"
 *
 *     # ========== PENDING RFQ SCHEMA ==========
 *     PendingRFQItem:
 *       type: object
 *       properties:
 *         pr_number:
 *           type: string
 *           example: "PR-202603-0001"
 *         pr_date:
 *           type: string
 *           format: date-time
 *         required_by:
 *           type: string
 *           format: date
 *         department:
 *           type: string
 *         requested_by:
 *           type: string
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               part_no:
 *                 type: string
 *               description:
 *                 type: string
 *               required_qty:
 *                 type: number
 *               unit:
 *                 type: string
 *         eligible_vendors_count:
 *           type: number
 *           example: 5
 *         days_to_required:
 *           type: number
 *           example: 26
 *         priority:
 *           type: string
 *           enum: ['High', 'Medium', 'Low']
 *           example: "Low"
 *
 *     # ========== AGING PR SCHEMA ==========
 *     AgingPR:
 *       type: object
 *       properties:
 *         pr_number:
 *           type: string
 *           example: "PR-202603-0001"
 *         created_at:
 *           type: string
 *           format: date-time
 *         aging_days:
 *           type: number
 *           example: 4
 *         requested_by:
 *           type: string
 *         department:
 *           type: string
 *         total_value:
 *           type: number
 *         items_count:
 *           type: number
 *         status:
 *           type: string
 *           example: "Submitted"
 *         is_critical:
 *           type: boolean
 *         days_exceeded:
 *           type: number
 *
 *   responses:
 *     PRNotFound:
 *       description: Purchase requisition not found
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
 *                 example: "Purchase requisition not found"
 *               error:
 *                 type: string
 *                 example: "PR_NOT_FOUND"
 *
 *     InvalidPRStatus:
 *       description: PR is in invalid status for this operation
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
 *                 example: "Cannot approve PR with status: Draft. PR must be in 'Submitted' state"
 *               error:
 *                 type: string
 *                 example: "INVALID_PR_STATUS"
 *
 *     InvalidRequiredDate:
 *       description: Required by date must be in future
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
 *                 example: "Required by date must be a future date"
 *               error:
 *                 type: string
 *                 example: "INVALID_REQUIRED_DATE"
 *
 *   parameters:
 *     prIdParam:
 *       in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: string
 *       description: Purchase Requisition ID
 *
 *     prStatusQuery:
 *       in: query
 *       name: status
 *       schema:
 *         type: string
 *         enum: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Partially Ordered', 'Fully Ordered', 'Closed']
 *       description: Filter by PR status
 *
 *     prTypeQuery:
 *       in: query
 *       name: pr_type
 *       schema:
 *         type: string
 *         enum: ['Material', 'Service', 'Capital', 'Subcontract']
 *       description: Filter by PR type
 *
 *     departmentQuery:
 *       in: query
 *       name: department
 *       schema:
 *         type: string
 *         enum: ['Production', 'Quality', 'Maintenance', 'Admin', 'Store', 'Sales']
 *       description: Filter by department
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

// ======================================================
// BASIC CRUD ENDPOINTS
// ======================================================

/**
 * @swagger
 * /api/purchase-requisitions:
 *   post:
 *     summary: Create a new purchase requisition
 *     tags: [Purchase Requisitions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PRCreate'
 *           example:
 *             pr_type: "Material"
 *             source: "Manual"
 *             mrp_run_id: "MRP-20250315-001"
 *             department: "Production"
 *             required_by: "2026-04-15"
 *             items:
 *               - item_id: "69bcea4e94e5c414c62aed73"
 *                 required_qty: 500
 *                 estimated_price: 740
 *                 remarks: "C11000 grade, urgent requirement"
 *     responses:
 *       201:
 *         description: Purchase requisition created successfully
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
 *                   example: "Purchase requisition created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/PurchaseRequisition'
 *             example:
 *               success: true
 *               message: "Purchase requisition created successfully"
 *               data:
 *                 _id: "67f8e9b7a1b2c3d4e5f6a7d1"
 *                 pr_number: "PR-202603-0001"
 *                 pr_date: "2026-03-20T10:30:00.000Z"
 *                 pr_type: "Material"
 *                 source: "Manual"
 *                 mrp_run_id: "MRP-20250315-001"
 *                 department: "Production"
 *                 status: "Submitted"
 *                 required_by: "2026-04-15T00:00:00.000Z"
 *                 items:
 *                   - item_id: "69bcea4e94e5c414c62aed73"
 *                     part_no: "BR-001"
 *                     description: "Copper Busbar 10x50x100"
 *                     required_qty: 500
 *                     unit: "Nos"
 *                     estimated_price: 740
 *                     required_date: "2026-04-15T00:00:00.000Z"
 *                     remarks: "C11000 grade, urgent requirement"
 *                     status: "Pending"
 *                 requested_by:
 *                   _id: "69818ebeebb21bdebe05955b"
 *                   username: "john.doe"
 *                   email: "john@company.com"
 *                 po_ids: []
 *                 created_at: "2026-03-20T10:30:00.000Z"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/InvalidRequiredDate'
 *               - schema:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: false
 *                     message:
 *                       type: string
 *                       example: "At least one item is required"
 *                     error:
 *                       type: string
 *                       example: "ITEMS_REQUIRED"
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/', protect, authorize('admin', 'manager', 'production', 'store'), createPurchaseRequisition);

/**
 * @swagger
 * /api/purchase-requisitions:
 *   get:
 *     summary: Get all purchase requisitions with pagination and filtering
 *     tags: [Purchase Requisitions]
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
 *       - $ref: '#/components/parameters/prStatusQuery'
 *       - $ref: '#/components/parameters/prTypeQuery'
 *       - $ref: '#/components/parameters/departmentQuery'
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by created date from
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by created date to
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by PR number
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: ['createdAt', 'pr_number', 'required_by', 'status']
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
 *         description: Purchase requisitions retrieved successfully
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
 *                     $ref: '#/components/schemas/PurchaseRequisition'
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
router.get('/', protect, getAllPurchaseRequisitions);

/**
 * @swagger
 * /api/purchase-requisitions/pending-rfq:
 *   get:
 *     summary: Get approved PRs that are ready for RFQ creation
 *     tags: [Purchase Requisitions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending RFQ list retrieved successfully
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
 *                     $ref: '#/components/schemas/PendingRFQItem'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/pending-rfq', protect, authorize('admin', 'manager', 'purchase'), getPendingRFQRequisitions);

/**
 * @swagger
 * /api/purchase-requisitions/aging:
 *   get:
 *     summary: Get PR aging report (PRs pending approval beyond SLA)
 *     tags: [Purchase Requisitions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 3
 *         description: SLA threshold in days
 *     responses:
 *       200:
 *         description: PR aging report retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     sla_days:
 *                       type: integer
 *                     aging_prs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AgingPR'
 *                     total_pending:
 *                       type: integer
 *                     exceeded_sla_count:
 *                       type: integer
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/aging', protect, authorize('admin', 'manager'), getAgingRequisitions);

/**
 * @swagger
 * /api/purchase-requisitions/{id}:
 *   get:
 *     summary: Get purchase requisition by ID
 *     tags: [Purchase Requisitions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/prIdParam'
 *     responses:
 *       200:
 *         description: Purchase requisition retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/PurchaseRequisition'
 *       404:
 *         $ref: '#/components/responses/PRNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', protect, getPurchaseRequisitionById);

/**
 * @swagger
 * /api/purchase-requisitions/{id}:
 *   put:
 *     summary: Update a purchase requisition (only Draft or Submitted status)
 *     tags: [Purchase Requisitions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/prIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PRUpdate'
 *     responses:
 *       200:
 *         description: Purchase requisition updated successfully
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
 *                   example: "Purchase requisition updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/PurchaseRequisition'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/InvalidRequiredDate'
 *               - $ref: '#/components/responses/InvalidPRStatus'
 *       404:
 *         $ref: '#/components/responses/PRNotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden - insufficient permissions
 *       500:
 *         description: Server error
 */
router.put('/:id', protect, authorize('admin', 'manager', 'production', 'store'), updatePurchaseRequisition);

// ======================================================
// APPROVAL ACTION ENDPOINTS
// ======================================================

/**
 * @swagger
 * /api/purchase-requisitions/{id}/approve:
 *   put:
 *     summary: Approve a purchase requisition (Manager role only)
 *     tags: [Purchase Requisitions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/prIdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PRApprove'
 *     responses:
 *       200:
 *         description: Purchase requisition approved successfully
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
 *                   example: "Purchase requisition approved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     pr_number:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "Approved"
 *                     approved_by:
 *                       type: object
 *                     approved_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/InvalidPRStatus'
 *               - schema:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: false
 *                     message:
 *                       type: string
 *                       example: "Cannot approve PR as required_by date has passed"
 *                     error:
 *                       type: string
 *                       example: "REQUIRED_DATE_PASSED"
 *       404:
 *         $ref: '#/components/responses/PRNotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden - manager only
 *       500:
 *         description: Server error
 */
router.put('/:id/approve', protect, authorize('admin', 'manager'), approvePurchaseRequisition);

/**
 * @swagger
 * /api/purchase-requisitions/{id}/reject:
 *   put:
 *     summary: Reject a purchase requisition (Manager role only)
 *     tags: [Purchase Requisitions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/prIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PRReject'
 *     responses:
 *       200:
 *         description: Purchase requisition rejected successfully
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
 *                   example: "Purchase requisition rejected successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     pr_number:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "Rejected"
 *                     rejection_reason:
 *                       type: string
 *                     rejected_by:
 *                       type: string
 *                     rejected_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/InvalidPRStatus'
 *               - schema:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: false
 *                     message:
 *                       type: string
 *                       example: "Rejection reason is required"
 *                     error:
 *                       type: string
 *                       example: "REJECTION_REASON_REQUIRED"
 *       404:
 *         $ref: '#/components/responses/PRNotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden - manager only
 *       500:
 *         description: Server error
 */
router.put('/:id/reject', protect, authorize('admin', 'manager'), rejectPurchaseRequisition);

module.exports = router;