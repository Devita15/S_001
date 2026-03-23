// routes/HR/shiftRoutes.js
const express = require('express');
const router = express.Router();
const shiftController =require("../../controllers/HR/shiftController");
const {protect} =require("../../middleware/authMiddleware");
router.use(protect);

/**
 * @swagger
 * /api/shifts:
 *   post:
 *     summary: Create a new shift
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ShiftName
 *               - Code
 *               - StartTime
 *               - EndTime
 *             properties:
 *               ShiftName:
 *                 type: string
 *                 example: "Morning Shift"
 *               Code:
 *                 type: string
 *                 example: "MS"
 *               StartTime:
 *                 type: string
 *                 pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
 *                 example: "09:00"
 *               EndTime:
 *                 type: string
 *                 pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
 *                 example: "18:00"
 *               GracePeriod:
 *                 type: number
 *                 example: 15
 *               LateThreshold:
 *                 type: number
 *                 example: 30
 *               BreakDuration:
 *                 type: number
 *                 example: 60
 *               OvertimeRules:
 *                 type: object
 *                 properties:
 *                   DailyThreshold:
 *                     type: number
 *                     example: 9
 *                   WeeklyThreshold:
 *                     type: number
 *                     example: 48
 *                   RateMultiplier:
 *                     type: number
 *                     example: 1.5
 *               ApplicableDepartments:
 *                 type: array
 *                 items:
 *                   type: string
 *               IsActive:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Shift created successfully
 */
router.post('/', shiftController.createShift);

/**
 * @swagger
 * /api/shifts:
 *   get:
 *     summary: Get all shifts
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Shifts retrieved successfully
 */
router.get('/', shiftController.getAllShifts);

/**
 * @swagger
 * /api/shifts/{id}:
 *   get:
 *     summary: Get shift by ID
 *     tags: [Shifts]
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
 *         description: Shift retrieved
 */
router.get('/:id', shiftController.getShiftById);

/**
 * @swagger
 * /api/shifts/{id}:
 *   put:
 *     summary: Update shift
 *     tags: [Shifts]
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
 *               ShiftName:
 *                 type: string
 *               Code:
 *                 type: string
 *               StartTime:
 *                 type: string
 *               EndTime:
 *                 type: string
 *               GracePeriod:
 *                 type: number
 *               IsActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Shift updated successfully
 */
router.put('/:id', shiftController.updateShift);

/**
 * @swagger
 * /api/shifts/{id}:
 *   delete:
 *     summary: Delete shift
 *     tags: [Shifts]
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
 *         description: Shift deleted successfully
 */
router.delete('/:id', shiftController.deleteShift);

/**
 * @swagger
 * /api/shifts/assign:
 *   post:
 *     summary: Assign shift to employee
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employeeId
 *               - shiftId
 *             properties:
 *               employeeId:
 *                 type: string
 *               shiftId:
 *                 type: string
 *               effectiveFrom:
 *                 type: string
 *                 format: date-time
 *               effectiveTo:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Shift assigned successfully
 */
router.post('/assign', shiftController.assignShift);

/**
 * @swagger
 * /api/shifts/employee/{employeeId}:
 *   get:
 *     summary: Get employee's current shift
 *     tags: [Shifts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Date to check shift for
 *     responses:
 *       200:
 *         description: Employee shift retrieved
 */
router.get('/employee/:employeeId', shiftController.getEmployeeShift);

module.exports = router;