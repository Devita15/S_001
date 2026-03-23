const express = require('express');
const router = express.Router();
const {
  getCostings,
  getCosting,
  createCosting,
  updateCostingStatus,
  deleteCosting,
  calculateLine
} = require('../../controllers/CRM/costingController');
const { protect } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Costings
 *   description: Internal costing management with dynamic calculations
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CostingProcess:
 *       type: object
 *       properties:
 *         line_process_id:
 *           type: string
 *           example: "LP-1234567890-0-0"
 *         process_id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         vendor_id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7c1"
 *         rate_entered:
 *           type: number
 *           example: 5
 *         quantity:
 *           type: number
 *           example: 100
 *         hours:
 *           type: number
 *           example: 2
 *         calculated_amount:
 *           type: number
 *           example: 500
 *
 *     CostingLine:
 *       type: object
 *       properties:
 *         costing_line_id:
 *           type: string
 *           example: "CL-1234567890-0"
 *         item_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             part_no:
 *               type: string
 *             part_description:
 *               type: string
 *             density:
 *               type: number
 *         thickness:
 *           type: number
 *           example: 10
 *         width:
 *           type: number
 *           example: 50
 *         length:
 *           type: number
 *           example: 100
 *         gross_weight:
 *           type: number
 *           example: 0.044
 *         rm_vendor_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             vendor_name:
 *               type: string
 *         rm_rate_entered:
 *           type: number
 *           example: 850
 *         gross_rm_cost:
 *           type: number
 *           example: 37.40
 *         scrap_rate_entered:
 *           type: number
 *           example: 450
 *         scrap_cost:
 *           type: number
 *           example: 5.50
 *         process_total:
 *           type: number
 *           example: 500
 *         subtotal_cost:
 *           type: number
 *           example: 531.90
 *         margin_percent:
 *           type: number
 *           example: 15
 *         margin_amount:
 *           type: number
 *           example: 79.79
 *         final_part_cost:
 *           type: number
 *           example: 611.69
 *         quantity:
 *           type: number
 *           example: 100
 *         line_total:
 *           type: number
 *           example: 61169
 *         processes:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CostingProcess'
 *
 *     Costing:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         costing_no:
 *           type: string
 *           example: "CST-202402-0001"
 *         costing_date:
 *           type: string
 *           format: date-time
 *         template_id:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             template_name:
 *               type: string
 *         subtotal:
 *           type: number
 *           example: 61169
 *         gst_percent:
 *           type: number
 *           example: 18
 *         gst_amount:
 *           type: number
 *           example: 11010.42
 *         grand_total:
 *           type: number
 *           example: 72179.42
 *         status:
 *           type: string
 *           enum: [Draft, Approved]
 *           example: "Draft"
 *         lines:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CostingLine'
 *         created_by:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             username:
 *               type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     CostingProcessInput:
 *       type: object
 *       required:
 *         - process_id
 *         - vendor_id
 *         - rate_entered
 *       properties:
 *         process_id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         vendor_id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7c1"
 *         rate_entered:
 *           type: number
 *           example: 5
 *         hours:
 *           type: number
 *           example: 2
 *           description: "Required for Per Hour rate type"
 *
 *     CostingLineInput:
 *       type: object
 *       required:
 *         - item_id
 *         - thickness
 *         - width
 *         - length
 *         - quantity
 *         - rm_vendor_id
 *         - rm_rate_entered
 *         - scrap_rate_entered
 *       properties:
 *         item_id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7c2"
 *         thickness:
 *           type: number
 *           example: 10
 *         width:
 *           type: number
 *           example: 50
 *         length:
 *           type: number
 *           example: 100
 *         section:
 *           type: number
 *           example: 0
 *         quantity:
 *           type: number
 *           example: 100
 *         rm_vendor_id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7c3"
 *         rm_rate_entered:
 *           type: number
 *           example: 850
 *         profile_conversion_rate:
 *           type: number
 *           example: 60
 *         scrap_rate_entered:
 *           type: number
 *           example: 450
 *         net_weight:
 *           type: number
 *           example: 0.03
 *         margin_percent:
 *           type: number
 *           example: 15
 *         processes:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CostingProcessInput'
 *
 *     CostingCreate:
 *       type: object
 *       required:
 *         - lines
 *       properties:
 *         template_id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         lines:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/CostingLineInput'
 *         gst_percent:
 *           type: number
 *           example: 18
 *           default: 18
 *
 *     CalculateLineInput:
 *       type: object
 *       required:
 *         - item_id
 *         - thickness
 *         - width
 *         - length
 *         - quantity
 *         - rm_rate_entered
 *         - scrap_rate_entered
 *       properties:
 *         item_id:
 *           type: string
 *         thickness:
 *           type: number
 *         width:
 *           type: number
 *         length:
 *           type: number
 *         quantity:
 *           type: number
 *         rm_rate_entered:
 *           type: number
 *         scrap_rate_entered:
 *           type: number
 *         profile_conversion_rate:
 *           type: number
 *         net_weight:
 *           type: number
 *         margin_percent:
 *           type: number
 *         processes:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CostingProcessInput'
 *
 *     CalculateLineResponse:
 *       type: object
 *       properties:
 *         gross_weight:
 *           type: number
 *         scrap_kgs:
 *           type: number
 *         total_rm_rate:
 *           type: number
 *         gross_rm_cost:
 *           type: number
 *         scrap_cost:
 *           type: number
 *         process_total:
 *           type: number
 *         process_details:
 *           type: array
 *         subtotal:
 *           type: number
 *         margin_amount:
 *           type: number
 *         final_part_cost:
 *           type: number
 *         line_total:
 *           type: number
 *
 *   responses:
 *     CostingNotFound:
 *       description: Costing not found
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
 *                 example: "Costing not found"
 *
 *     ItemNotFound:
 *       description: Item not found
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
 *                 example: "Item not found"
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/costings:
 *   get:
 *     summary: Get all costings with pagination and filtering
 *     tags: [Costings]
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
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Draft, Approved]
 *         description: Filter by status
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in costing number
 *     responses:
 *       200:
 *         description: Costings retrieved successfully
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
 *                     $ref: '#/components/schemas/Costing'
 *                 pagination:
 *                   type: object
 *                 statistics:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', protect, getCostings);

