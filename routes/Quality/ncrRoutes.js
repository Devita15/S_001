// routes/Quality/ncrRoutes.js
const express = require('express');
const router = express.Router();
const {
  getNCRByGRNId,
  getNCRById,
  getAllNCRs,
  getNCRsByVendor,
  getNCRsByPO,
  closeNCR,
  updateDisposition,
  updateStatus,
  addAction,
  getNCRDashboardStats
} = require('../../controllers/Quality/ncrController');

const { protect, authorize } = require('../../middleware/authMiddleware');

router.use(protect);

/**
 * @swagger
 * tags:
 *   name: NCR (Non-Conformance Report)
 *   description: NCR management for quality issues, returns, and vendor performance tracking
 */

// ======================================================
// COMMON COMPONENTS
// ======================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     # ========== NCR ACTION SCHEMA ==========
 *     NCRAction:
 *       type: object
 *       properties:
 *         action_type:
 *           type: string
 *           enum: ['Corrective Action', 'Preventive Action', 'Immediate Action']
 *           example: "Corrective Action"
 *         description:
 *           type: string
 *           example: "Inspect all incoming material from this vendor for 30 days"
 *         assigned_to:
 *           type: string
 *           example: "67f8e9b7a1b2c3d4e5f6a7d1"
 *         due_date:
 *           type: string
 *           format: date
 *           example: "2026-04-15"
 *         status:
 *           type: string
 *           enum: ['Pending', 'In Progress', 'Completed', 'Overdue']
 *           example: "Pending"
 *
 *     # ========== NCR FULL SCHEMA ==========
 *     NCR:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "69be2a0aa21c9da181ec02bc"
 *         ncr_number:
 *           type: string
 *           example: "NCR-202603-0001"
 *         ncr_date:
 *           type: string
 *           format: date-time
 *           example: "2026-03-21T05:18:02.633Z"
 *         grn_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             grn_number:
 *               type: string
 *         po_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             po_number:
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
 *         item_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             part_no:
 *               type: string
 *             part_description:
 *               type: string
 *         rejected_qty:
 *           type: number
 *           example: 3
 *         unit:
 *           type: string
 *           example: "Nos"
 *         ncr_type:
 *           type: string
 *           enum: ['Incoming Material', 'In-Process', 'Finished Goods', 'Customer Complaint', 'Process Deviation']
 *           example: "Incoming Material"
 *         severity:
 *           type: string
 *           enum: ['Critical', 'Major', 'Minor', 'Observation']
 *           example: "Major"
 *         defect_description:
 *           type: string
 *           example: "three items are rejected due to bad quality"
 *         root_cause:
 *           type: string
 *         root_cause_analysis:
 *           type: string
 *         disposition:
 *           type: string
 *           enum: ['Use As Is', 'Rework', 'Scrap', 'Return to Vendor', 'Credit Note', 'Replacement']
 *           example: "Return to Vendor"
 *         disposition_notes:
 *           type: string
 *           example: "Rejected items to be returned for replacement or credit"
 *         estimated_loss:
 *           type: number
 *           example: 3150
 *         actual_loss:
 *           type: number
 *           example: 3150
 *         recovery_amount:
 *           type: number
 *           example: 3150
 *         immediate_actions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/NCRAction'
 *         corrective_actions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/NCRAction'
 *         preventive_actions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/NCRAction'
 *         status:
 *           type: string
 *           enum: ['Open', 'Under Investigation', 'Action Pending', 'Closed', 'Rejected', 'Escalated']
 *           example: "Open"
 *         closure_remarks:
 *           type: string
 *         closed_at:
 *           type: string
 *           format: date-time
 *         closed_by:
 *           type: object
 *         attachments:
 *           type: array
 *         created_by:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     # ========== UPDATE NCR STATUS SCHEMA ==========
 *     NCRStatusUpdate:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           enum: ['Open', 'Under Investigation', 'Action Pending', 'Closed', 'Rejected', 'Escalated']
 *           example: "Under Investigation"
 *         remarks:
 *           type: string
 *           example: "Quality team investigating root cause"
 *
 *     # ========== CLOSE NCR SCHEMA ==========
 *     NCRClose:
 *       type: object
 *       properties:
 *         resolution:
 *           type: string
 *           example: "Vendor replaced 3 pieces with new ones"
 *         actual_loss:
 *           type: number
 *           example: 3150
 *         recovery_amount:
 *           type: number
 *           example: 3150
 *         closure_remarks:
 *           type: string
 *           example: "NCR closed. Vendor issued credit note for 3 pieces"
 *
 *     # ========== UPDATE DISPOSITION SCHEMA ==========
 *     NCRDispositionUpdate:
 *       type: object
 *       properties:
 *         disposition:
 *           type: string
 *           enum: ['Use As Is', 'Rework', 'Scrap', 'Return to Vendor', 'Credit Note', 'Replacement']
 *           example: "Credit Note"
 *         disposition_notes:
 *           type: string
 *           example: "Vendor agreed to issue credit note for rejected pieces"
 *         estimated_loss:
 *           type: number
 *           example: 3150
 *
 *     # ========== ADD ACTION SCHEMA ==========
 *     NCRActionAdd:
 *       type: object
 *       required:
 *         - action_type
 *         - description
 *       properties:
 *         action_type:
 *           type: string
 *           enum: ['Corrective Action', 'Preventive Action', 'Immediate Action']
 *           example: "Corrective Action"
 *         description:
 *           type: string
 *           example: "Inspect all incoming material from this vendor for 30 days"
 *         assigned_to:
 *           type: string
 *           example: "67f8e9b7a1b2c3d4e5f6a7d1"
 *         due_date:
 *           type: string
 *           format: date
 *           example: "2026-04-15"
 *
 *   responses:
 *     NCRNotFound:
 *       description: NCR not found
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
 *                 example: "NCR not found"
 *               error:
 *                 type: string
 *                 example: "NCR_NOT_FOUND"
 *
 *   parameters:
 *     ncrIdParam:
 *       in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: string
 *       description: NCR ID
 *     grnIdParam:
 *       in: path
 *       name: grnId
 *       required: true
 *       schema:
 *         type: string
 *       description: GRN ID
 *     vendorIdParam:
 *       in: path
 *       name: vendorId
 *       required: true
 *       schema:
 *         type: string
 *       description: Vendor ID
 */

