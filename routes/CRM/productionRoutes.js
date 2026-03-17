const express = require('express');
const router = express.Router();
const ProductionController = require('../controllers/productionController');
const { protect } = require('../../middleware/authMiddleware');

// router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Production
 *   description: Production tracking for piece-rate workers
 */

/**
 * @swagger
 * /api/production/record:
 *   post:
 *     summary: Record production entry for piece-rate worker
 *     tags: [Production]
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
 *               - productCode
 *               - productName
 *               - operation
 *               - totalUnits
 *               - goodUnits
 *             properties:
 *               employeeId:
 *                 type: string
 *                 example: "EMP002"
 *                 description: Employee ID
 *               date:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-02-01T08:00:00Z"
 *                 description: Production date (defaults to current date)
 *               productCode:
 *                 type: string
 *                 example: "WRG-001"
 *               productName:
 *                 type: string
 *                 example: "Wiring Assembly"
 *               operation:
 *                 type: string
 *                 example: "Wire Cutting"
 *               totalUnits:
 *                 type: integer
 *                 example: 250
 *                 minimum: 1
 *               goodUnits:
 *                 type: integer
 *                 example: 245
 *                 minimum: 0
 *               rejectedUnits:
 *                 type: integer
 *                 example: 5
 *                 default: 0
 *                 minimum: 0
 *               reworkUnits:
 *                 type: integer
 *                 example: 0
 *                 default: 0
 *                 minimum: 0
 *               qualityBonus:
 *                 type: number
 *                 example: 50
 *                 default: 0
 *                 minimum: 0
 *               efficiencyBonus:
 *                 type: number
 *                 example: 75
 *                 default: 0
 *                 minimum: 0
 *               startTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-02-01T08:00:00Z"
 *               endTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-02-01T17:00:00Z"
 *               machineId:
 *                 type: string
 *                 example: "MACH-001"
 *               batchNumber:
 *                 type: string
 *                 example: "BATCH-2024-02-01-001"
 *               orderNumber:
 *                 type: string
 *                 example: "ORD-001"
 *               remarks:
 *                 type: string
 *                 example: "Regular production"
 *     responses:
 *       201:
 *         description: Production recorded successfully
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
 *                   example: "Production recorded successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Production'
 *       400:
 *         description: Missing required fields or employee is not piece-rate worker
 *       404:
 *         description: Employee not found
 *       500:
 *         description: Server error
 */
router.post('/record', ProductionController.recordProduction);

/**
 * Get all pending productions
 * Access: Supervisor, Manager, Admin only
 */
/**
 * @swagger
 * /api/production/pending:
 *   get:
 *     summary: Get all pending production records awaiting approval
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 50
 *         description: Number of records per page
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *           example: "2024-02-01"
 *         description: Filter by start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *           example: "2024-02-29"
 *         description: Filter by end date (YYYY-MM-DD)
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *           example: "60d21b4667d0d8992e610c90"
 *         description: Filter by department ID
 *       - in: query
 *         name: employeeId
 *         schema:
 *           type: string
 *           example: "EMP002"
 *         description: Filter by specific employee ID
 *       - in: query
 *         name: searchTerm
 *         schema:
 *           type: string
 *           example: "Wiring"
 *         description: Search by employee name, product code, product name, operation, batch number, or order number
 *     responses:
 *       200:
 *         description: Pending productions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 25
 *                 total:
 *                   type: integer
 *                   example: 150
 *                 totalPages:
 *                   type: integer
 *                   example: 6
 *                 currentPage:
 *                   type: integer
 *                   example: 1
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalRecords:
 *                       type: integer
 *                       example: 150
 *                     totalUnits:
 *                       type: integer
 *                       example: 15000
 *                     totalGoodUnits:
 *                       type: integer
 *                       example: 14750
 *                     totalRejectedUnits:
 *                       type: integer
 *                       example: 250
 *                     totalAmount:
 *                       type: number
 *                       example: 45000
 *                     avgQuality:
 *                       type: number
 *                       example: 98.33
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Production'
 *                       - type: object
 *                         properties:
 *                           CreatedBy:
 *                             type: object
 *                             properties:
 *                               EmployeeID:
 *                                 type: string
 *                               FirstName:
 *                                 type: string
 *                               LastName:
 *                                 type: string
 *       401:
 *         description: Unauthorized - Invalid or missing token
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
 *                   example: "Not authorized, no token"
 *       403:
 *         description: Forbidden - Insufficient permissions
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
 *                   example: "Not authorized to access this resource"
 *       500:
 *         description: Server error
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
 *                   example: "Internal server error"
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */
router.get(
  '/pending',
  ProductionController.getPendingProductions
);

/**
 * @swagger
 * /api/production/employee/{employeeId}:
 *   get:
 *     summary: Get production records for employee within date range
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, Verified, Approved, Rejected, Paid]
 *         description: Filter by production status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: Production records retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 25
 *                 total:
 *                   type: integer
 *                   example: 100
 *                 totalPages:
 *                   type: integer
 *                   example: 4
 *                 currentPage:
 *                   type: integer
 *                   example: 1
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalUnits:
 *                       type: integer
 *                       example: 2500
 *                     goodUnits:
 *                       type: integer
 *                       example: 2450
 *                     rejectedUnits:
 *                       type: integer
 *                       example: 50
 *                     totalAmount:
 *                       type: number
 *                       example: 7350
 *                     qualityBonus:
 *                       type: number
 *                       example: 500
 *                     efficiencyBonus:
 *                       type: number
 *                       example: 750
 *                     count:
 *                       type: integer
 *                       example: 25
 *                     rejectionRate:
 *                       type: number
 *                       example: 2.0
 *                     averageQuality:
 *                       type: number
 *                       example: 98.0
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Production'
 *       400:
 *         description: Missing startDate or endDate parameters
 *       500:
 *         description: Server error
 */