/**
 * @swagger
 * /api/costings/calculate-line:
 *   post:
 *     summary: Calculate line totals without saving
 *     tags: [Costings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CalculateLineInput'
 *     responses:
 *       200:
 *         description: Line calculated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CalculateLineResponse'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/calculate-line', protect, calculateLine);

/**
 * @swagger
 * /api/costings/{id}:
 *   get:
 *     summary: Get single costing by ID
 *     tags: [Costings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Costing ID
 *     responses:
 *       200:
 *         description: Costing retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Costing'
 *       404:
 *         $ref: '#/components/responses/CostingNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', protect, getCosting);

/**
 * @swagger
 * /api/costings:
 *   post:
 *     summary: Create a new costing
 *     tags: [Costings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CostingCreate'
 *     responses:
 *       201:
 *         description: Costing created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Costing'
 *                 message:
 *                   type: string
 *                   example: "Costing created successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/ValidationError'
 *               - $ref: '#/components/responses/ItemNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/', protect, createCosting);

/**
 * @swagger
 * /api/costings/{id}/status:
 *   put:
 *     summary: Update costing status
 *     tags: [Costings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Costing ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Draft, Approved]
 *                 example: "Approved"
 *     responses:
 *       200:
 *         description: Status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Costing'
 *                 message:
 *                   type: string
 *                   example: "Costing Approved successfully"
 *       404:
 *         $ref: '#/components/responses/CostingNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id/status', protect, updateCostingStatus);

/**
 * @swagger
 * /api/costings/{id}:
 *   delete:
 *     summary: Delete a costing (SOFT DELETE)
 *     tags: [Costings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Costing ID
 *     responses:
 *       200:
 *         description: Costing deleted successfully
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
 *                   example: "Costing deleted successfully"
 *       400:
 *         description: Bad request - only draft can be deleted
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
 *                   example: "Only draft costings can be deleted"
 *       404:
 *         $ref: '#/components/responses/CostingNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.delete('/:id', protect, deleteCosting);

module.exports = router;