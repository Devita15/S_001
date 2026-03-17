const express = require('express');
const router = express.Router();
const {
  applyLeave,
  processLeave,
  getEmployeeLeaves,
  getPendingLeaves,
  cancelLeave,
  getLeaveBalance,
  getLeaveReport,
  updateLeave,
  deleteLeave
} = require('../controllers/leaveController');
const { protect } = require('../../middleware/authMiddleware');


router.use(protect);

/**
 * @swagger
 * tags:
 *   name: Leaves
 *   description: Employee leave management
 */

/**
 * @swagger
 * /api/leaves:
 *   post:
 *     summary: Apply for leave
 *     description: |
 *       Submit a new leave application. The employee ID is automatically taken from the authenticated user token.
 *       No need to provide employeeId in the request body.
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - leaveTypeId
 *               - startDate
 *               - endDate
 *             properties:
 *               leaveTypeId:
 *                 type: string
 *                 description: ID of the leave type
 *                 example: "60d21b4667d0d8992e610c86"
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Start date of leave (YYYY-MM-DD)
 *                 example: "2024-02-15"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: End date of leave (YYYY-MM-DD)
 *                 example: "2024-02-17"
 *               reason:
 *                 type: string
 *                 description: Reason for leave
 *                 example: "Family function"
 *               contactNumber:
 *                 type: string
 *                 description: Contact number during leave
 *                 example: "9876543210"
 *               addressDuringLeave:
 *                 type: string
 *                 description: Address during leave period
 *                 example: "123 Main Street, City, State - 400001"
 *     responses:
 *       201:
 *         description: Leave application submitted successfully
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
 *                   example: "Leave application submitted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "60d21b4667d0d8992e610c87"
 *                     EmployeeID:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         EmployeeID:
 *                           type: string
 *                         FirstName:
 *                           type: string
 *                         LastName:
 *                           type: string
 *                     LeaveTypeID:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         Name:
 *                           type: string
 *                         MaxDaysPerYear:
 *                           type: number
 *                     StartDate:
 *                       type: string
 *                       format: date-time
 *                     EndDate:
 *                       type: string
 *                       format: date-time
 *                     Reason:
 *                       type: string
 *                     ContactNumber:
 *                       type: string
 *                     AddressDuringLeave:
 *                       type: string
 *                     NumberOfDays:
 *                       type: number
 *                       example: 3
 *                     Status:
 *                       type: string
 *                       enum: [Pending, Approved, Rejected, Cancelled]
 *                       example: "Pending"
 *                     AppliedOn:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - Invalid input or insufficient leave balance
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
 *                   examples:
 *                     missingFields:
 *                       value: "leaveTypeId, startDate, and endDate are required"
 *                     invalidDates:
 *                       value: "Start date cannot be after end date"
 *                     pastDate:
 *                       value: "Start date cannot be in the past"
 *                     inactiveLeaveType:
 *                       value: "Leave type not found or inactive"
 *                     insufficientBalance:
 *                       value: "Insufficient leave balance"
 *                     overlappingLeave:
 *                       value: "You already have a leave request for these dates"
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
 *       404:
 *         description: Employee not found
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
 *                   example: "Employee not found"
 *       500:
 *         description: Internal server error
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
 */
router.post('/', protect, applyLeave);

/**
 * @swagger
 * /api/leaves/pending:
 *   get:
 *     summary: Get pending leaves for approval
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *         description: Filter by department
 *       - in: query
 *         name: employeeId
 *         schema:
 *           type: string
 *         description: Filter by employee
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
 *         description: Records per page
 *     responses:
 *       200:
 *         description: Pending leaves retrieved
 */
router.get('/pending', getPendingLeaves);

/**
 * @swagger
 * /api/leaves/employee/{employeeId}:
 *   get:
 *     summary: Get leaves for specific employee
 *     tags: [Leaves]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, Approved, Rejected, Cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering
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
 *         description: Records per page
 *     responses:
 *       200:
 *         description: Employee leaves retrieved
 */
router.get('/employee/:employeeId', getEmployeeLeaves);

/**
 * @swagger
 * /api/leaves/{id}/process:
 *   put:
 *     summary: Approve or reject leave
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Leave ID
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
 *                 enum: [Approved, Rejected]
 *                 example: "Approved"
 *               remarks:
 *                 type: string
 *                 example: "Leave approved"
 *               approvedBy:
 *                 type: string
 *                 example: "60d21b4667d0d8992e610c87"
 *     responses:
 *       200:
 *         description: Leave processed successfully
 *       404:
 *         description: Leave not found
 */
router.put('/:id/process', processLeave);

/**
 * @swagger
 * /api/leaves/{id}/cancel:
 *   put:
 *     summary: Cancel leave request
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Leave ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Plans changed"
 *     responses:
 *       200:
 *         description: Leave cancelled
 *       400:
 *         description: Cannot cancel processed leave
 */
router.put('/:id/cancel', cancelLeave);

/**
 * @swagger
 * /api/leaves/employee/{employeeId}/balance:
 *   get:
 *     summary: Get leave balance for employee
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *     responses:
 *       200:
 *         description: Leave balance retrieved
 */
router.get('/employee/:employeeId/balance', getLeaveBalance);

/**
 * @swagger
 * /api/leaves/report:
 *   get:
 *     summary: Generate leave report
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *         description: Filter by department
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, Approved, Rejected, Cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: Report format
 *     responses:
 *       200:
 *         description: Leave report generated
 *       400:
 *         description: Missing date parameters
 */
router.get('/report', getLeaveReport);

/**
 * @swagger
 * /api/leaves/{id}:
 *   put:
 *     summary: Update a pending leave request
 *     description: Update leave details only when status is "Pending"
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Leave ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               leaveTypeId:
 *                 type: string
 *                 description: ID of the leave type
 *                 example: "60d21b4667d0d8992e610c86"
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Start date of leave (YYYY-MM-DD)
 *                 example: "2024-02-15"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: End date of leave (YYYY-MM-DD)
 *                 example: "2024-02-17"
 *               reason:
 *                 type: string
 *                 description: Reason for leave
 *                 example: "Updated reason - Family function"
 *               contactNumber:
 *                 type: string
 *                 description: Contact number during leave
 *                 example: "9876543210"
 *               addressDuringLeave:
 *                 type: string
 *                 description: Address during leave period
 *                 example: "123 Main Street, City, State - 400001"
 *     responses:
 *       200:
 *         description: Leave request updated successfully
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
 *                   example: "Leave request updated successfully"
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request - Cannot update non-pending leave or validation errors
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
 *                   examples:
 *                     notPending:
 *                       value: "Cannot update leave request with status: Approved"
 *                     invalidDates:
 *                       value: "Start date cannot be after end date"
 *                     pastDate:
 *                       value: "Start date cannot be in the past"
 *       404:
 *         description: Leave request not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id', updateLeave);

/**
 * @swagger
 * /api/leaves/{id}:
 *   delete:
 *     summary: Delete a pending leave request
 *     description: Permanently delete a leave request only when status is "Pending"
 *     tags: [Leaves]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Leave ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for deletion
 *                 example: "No longer needed"
 *     responses:
 *       200:
 *         description: Leave request deleted successfully
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
 *                   example: "Leave request deleted successfully"
 *       400:
 *         description: Bad request - Cannot delete non-pending leave
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
 *                   example: "Cannot delete leave request with status: Approved"
 *       404:
 *         description: Leave request not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', deleteLeave);

module.exports = router;