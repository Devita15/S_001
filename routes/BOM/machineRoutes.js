const express = require('express');
const router = express.Router();
const {
  createMachine,
  getMachines,
  getMachineById,
  updateMachine,
  updateMachineStatus,
  getCapacityReport
} = require('../../controllers/BOM/machineController');
const { protect, authorize } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Machine
 *   description: Machine master management - Phase 04
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Machine:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         machine_id:
 *           type: string
 *           example: "MCH-000015"
 *         machine_name:
 *           type: string
 *           example: "Minster 80T Progressive Press"
 *         machine_code:
 *           type: string
 *           example: "PR-80T-01"
 *         machine_type:
 *           type: string
 *           enum: [Press, CNC, Lathe, Milling, Drilling, Grinding, Welding, Bending, Laser Cutting, Plating, Assembly, Inspection, Other]
 *         capacity_value:
 *           type: number
 *           example: 80
 *         capacity_unit:
 *           type: string
 *           enum: [Ton, kW, mm, SPM, RPM, Liters, None]
 *           default: "None"
 *         work_centre:
 *           type: string
 *           example: "Press Shop"
 *         shifts_per_day:
 *           type: integer
 *           default: 2
 *         hours_per_shift:
 *           type: integer
 *           default: 8
 *         available_hours_per_day:
 *           type: integer
 *         oee_target_percent:
 *           type: integer
 *           default: 75
 *         status:
 *           type: string
 *           enum: [Active, Idle, Under Maintenance, Breakdown, Decommissioned]
 *           default: "Active"
 *         make:
 *           type: string
 *         model:
 *           type: string
 *         serial_number:
 *           type: string
 *         installation_date:
 *           type: string
 *           format: date
 *         location:
 *           type: string
 *         operating_cost_per_hour:
 *           type: number
 *           default: 0
 *         is_active:
 *           type: boolean
 *           default: true
 *
 *     MachineCreateRequest:
 *       type: object
 *       required:
 *         - machine_name
 *         - machine_code
 *         - machine_type
 *         - work_centre
 *       properties:
 *         machine_name:
 *           type: string
 *         machine_code:
 *           type: string
 *         machine_type:
 *           type: string
 *         capacity_value:
 *           type: number
 *         capacity_unit:
 *           type: string
 *         work_centre:
 *           type: string
 *         shifts_per_day:
 *           type: integer
 *         hours_per_shift:
 *           type: integer
 *         oee_target_percent:
 *           type: integer
 *         make:
 *           type: string
 *         model:
 *           type: string
 *         serial_number:
 *           type: string
 *         installation_date:
 *           type: string
 *           format: date
 *         location:
 *           type: string
 *         operating_cost_per_hour:
 *           type: number
 *
 *   responses:
 *     MachineNotFound:
 *       description: Machine not found
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
 *                 example: "Machine not found"
 *
 *     DuplicateMachineCode:
 *       description: Machine code already exists
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
 *                 example: "Machine code PR-80T-01 already exists"
 */

router.use(protect);

/**
 * @swagger
 * /api/machines:
 *   get:
 *     summary: Get all machines with pagination and filtering
 *     tags: [Machine]
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
 *         name: machine_type
 *         schema:
 *           type: string
 *       - in: query
 *         name: work_centre
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Machines retrieved successfully
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', getMachines);

/**
 * @swagger
 * /api/machines/capacity-report:
 *   get:
 *     summary: Get machine capacity report
 *     tags: [Machine]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Capacity report retrieved successfully
 */
router.get('/capacity-report', getCapacityReport);

/**
 * @swagger
 * /api/machines/{id}:
 *   get:
 *     summary: Get machine by ID
 *     tags: [Machine]
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
 *         description: Machine retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Machine'
 *       404:
 *         $ref: '#/components/responses/MachineNotFound'
 */
router.get('/:id', getMachineById);

/**
 * @swagger
 * /api/machines:
 *   post:
 *     summary: Create a new machine
 *     tags: [Machine]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MachineCreateRequest'
 *     responses:
 *       201:
 *         description: Machine created successfully
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
 *                   $ref: '#/components/schemas/Machine'
 *       400:
 *         $ref: '#/components/responses/DuplicateMachineCode'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.post('/', authorize('admin', 'manager'), createMachine);

/**
 * @swagger
 * /api/machines/{id}:
 *   put:
 *     summary: Update an existing machine
 *     tags: [Machine]
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
 *     responses:
 *       200:
 *         description: Machine updated successfully
 *       400:
 *         $ref: '#/components/responses/DuplicateMachineCode'
 *       404:
 *         $ref: '#/components/responses/MachineNotFound'
 */
router.put('/:id', authorize('manager'), updateMachine);

/**
 * @swagger
 * /api/machines/{id}/status:
 *   put:
 *     summary: Update machine status
 *     tags: [Machine]
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
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Active, Idle, Under Maintenance, Breakdown, Decommissioned]
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       404:
 *         $ref: '#/components/responses/MachineNotFound'
 */
router.put('/:id/status', authorize('manager'), updateMachineStatus);

module.exports = router;