// ======================================================
// DASHBOARD (MUST COME BEFORE /:id)
// ======================================================

/**
 * @swagger
 * /api/ncr/dashboard/stats:
 *   get:
 *     summary: Get NCR dashboard statistics
 *     tags: [NCR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date
 *           example: "2026-03-01"
 *         description: Filter from date
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date
 *           example: "2026-03-31"
 *         description: Filter to date
 *       - in: query
 *         name: vendor_id
 *         schema:
 *           type: string
 *           example: "69bcf55c54002008f1ebb0f9"
 *         description: Filter by vendor
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
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
 *                     overall:
 *                       type: object
 *                       properties:
 *                         total_ncrs:
 *                           type: number
 *                         total_rejected_qty:
 *                           type: number
 *                         total_estimated_loss:
 *                           type: number
 *                         total_actual_loss:
 *                           type: number
 *                         total_recovered:
 *                           type: number
 *                         open_ncrs:
 *                           type: number
 *                         closed_ncrs:
 *                           type: number
 *                     by_severity:
 *                       type: array
 *                     by_type:
 *                       type: array
 *                     top_vendors:
 *                       type: array
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.get('/dashboard/stats', authorize('admin', 'manager', 'quality'), getNCRDashboardStats);

// ======================================================
// NCR APIs BY REFERENCE
// ======================================================

/**
 * @swagger
 * /api/ncr/grn/{grnId}:
 *   get:
 *     summary: Get NCR by GRN ID
 *     description: Retrieves the NCR associated with a specific GRN (Goods Receipt Note)
 *     tags: [NCR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/grnIdParam'
 *     responses:
 *       200:
 *         description: NCR retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/NCR'
 *       404:
 *         $ref: '#/components/responses/NCRNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/grn/:grnId', getNCRByGRNId);

/**
 * @swagger
 * /api/ncr/po/{poId}:
 *   get:
 *     summary: Get NCRs by PO ID
 *     description: Retrieves all NCRs associated with a specific Purchase Order
 *     tags: [NCR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: poId
 *         required: true
 *         schema:
 *           type: string
 *         description: Purchase Order ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ['Open', 'Under Investigation', 'Action Pending', 'Closed', 'Rejected', 'Escalated']
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: NCRs retrieved successfully
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
 *                     $ref: '#/components/schemas/NCR'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/po/:poId', getNCRsByPO);

/**
 * @swagger
 * /api/ncr/vendor/{vendorId}:
 *   get:
 *     summary: Get NCRs by Vendor ID
 *     description: Retrieves all NCRs for a specific vendor with performance statistics
 *     tags: [NCR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/vendorIdParam'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ['Open', 'Under Investigation', 'Action Pending', 'Closed', 'Rejected', 'Escalated']
 *         description: Filter by status
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from date
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date
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
 *     responses:
 *       200:
 *         description: NCRs retrieved successfully
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
 *                     vendor:
 *                       type: object
 *                     statistics:
 *                       type: object
 *                     ncrs:
 *                       type: array
 *                     pagination:
 *                       type: object
 *       404:
 *         description: Vendor not found
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/vendor/:vendorId', getNCRsByVendor);

// ======================================================
// NCR LISTING APIs
// ======================================================

/**
 * @swagger
 * /api/ncr:
 *   get:
 *     summary: Get all NCRs with pagination and filtering
 *     tags: [NCR]
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
 *           enum: ['Open', 'Under Investigation', 'Action Pending', 'Closed', 'Rejected', 'Escalated']
 *         description: Filter by NCR status
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: ['Critical', 'Major', 'Minor', 'Observation']
 *         description: Filter by severity
 *       - in: query
 *         name: ncr_type
 *         schema:
 *           type: string
 *           enum: ['Incoming Material', 'In-Process', 'Finished Goods', 'Customer Complaint', 'Process Deviation']
 *         description: Filter by NCR type
 *       - in: query
 *         name: vendor_id
 *         schema:
 *           type: string
 *         description: Filter by vendor
 *       - in: query
 *         name: po_id
 *         schema:
 *           type: string
 *         description: Filter by PO
 *       - in: query
 *         name: grn_id
 *         schema:
 *           type: string
 *         description: Filter by GRN
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from date
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: ['ncr_date', 'createdAt', 'ncr_number', 'severity']
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
 *         description: NCRs retrieved successfully
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
 *                     $ref: '#/components/schemas/NCR'
 *                 pagination:
 *                   type: object
 *                 statistics:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', getAllNCRs);

// ======================================================
// NCR SINGLE RECORD APIs
// ======================================================

/**
 * @swagger
 * /api/ncr/{id}:
 *   get:
 *     summary: Get NCR by ID
 *     tags: [NCR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ncrIdParam'
 *     responses:
 *       200:
 *         description: NCR retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/NCR'
 *       404:
 *         $ref: '#/components/responses/NCRNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', getNCRById);

// ======================================================
// NCR UPDATE APIs
// ======================================================

/**
 * @swagger
 * /api/ncr/{id}/status:
 *   put:
 *     summary: Update NCR status
 *     tags: [NCR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ncrIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NCRStatusUpdate'
 *           example:
 *             status: "Under Investigation"
 *             remarks: "Quality team investigating root cause of defects"
 *     responses:
 *       200:
 *         description: NCR status updated successfully
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
 *                   example: "NCR status updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     ncr_number:
 *                       type: string
 *                     status:
 *                       type: string
 *       400:
 *         description: Bad request
 *       404:
 *         $ref: '#/components/responses/NCRNotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.put('/:id/status', authorize('admin', 'manager', 'quality'), updateStatus);

/**
 * @swagger
 * /api/ncr/{id}/disposition:
 *   put:
 *     summary: Update NCR disposition
 *     description: Update the disposition (action to be taken) for the NCR
 *     tags: [NCR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ncrIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NCRDispositionUpdate'
 *           example:
 *             disposition: "Credit Note"
 *             disposition_notes: "Vendor agreed to issue credit note for rejected pieces"
 *             estimated_loss: 3150
 *     responses:
 *       200:
 *         description: NCR disposition updated successfully
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
 *                   example: "NCR disposition updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     ncr_number:
 *                       type: string
 *                     disposition:
 *                       type: string
 *                     disposition_notes:
 *                       type: string
 *                     estimated_loss:
 *                       type: number
 *       400:
 *         description: Bad request
 *       404:
 *         $ref: '#/components/responses/NCRNotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.put('/:id/disposition', authorize('admin', 'manager', 'quality'), updateDisposition);

/**
 * @swagger
 * /api/ncr/{id}/close:
 *   put:
 *     summary: Close NCR
 *     description: Close the NCR after resolution (replacement, credit note, etc.)
 *     tags: [NCR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ncrIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NCRClose'
 *           example:
 *             resolution: "Vendor replaced 3 pieces with new ones"
 *             actual_loss: 3150
 *             recovery_amount: 3150
 *             closure_remarks: "NCR closed. Vendor issued credit note for 3 pieces"
 *     responses:
 *       200:
 *         description: NCR closed successfully
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
 *                   example: "NCR closed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     ncr_number:
 *                       type: string
 *                     status:
 *                       type: string
 *                     closed_at:
 *                       type: string
 *                       format: date-time
 *                     actual_loss:
 *                       type: number
 *                     recovery_amount:
 *                       type: number
 *       400:
 *         description: Bad request
 *       404:
 *         $ref: '#/components/responses/NCRNotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.put('/:id/close', authorize('admin', 'manager', 'quality'), closeNCR);

/**
 * @swagger
 * /api/ncr/{id}/actions:
 *   post:
 *     summary: Add action to NCR (Corrective/Preventive/Immediate)
 *     tags: [NCR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ncrIdParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NCRActionAdd'
 *           examples:
 *             corrective_action:
 *               summary: Corrective Action
 *               value:
 *                 action_type: "Corrective Action"
 *                 description: "Inspect all incoming material from this vendor for 30 days"
 *                 assigned_to: "67f8e9b7a1b2c3d4e5f6a7d1"
 *                 due_date: "2026-04-15"
 *             preventive_action:
 *               summary: Preventive Action
 *               value:
 *                 action_type: "Preventive Action"
 *                 description: "Add 100% inspection for this vendor's materials in incoming QC plan"
 *                 assigned_to: "67f8e9b7a1b2c3d4e5f6a7d1"
 *                 due_date: "2026-03-31"
 *             immediate_action:
 *               summary: Immediate Action
 *               value:
 *                 action_type: "Immediate Action"
 *                 description: "Segregate and quarantine all affected material"
 *                 assigned_to: "67f8e9b7a1b2c3d4e5f6a7d1"
 *                 due_date: "2026-03-22"
 *     responses:
 *       200:
 *         description: Action added successfully
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
 *                   example: "Action added successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     ncr_number:
 *                       type: string
 *                     action:
 *                       $ref: '#/components/schemas/NCRAction'
 *       400:
 *         description: Bad request
 *       404:
 *         $ref: '#/components/responses/NCRNotFound'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.post('/:id/actions', authorize('admin', 'manager', 'quality'), addAction);

module.exports = router;