router.get('/employee/:employeeId', ProductionController.getEmployeeProduction);

/**
 * @swagger
 * /api/production/{id}/approve:
 *   put:
 *     summary: Approve, verify or reject production entry
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Production record ID
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
 *                 enum: [Verified, Approved, Rejected]
 *                 example: "Approved"
 *                 description: New status for the production record
 *               remarks:
 *                 type: string
 *                 example: "Quality check passed, all units verified"
 *                 description: Additional remarks for the status change
 *     responses:
 *       200:
 *         description: Production status updated successfully
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
 *                   example: "Production approved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Production'
 *       400:
 *         description: Invalid status value or request body
 *       404:
 *         description: Production record not found
 *       500:
 *         description: Server error
 */
router.put('/:id/approve', ProductionController.approveProduction);

/**
 * @swagger
 * /api/production/payroll:
 *   get:
 *     summary: Get production data for payroll processing
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Month (1-12)
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 2020
 *           maximum: 2100
 *         description: Year
 *       - in: query
 *         name: employeeId
 *         schema:
 *           type: string
 *         description: Filter by specific employee ID
 *     responses:
 *       200:
 *         description: Production data for payroll retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 month:
 *                   type: integer
 *                   example: 2
 *                 year:
 *                   type: integer
 *                   example: 2024
 *                 totalRecords:
 *                   type: integer
 *                   example: 100
 *                 totalEmployees:
 *                   type: integer
 *                   example: 10
 *                 totalEarnings:
 *                   type: number
 *                   example: 150000
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       employee:
 *                         type: object
 *                       productions:
 *                         type: array
 *                         items:
 *                           $ref: '#/components/schemas/Production'
 *                       totalUnits:
 *                         type: integer
 *                       goodUnits:
 *                         type: integer
 *                       totalAmount:
 *                         type: number
 *                       qualityBonus:
 *                         type: number
 *                       efficiencyBonus:
 *                         type: number
 *                       totalEarnings:
 *                         type: number
 *       400:
 *         description: Missing month or year parameters
 *       500:
 *         description: Server error
 */
router.get('/payroll', ProductionController.getProductionForPayroll);

/**
 * @swagger
 * /api/production/mark-paid:
 *   post:
 *     summary: Mark production records as paid (link to salary)
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productionIds
 *               - salaryId
 *             properties:
 *               productionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["60d21b4667d0d8992e610c85", "60d21b4667d0d8992e610c86"]
 *                 description: Array of production record IDs to mark as paid
 *               salaryId:
 *                 type: string
 *                 example: "60d21b4667d0d8992e610c87"
 *                 description: Salary record ID to link the production records to
 *     responses:
 *       200:
 *         description: Production records marked as paid
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
 *                   example: "15 production records marked as paid"
 *                 modifiedCount:
 *                   type: integer
 *                   example: 15
 *       400:
 *         description: Missing required fields or invalid input
 *       500:
 *         description: Server error
 */
router.post('/mark-paid', ProductionController.markAsPaid);

/**
 * @swagger
 * components:
 *   schemas:
 *     Production:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "60d21b4667d0d8992e610c85"
 *         EmployeeID:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             EmployeeID:
 *               type: string
 *               example: "EMP002"
 *             FirstName:
 *               type: string
 *               example: "Ramesh"
 *             LastName:
 *               type: string
 *               example: "Kumar"
 *         Date:
 *           type: string
 *           format: date-time
 *           example: "2024-02-01T00:00:00.000Z"
 *         ProductCode:
 *           type: string
 *           example: "WRG-001"
 *         ProductName:
 *           type: string
 *           example: "Wiring Assembly"
 *         Operation:
 *           type: string
 *           example: "Wire Cutting"
 *         TotalUnits:
 *           type: integer
 *           example: 250
 *         GoodUnits:
 *           type: integer
 *           example: 245
 *         RejectedUnits:
 *           type: integer
 *           example: 5
 *         ReworkUnits:
 *           type: integer
 *           example: 0
 *         TotalAmount:
 *           type: number
 *           example: 750.00
 *         QualityBonus:
 *           type: number
 *           example: 50.00
 *         EfficiencyBonus:
 *           type: number
 *           example: 75.00
 *         QualityPercentage:
 *           type: number
 *           example: 98.0
 *         EfficiencyPercentage:
 *           type: number
 *           example: 110.0
 *         Status:
 *           type: string
 *           enum: [Pending, Verified, Approved, Rejected, Paid]
 *           example: "Approved"
 *         VerifiedBy:
 *           type: object
 *           nullable: true
 *         ApprovedBy:
 *           type: object
 *           nullable: true
 *         VerificationTime:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         ApprovalTime:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         SalaryProcessed:
 *           type: boolean
 *           example: false
 *         SalaryID:
 *           type: string
 *           nullable: true
 *         SalaryPeriod:
 *           type: object
 *           nullable: true
 *           properties:
 *             month:
 *               type: integer
 *             year:
 *               type: integer
 *         Remarks:
 *           type: string
 *           example: "Regular production"
 *         CreatedAt:
 *           type: string
 *           format: date-time
 *         UpdatedAt:
 *           type: string
 *           format: date-time
 *         __v:
 *           type: integer
 *           example: 0
 *         employeeName:
 *           type: string
 *           example: "Ramesh Kumar"
 *         rejectionRate:
 *           type: number
 *           example: 2.0
 *         netUnits:
 *           type: integer
 *           example: 245
 *         earnings:
 *           type: number
 *           example: 875.00
 */

module.exports = router;