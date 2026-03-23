const express = require('express');
const router = express.Router();
const {
  createProcess,
  getProcesses,
  getProcessById,
  updateProcess
} = require('../../controllers/BOM/processMasterController');
const { protect, authorize } = require('../../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: ProcessMaster
 *   description: Process master management - Phase 04
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ProcessMaster:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         process_id:
 *           type: string
 *           example: "PRC-000001"
 *         process_name:
 *           type: string
 *           example: "Laser Cutting"
 *         process_category:
 *           type: string
 *           enum: [Cutting, Stamping, Drilling, Deburring, Plating, Heat Treatment, Welding, Assembly, Inspection, Packing]
 *         rate_type:
 *           type: string
 *           enum: [Per Nos, Per Kg, Per Hour, Fixed]
 *         standard_rate:
 *           type: number
 *         machine_type_required:
 *           type: string
 *           enum: [Press, CNC, Lathe, Milling, Drilling, Grinding, Welding, Bending, Laser Cutting, Plating, Assembly, Inspection, None]
 *         skill_required:
 *           type: string
 *         default_setup_time_min:
 *           type: number
 *         default_run_time_min:
 *           type: number
 *         default_scrap_pct:
 *           type: number
 *         description:
 *           type: string
 *         is_subcontract_allowed:
 *           type: boolean
 *         is_active:
 *           type: boolean
 *
 *     ProcessMasterCreateRequest:
 *       type: object
 *       required:
 *         - process_name
 *         - process_category
 *         - rate_type
 *         - standard_rate
 *       properties:
 *         process_name:
 *           type: string
 *         process_category:
 *           type: string
 *         rate_type:
 *           type: string
 *         standard_rate:
 *           type: number
 *         machine_type_required:
 *           type: string
 *         skill_required:
 *           type: string
 *         default_setup_time_min:
 *           type: number
 *         default_run_time_min:
 *           type: number
 *         default_scrap_pct:
 *           type: number
 *         description:
 *           type: string
 *         is_subcontract_allowed:
 *           type: boolean
 *
 *   responses:
 *     ProcessNotFound:
 *       description: Process not found
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
 *                 example: "Process not found"
 *
 *     DuplicateProcess:
 *       description: Process name already exists
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
 *                 example: "Process name Laser Cutting already exists"
 */

router.use(protect);

/**
 * @swagger
 * /api/process-master:
 *   get:
 *     summary: Get all processes with pagination and filtering
 *     tags: [ProcessMaster]
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
 *         name: process_category
 *         schema:
 *           type: string
 *       - in: query
 *         name: rate_type
 *         schema:
 *           type: string
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Processes retrieved successfully
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', getProcesses);

/**
 * @swagger
 * /api/process-master/{id}:
 *   get:
 *     summary: Get process by ID
 *     tags: [ProcessMaster]
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
 *         description: Process retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ProcessMaster'
 *       404:
 *         $ref: '#/components/responses/ProcessNotFound'
 */
router.get('/:id', getProcessById);

/**
 * @swagger
 * /api/process-master:
 *   post:
 *     summary: Create a new process
 *     tags: [ProcessMaster]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProcessMasterCreateRequest'
 *     responses:
 *       201:
 *         description: Process created successfully
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
 *                   $ref: '#/components/schemas/ProcessMaster'
 *       400:
 *         $ref: '#/components/responses/DuplicateProcess'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Insufficient permissions
 */
router.post('/', authorize('admin', 'manager'), createProcess);

/**
 * @swagger
 * /api/process-master/{id}:
 *   put:
 *     summary: Update an existing process
 *     tags: [ProcessMaster]
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
 *         description: Process updated successfully
 *       400:
 *         $ref: '#/components/responses/DuplicateProcess'
 *       404:
 *         $ref: '#/components/responses/ProcessNotFound'
 */
router.put('/:id', authorize('manager'), updateProcess);

module.exports = router;