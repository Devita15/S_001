const express = require('express');
const router = express.Router();
const {
  createRouting,
  getRoutings,
  getRoutingById,
  updateRouting,
  approveRouting
} = require('../../controllers/BOM/routingController');
const { protect, authorize } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Routing
 *   description: Process routing management - Phase 04
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     RoutingOperation:
 *       type: object
 *       required:
 *         - op_sequence
 *         - operation_id
 *         - operation_name
 *         - work_centre
 *         - planned_run_min
 *       properties:
 *         op_sequence:
 *           type: integer
 *           example: 10
 *           description: Operation sequence number (10, 20, 30...)
 *         operation_id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         operation_name:
 *           type: string
 *           example: "Sawing"
 *         work_centre:
 *           type: string
 *           example: "Sawing Bay"
 *         machine_id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7c5"
 *         is_subcontract:
 *           type: boolean
 *           default: false
 *         subcontract_vendor:
 *           type: string
 *         planned_setup_min:
 *           type: number
 *           example: 15
 *           default: 0
 *         planned_run_min:
 *           type: number
 *           example: 2.5
 *         scrap_pct:
 *           type: number
 *           example: 0.5
 *           default: 0
 *         description:
 *           type: string
 *
 *     RoutingCreateRequest:
 *       type: object
 *       required:
 *         - routing_name
 *         - routing_type
 *         - operations
 *       properties:
 *         routing_name:
 *           type: string
 *           example: "Copper Busbar Standard Route"
 *         routing_type:
 *           type: string
 *           enum: [Stamping, Busbar, Gasket, Assembly, Toolroom, General]
 *           example: "Busbar"
 *         applicable_items:
 *           type: array
 *           items:
 *             type: string
 *         operations:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/RoutingOperation'
 *         version:
 *           type: string
 *           default: "1.0"
 *
 *     Routing:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         routing_id:
 *           type: string
 *           example: "RTG-202503-0001"
 *         routing_name:
 *           type: string
 *         routing_type:
 *           type: string
 *         applicable_items:
 *           type: array
 *           items:
 *             type: object
 *         operations:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RoutingOperation'
 *         total_cycle_time_min:
 *           type: number
 *         approved_by:
 *           type: object
 *         approved_at:
 *           type: string
 *           format: date-time
 *         is_active:
 *           type: boolean
 *         version:
 *           type: string
 *         created_by:
 *           type: object
 *         created_at:
 *           type: string
 *           format: date-time
 *
 *   responses:
 *     RoutingNotFound:
 *       description: Routing not found
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
 *                 example: "Routing not found"
 */

router.use(protect);

/**
 * @swagger
 * /api/routings:
 *   get:
 *     summary: Get all routings with pagination and filtering
 *     tags: [Routing]
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
 *         name: routing_type
 *         schema:
 *           type: string
 *           enum: [Stamping, Busbar, Gasket, Assembly, Toolroom, General]
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: applicable_item
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Routings retrieved successfully
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', getRoutings);

/**
 * @swagger
 * /api/routings/{id}:
 *   get:
 *     summary: Get routing by ID
 *     tags: [Routing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Routing retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Routing'
 *       404:
 *         $ref: '#/components/responses/RoutingNotFound'
 *       401:
 *         description: Not authenticated
 */
router.get('/:id', getRoutingById);

/**
 * @swagger
 * /api/routings:
 *   post:
 *     summary: Create a new routing
 *     tags: [Routing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RoutingCreateRequest'
 *     responses:
 *       201:
 *         description: Routing created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Routing'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.post('/', authorize('admin', 'manager', 'production'), createRouting);

/**
 * @swagger
 * /api/routings/{id}:
 *   put:
 *     summary: Update routing (creates new version)
 *     tags: [Routing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               routing_name:
 *                 type: string
 *               routing_type:
 *                 type: string
 *               applicable_items:
 *                 type: array
 *               operations:
 *                 type: array
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Routing updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         $ref: '#/components/responses/RoutingNotFound'
 */
router.put('/:id', authorize('manager'), updateRouting);

/**
 * @swagger
 * /api/routings/{id}/approve:
 *   post:
 *     summary: Approve routing for production use
 *     tags: [Routing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Routing approved successfully
 *       404:
 *         $ref: '#/components/responses/RoutingNotFound'
 */
router.post('/:id/approve', authorize('manager'), approveRouting);

module.exports = router;