const express = require('express');
const router = express.Router();
const {
  getProcesses,
  getProcess,
  createProcess,
  updateProcess,
  deleteProcess,
  getProcessesDropdown,
  getProcessesByCategory
} = require('../../controllers/CRM/processController');
const { protect } = require('../../middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Processes
 *   description: Process master with categories (Core, Finishing, Packing)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Process:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "64f8e9b7a1b2c3d4e5f6a7b8"
 *         process_id:
 *           type: string
 *           example: "PROC-LASER-001"
 *         process_name:
 *           type: string
 *           example: "Laser Cutting"
 *         category:
 *           type: string
 *           enum: [Core, Finishing, Packing, Other]
 *           example: "Core"
 *         rate_type:
 *           type: string
 *           enum: [Per Kg, Per Nos, Per Hour, Fixed]
 *           example: "Per Nos"
 *         is_active:
 *           type: boolean
 *           example: true
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
 *     ProcessCreate:
 *       type: object
 *       required:
 *         - process_name
 *         - category
 *         - rate_type
 *       properties:
 *         process_id:
 *           type: string
 *           example: "PROC-LASER-001"
 *         process_name:
 *           type: string
 *           example: "Laser Cutting"
 *         category:
 *           type: string
 *           enum: [Core, Finishing, Packing, Other]
 *           example: "Core"
 *         rate_type:
 *           type: string
 *           enum: [Per Kg, Per Nos, Per Hour, Fixed]
 *           example: "Per Nos"
 *
 *     ProcessUpdate:
 *       type: object
 *       properties:
 *         process_name:
 *           type: string
 *         category:
 *           type: string
 *           enum: [Core, Finishing, Packing, Other]
 *         rate_type:
 *           type: string
 *           enum: [Per Kg, Per Nos, Per Hour, Fixed]
 *         is_active:
 *           type: boolean
 *
 *     ProcessDropdown:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         process_id:
 *           type: string
 *         process_name:
 *           type: string
 *         category:
 *           type: string
 *         rate_type:
 *           type: string
 *
 *     ProcessesByCategory:
 *       type: object
 *       properties:
 *         Core:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProcessDropdown'
 *         Finishing:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProcessDropdown'
 *         Packing:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProcessDropdown'
 *         Other:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProcessDropdown'
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
 *       description: Process with this name already exists
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
 *                 example: "process_name already exists"
 *
 *   parameters:
 *     categoryParam:
 *       in: query
 *       name: category
 *       schema:
 *         type: string
 *         enum: [Core, Finishing, Packing, Other]
 *       description: Filter by process category
 *     rateTypeParam:
 *       in: query
 *       name: rate_type
 *       schema:
 *         type: string
 *         enum: [Per Kg, Per Nos, Per Hour, Fixed]
 *       description: Filter by rate type
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/processes:
 *   get:
 *     summary: Get all processes with pagination and filtering
 *     tags: [Processes]
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
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - $ref: '#/components/parameters/categoryParam'
 *       - $ref: '#/components/parameters/rateTypeParam'
 *     responses:
 *       200:
 *         description: Processes retrieved successfully
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
 *                     $ref: '#/components/schemas/Process'
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/', protect, getProcesses);

/**
 * @swagger
 * /api/processes/dropdown:
 *   get:
 *     summary: Get processes for dropdown
 *     tags: [Processes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/categoryParam'
 *     responses:
 *       200:
 *         description: Processes retrieved successfully
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
 *                     $ref: '#/components/schemas/ProcessDropdown'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/dropdown', protect, getProcessesDropdown);

/**
 * @swagger
 * /api/processes/by-category:
 *   get:
 *     summary: Get processes grouped by category
 *     tags: [Processes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Processes grouped by category retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ProcessesByCategory'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/by-category', protect, getProcessesByCategory);

/**
 * @swagger
 * /api/processes/{id}:
 *   get:
 *     summary: Get single process by ID
 *     tags: [Processes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Process ID
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
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Process'
 *       404:
 *         $ref: '#/components/responses/ProcessNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.get('/:id', protect, getProcess);

/**
 * @swagger
 * /api/processes:
 *   post:
 *     summary: Create a new process
 *     tags: [Processes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProcessCreate'
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
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Process'
 *                 message:
 *                   type: string
 *                   example: "Process created successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateProcess'
 *               - $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post('/', protect, createProcess);

/**
 * @swagger
 * /api/processes/{id}:
 *   put:
 *     summary: Update an existing process
 *     tags: [Processes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Process ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProcessUpdate'
 *     responses:
 *       200:
 *         description: Process updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Process'
 *                 message:
 *                   type: string
 *                   example: "Process updated successfully"
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/responses/DuplicateProcess'
 *               - $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/ProcessNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.put('/:id', protect, updateProcess);

/**
 * @swagger
 * /api/processes/{id}:
 *   delete:
 *     summary: Deactivate a process (SOFT DELETE)
 *     tags: [Processes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Process ID
 *     responses:
 *       200:
 *         description: Process deactivated successfully
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
 *                   example: "Process deactivated successfully"
 *       404:
 *         $ref: '#/components/responses/ProcessNotFound'
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.delete('/:id', protect, deleteProcess);

module.exports = router;