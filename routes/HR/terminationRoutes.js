const express = require('express');
const router = express.Router();
const {
  initiateTermination,
  submitFeedback,
  approveTermination,
  getAllTerminations,
  getTerminationById,
  deleteTermination
} = require('../../controllers/HR/terminationController');
const { protect } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/roleMiddleware')
// All routes require authentication
router.use(protect);

/**
 * @swagger
 * components:
 *   schemas:
 *     Termination:
 *       type: object
 *       properties:
 *         terminationId:
 *           type: string
 *           example: "TERM-2024-0001"
 *         employeeId:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             EmployeeID:
 *               type: string
 *             FirstName:
 *               type: string
 *             LastName:
 *               type: string
 *         employeeID:
 *           type: string
 *           example: "EMP001"
 *         initiatorType:
 *           type: string
 *           enum: [HR, EMPLOYEE]
 *         terminationType:
 *           type: string
 *           enum: [termination, resignation, retirement]
 *         reason:
 *           type: string
 *         lastWorkingDay:
 *           type: string
 *           format: date
 *         status:
 *           type: string
 *           enum: [pending_review, approved, rejected, cancelled]
 *         feedback:
 *           type: object
 *           properties:
 *             submitted:
 *               type: boolean
 *             submittedAt:
 *               type: string
 *               format: date-time
 *             exitInterview:
 *               type: object
 *               properties:
 *                 reasonForLeaving:
 *                   type: string
 *                 experienceWithCompany:
 *                   type: string
 *                   enum: [excellent, good, average, poor]
 *                 wouldRecommend:
 *                   type: boolean
 *                 feedbackDetails:
 *                   type: string
 *                 suggestionsForImprovement:
 *                   type: string
 *                 rehireEligible:
 *                   type: boolean
 *         approvalDetails:
 *           type: object
 *           properties:
 *             approvedBy:
 *               type: object
 *             approvedAt:
 *               type: string
 *               format: date-time
 *             comments:
 *               type: string
 *         documents:
 *           type: object
 *           properties:
 *             experienceLetter:
 *               type: object
 *               properties:
 *                 generated:
 *                   type: boolean
 *                 path:
 *                   type: string
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *             relievingLetter:
 *               type: object
 *               properties:
 *                 generated:
 *                   type: boolean
 *                 path:
 *                   type: string
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *         settlementDetails:
 *           type: object
 *           properties:
 *             payrollNotified:
 *               type: boolean
 *             notifiedAt:
 *               type: string
 *               format: date-time
 *             finalSettlementAmount:
 *               type: number
 *             settlementDate:
 *               type: string
 *               format: date
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     InitiateTerminationRequest:
 *       type: object
 *       required:
 *         - employeeId
 *         - reason
 *         - lastWorkingDay
 *         - terminationType
 *         - initiatorType
 *       properties:
 *         employeeId:
 *           type: string
 *           example: "EMP001"
 *         reason:
 *           type: string
 *           example: "Performance issues"
 *         lastWorkingDay:
 *           type: string
 *           format: date
 *           example: "2024-09-30"
 *         terminationType:
 *           type: string
 *           enum: [termination, resignation, retirement]
 *           example: "termination"
 *         initiatorType:
 *           type: string
 *           enum: [HR, EMPLOYEE]
 *           example: "HR"
 *     
 *     FeedbackRequest:
 *       type: object
 *       required:
 *         - reasonForLeaving
 *         - experienceWithCompany
 *         - wouldRecommend
 *       properties:
 *         reasonForLeaving:
 *           type: string
 *           example: "Career growth opportunity"
 *         experienceWithCompany:
 *           type: string
 *           enum: [excellent, good, average, poor]
 *           example: "good"
 *         wouldRecommend:
 *           type: boolean
 *           example: true
 *         feedbackDetails:
 *           type: string
 *           example: "Great work environment but limited growth opportunities"
 *         suggestionsForImprovement:
 *           type: string
 *           example: "More training programs and clear career path"
 *         rehireEligible:
 *           type: boolean
 *           example: true
 *     
 *     ApproveRequest:
 *       type: object
 *       properties:
 *         comments:
 *           type: string
 *           example: "Approved with all formalities completed"
 *     
 *     ApiResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *         message:
 *           type: string
 *         count:
 *           type: integer
 *     
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * tags:
 *   name: Terminations
 *   description: Employee termination and resignation management
 */

/**
 * @swagger
 * /api/terminations:
 *   get:
 *     summary: Get all termination records with optional filters
 *     tags: [Terminations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending_review, approved, rejected, cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [termination, resignation, retirement]
 *         description: Filter by termination type
 *       - in: query
 *         name: initiator
 *         schema:
 *           type: string
 *           enum: [HR, EMPLOYEE]
 *         description: Filter by initiator type
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: Termination records retrieved successfully
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
 *                   example: 5
 *                 totalPages:
 *                   type: integer
 *                   example: 1
 *                 currentPage:
 *                   type: integer
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Termination'
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden - HR/Manager only
 *       500:
 *         description: Server error
 */
router.get('/', getAllTerminations);

/**
 * @swagger
 * /api/terminations/initiate:
 *   post:
 *     summary: Initiate termination or resignation process
 *     tags: [Terminations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InitiateTerminationRequest'
 *     responses:
 *       201:
 *         description: Process initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Termination'
 *                 message:
 *                   type: string
 *                   example: Termination initiated successfully
 *       400:
 *         description: Bad request - Employee not found or already terminated
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/initiate', initiateTermination);

/**
 * @swagger
 * /api/terminations/{terminationId}:
 *   get:
 *     summary: Get single termination record by ID
 *     tags: [Terminations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: terminationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Termination ID (e.g., TERM-2024-0001)
 *         example: "TERM-2024-0001"
 *     responses:
 *       200:
 *         description: Termination record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Termination'
 *       404:
 *         description: Termination record not found
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.get('/:terminationId', getTerminationById);

/**
 * @swagger
 * /api/terminations/{terminationId}/feedback:
 *   post:
 *     summary: Submit exit interview feedback
 *     tags: [Terminations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: terminationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Termination ID
 *         example: "TERM-2024-0001"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FeedbackRequest'
 *     responses:
 *       200:
 *         description: Feedback submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Termination'
 *                 message:
 *                   type: string
 *                   example: Feedback submitted successfully
 *       400:
 *         description: Bad request - Feedback already submitted
 *       404:
 *         description: Termination record not found
 *       401:
 *         description: Not authorized
 *       500:
 *         description: Server error
 */
router.post('/:terminationId/feedback', submitFeedback);

/**
 * @swagger
 * /api/terminations/{terminationId}/approve:
 *   post:
 *     summary: Approve termination/resignation
 *     tags: [Terminations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: terminationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Termination ID
 *         example: "TERM-2024-0001"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ApproveRequest'
 *     responses:
 *       200:
 *         description: Termination approved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Termination'
 *                 message:
 *                   type: string
 *                   example: Termination approved successfully
 *       400:
 *         description: Bad request - Already approved or missing feedback
 *       404:
 *         description: Termination record not found
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden - HR/Manager only
 *       500:
 *         description: Server error
 */
router.post('/:terminationId/approve', approveTermination);

/**
 * @swagger
 * /api/terminations/{terminationId}:
 *   delete:
 *     summary: Delete termination record (Admin only)
 *     tags: [Terminations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: terminationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Termination ID
 *         example: "TERM-2024-0001"
 *     responses:
 *       200:
 *         description: Termination record deleted successfully
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
 *                   example: Termination record deleted successfully
 *       404:
 *         description: Termination record not found
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden - Admin only
 *       500:
 *         description: Server error
 */
router.delete('/:terminationId', deleteTermination);

module.exports = router;